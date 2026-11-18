import fs from "node:fs/promises";
import path from "node:path";
import { FPS } from "../shared/episode";
import { CLIP_BOX, type HostProps } from "../shared/weekly";
import { durationOf, ffmpeg } from "./audio";
import { config, ROOT } from "./config";
import { fetchEpisode } from "./episodeSource";
import { loadHistory, type HistoryEntry } from "./history";
import { mouthCues } from "./lipsync";
import { renderHostSegment, renderWideStill } from "./render";
import { voiceEpisode } from "./tts";
import { nextLocalTime, setThumbnail, uploadLongForm } from "./upload";
import { writeWeeklyScript, type HostLine, type WeeklyEpisode } from "./weeklyScript";

/**
 * Weekly long-form compilation (16:9): Sketch Man hosts the week's Shorts.
 *
 *   npm run weekly                      full run: build, upload, schedule for WEEKLY_PUBLISH_TIME
 *   npm run weekly -- --no-upload       build only (out/weekly-<date>/weekly.mp4)
 *   npm run weekly -- --if-not-done     do nothing if this week's video already exists (scheduled runs)
 *   npm run weekly -- --tts=espeak      offline robot voice (testing only)
 *   npm run weekly -- --clips=dir       use the .mp4 files in dir instead of fetching episodes (testing)
 */

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"] as const;
  }),
);
if (args.has("tts")) config.ttsProvider = args.get("tts") as typeof config.ttsProvider;

const WEEKLY_FILE = path.join(ROOT, "data/weekly.json");
type WeeklyEntry = { week: string; title: string; videoId?: string; publishAt?: string; episodes: string[] };

const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function notice(title: string, body: string) {
  if (!process.env.GITHUB_ACTIONS) return;
  const clean = (s: string) => s.replace(/[\r\n%]/g, " ");
  console.log(`::notice title=${clean(title).replace(/[:,]/g, " ")}::${clean(body).slice(0, 900)}`);
}

const ts = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

async function loadWeekly(): Promise<WeeklyEntry[]> {
  try {
    return JSON.parse(await fs.readFile(WEEKLY_FILE, "utf8"));
  } catch {
    return [];
  }
}

/** Episodes whose publish slot falls in the last `days` days (already public), one per slot, oldest first. */
function pickSlots(history: HistoryEntry[], days: number, now = Date.now()): HistoryEntry[][] {
  const bySlot = new Map<string, HistoryEntry[]>();
  for (const e of history) {
    const at = new Date(e.publishAt ?? `${e.date}T14:00:00Z`).getTime();
    if (at > now || at <= now - days * 86400_000) continue;
    const key = e.publishAt ?? e.date; // one entry per slot (several a day)
    // Entries with a YouTube id first (the original), duplicates after.
    const list = bySlot.get(key) ?? [];
    list.push(e);
    list.sort((a, b) => Number(!!b.videoId) - Number(!!a.videoId));
    bySlot.set(key, list);
  }
  return [...bySlot.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
}

/** Re-encode to one common format so the parts can be joined without re-encoding again. */
const COMMON = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-r", String(FPS), "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"];

async function normalize(input: string, output: string): Promise<void> {
  await ffmpeg(["-i", input, "-vf", "scale=1920:1080,setsar=1", "-af", "aresample=48000", ...COMMON, output]);
}

/** Put a 9:16 episode in the middle of its 16:9 frame. */
async function composeClip(framePng: string, clip: string, output: string): Promise<void> {
  const { w, h, x, y } = CLIP_BOX;
  await ffmpeg([
    "-loop", "1", "-framerate", String(FPS), "-i", framePng,
    "-i", clip,
    "-filter_complex",
    `[1:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=0x1B1B1B,setsar=1,fps=${FPS}[c];` +
      `[0:v][c]overlay=${x}:${y}:shortest=1,format=yuv420p[v];[1:a]aresample=48000,loudnorm=I=-16:TP=-1.5:LRA=11[a]`,
    "-map", "[v]", "-map", "[a]", "-shortest",
    ...COMMON, output,
  ]);
}

async function main() {
  const t0 = Date.now();
  const off = config.publishUtcOffset * 3600_000;
  const localNow = new Date(Date.now() + off);
  const week = localNow.toISOString().slice(0, 10);
  const weekly = await loadWeekly();

  if (args.has("if-not-done") && weekly.some((w) => w.week === week && w.videoId)) {
    console.log(`Weekly video for ${week} already uploaded. Nothing to do.`);
    notice("Already done", `Weekly video for ${week} exists`);
    return;
  }

  const runDir = path.join(config.paths.out, `weekly-${week}`);
  const publicDir = path.join(runDir, "public");
  const parts = path.join(runDir, "parts");
  await fs.mkdir(publicDir, { recursive: true });
  await fs.mkdir(parts, { recursive: true });

  // 1. Collect the week's episodes
  type Ep = WeeklyEpisode & { file: string; date: string };
  const eps: Ep[] = [];
  if (args.has("clips")) {
    const dir = args.get("clips")!;
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".mp4")).sort();
    files.forEach((f, i) => {
      const d = new Date(Date.now() - (files.length - i) * 86400_000 + off);
      eps.push({ day: DAYS[d.getUTCDay()], date: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`, title: f, theme: "a relatable everyday disaster", file: path.join(dir, f) });
    });
  } else {
    const days = Number(process.env.WEEKLY_DAYS || "7");
    for (const slot of pickSlots(await loadHistory(), days)) {
      const got = await fetchEpisode(slot, parts);
      const e = got?.entry ?? slot[0];
      const d = new Date(new Date(e.publishAt ?? `${e.date}T14:00:00Z`).getTime() + off);
      if (!got) {
        console.warn(`  ${e.title}: video not found (archive or Facebook); skipped`);
        continue;
      }
      console.log(`  ${DAYS[d.getUTCDay()]}: ${e.title} (from ${got.from})`);
      eps.push({ day: DAYS[d.getUTCDay()], date: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`, title: e.title, theme: e.theme, pov: e.pov, file: got.file });
    }
  }
  const min = Number(process.env.WEEKLY_MIN_EPISODES || "3");
  if (eps.length < min) {
    console.log(`Only ${eps.length} episode(s) found for the week; need ${min}. Skipping.`);
    notice("Weekly skipped", `only ${eps.length} episodes found`);
    return;
  }

  // 2. Host script and voice
  const weekLabel = `Week of ${eps[0].date}`;
  const script = await writeWeeklyScript(eps, weekLabel);
  console.log(`Weekly: "${script.title}" — ${eps.length} memes`);
  const lines: HostLine[] = [script.intro, ...script.bridges, script.outro];
  const wavs = lines.map((_, i) => path.join(publicDir, `host-${String(i).padStart(2, "0")}.wav`));
  const voiced = await voiceEpisode(lines.map((l) => l.line), wavs, config.voices.sketch, "sketch");

  // 3. Render host segments + framed clips
  const segs: { file: string; chapter?: string }[] = [];
  for (const [i, l] of lines.entries()) {
    const v = voiced[i];
    const isIntro = i === 0;
    const isOutro = i === lines.length - 1;
    const ep = !isIntro && !isOutro ? eps[i - 1] : undefined;
    const props: HostProps = {
      fps: FPS,
      line: l.line,
      audioFile: path.basename(v.wavPath),
      duration: v.duration,
      hold: isOutro ? 8 : 0.5, // outro leaves room for YouTube end-screen elements
      words: v.words,
      mouthCues: await mouthCues(v.wavPath, l.line),
      expression: l.expression,
      action: l.action,
      heading: isIntro ? "THIS WEEK" : isOutro ? "SEE YOU TOMORROW" : ep!.day,
      sub: isIntro ? `${eps.length} memes · ${weekLabel}` : isOutro ? "New meme every day · 7 PM" : ep!.date,
      watermark: config.watermark,
    };
    const raw = path.join(parts, `host-${i}.raw.mp4`);
    await renderHostSegment(props, publicDir, raw);
    const host = path.join(parts, `${String(i * 2).padStart(3, "0")}-host.mp4`);
    await normalize(raw, host);
    segs.push({ file: host, chapter: isIntro ? "Intro" : isOutro ? "Outro" : `${ep!.day[0]}${ep!.day.slice(1).toLowerCase()}: ${ep!.title.replace(/\s*#shorts\b/i, "")}` });
    console.log(`  host ${i + 1}/${lines.length} rendered`);
    if (ep) {
      const png = path.join(parts, `frame-${i}.png`);
      await renderWideStill("ClipFrame", { day: ep.day, date: ep.date, pov: ep.pov ?? ep.title.replace(/\s*#shorts\b/i, ""), index: i, total: eps.length, watermark: config.watermark }, publicDir, png);
      const clip = path.join(parts, `${String(i * 2 + 1).padStart(3, "0")}-clip.mp4`);
      await composeClip(png, ep.file, clip);
      segs.push({ file: clip });
    }
  }

  // 4. Join, chapters
  const list = path.join(parts, "list.txt");
  await fs.writeFile(list, segs.map((s) => `file '${s.file.replace(/'/g, "'\\''")}'`).join("\n"));
  const mp4 = path.join(runDir, "weekly.mp4");
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", mp4]);
  let t = 0;
  const chapters: string[] = [];
  for (const s of segs) {
    if (s.chapter) chapters.push(`${ts(t)} ${s.chapter}`);
    t += await durationOf(s.file);
  }
  console.log(`  saved ${path.relative(process.cwd(), mp4)} (${ts(t)})`);

  const thumbPng = path.join(runDir, "thumbnail.png");
  const thumbJpg = path.join(runDir, "thumbnail.jpg");
  await renderWideStill("WeeklyThumb", { text: script.thumbnailText, sub: weekLabel.toUpperCase() }, publicDir, thumbPng);
  await ffmpeg(["-i", thumbPng, "-vf", "scale=1280:720", "-q:v", "3", thumbJpg]);

  const description = `${script.description}

${chapters.join("\n")}

Sketch Man vs. everyday life. A new hand-drawn meme every day at 7 PM (PKT).

#SketchMan #Memes #Relatable #Animation #Compilation`;
  await fs.writeFile(path.join(runDir, "description.txt"), description);
  notice(script.title, `${eps.length} memes, ${ts(t)} long`);

  // 5. Upload
  if (args.has("no-upload")) {
    console.log("Upload: skipped (--no-upload)");
  } else {
    const publishAt = nextLocalTime(process.env.WEEKLY_PUBLISH_TIME || "21:00");
    const { videoId, publishAt: at } = await uploadLongForm(mp4, { title: script.title, description, tags: script.tags }, publishAt);
    console.log(`Upload: https://youtube.com/watch?v=${videoId}${at ? ` (goes public ${at})` : ""}`);
    notice("Weekly uploaded", `https://youtube.com/watch?v=${videoId}${at ? ` public at ${at}` : ""}`);
    weekly.push({ week, title: script.title, videoId, publishAt: at, episodes: eps.map((e) => e.title) });
    await fs.writeFile(WEEKLY_FILE, JSON.stringify(weekly, null, 2) + "\n");
    try {
      await setThumbnail(videoId, thumbJpg);
      console.log("  thumbnail set");
    } catch (err) {
      const msg = String((err as Error)?.message ?? err).slice(0, 300);
      console.warn(`  Thumbnail not set: ${msg}`);
      if (process.env.GITHUB_ACTIONS) console.log(`::warning title=Thumbnail not set::${msg.replace(/[\r\n%]/g, " ")} (custom thumbnails need a phone-verified channel)`);
    }
  }
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

main().catch((err) => {
  console.error(err);
  if (process.env.GITHUB_ACTIONS) {
    const msg = String((err as Error)?.message ?? err).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A").slice(0, 1500);
    console.log(`::error title=Weekly video failed::${msg}`);
  }
  process.exit(1);
});
