import fs from "node:fs/promises";
import path from "node:path";
import { EpisodeScript, FPS, SILENT_BEAT_SECONDS, type EpisodeProps, type RenderedBeat, type Speaker } from "../shared/episode";
import { computeTimeline } from "../shared/timeline";
import { config } from "./config";
import { appendHistory, loadHistory, updateLastHistory, type HistoryEntry } from "./history";
import { mouthCues } from "./lipsync";
import { renderEpisode, renderMemePhoto, renderStoryImage } from "./render";
import { writeScript } from "./script";
import { makeSfx } from "./sfx";
import { trendingNotes } from "./trends";
import { voiceDialogue, voiceEpisode, type Voiced } from "./tts";
import { facebookConfigured, facebookParts, postFacebookPhoto, postFacebookStory, uploadFacebookReel } from "./facebook";
import { publishAtIso, uploadShort } from "./upload";

/**
 * One full episode: trends → script → voices → lip sync → sound effects → render → upload.
 *
 *   npm run episode                       full daily run
 *   npm run episode -- --no-upload        everything except uploading
 *   npm run episode -- --no-facebook      YouTube only
 *   npm run episode -- --if-slot-free     do nothing if the next publish slot already has an episode
 *   npm run episode -- --facebook-only    Facebook only (test path, nothing saved to history)
 *   npm run episode -- --sample           skip the writer, use data/sample-episode.json
 *   npm run episode -- --tts=espeak       offline robot voices (testing only)
 *   npm run episode -- --script=path.json use a hand-written script
 */

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"] as const;
  }),
);
if (args.has("tts")) config.ttsProvider = args.get("tts") as typeof config.ttsProvider;

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "episode";

async function pickMusic(publicDir: string): Promise<string | undefined> {
  try {
    const files = (await fs.readdir(config.paths.music)).filter((f) => /\.(mp3|wav|m4a|ogg)$/i.test(f));
    if (!files.length) return undefined;
    const f = files[Math.floor(Math.random() * files.length)];
    await fs.copyFile(path.join(config.paths.music, f), path.join(publicDir, `music${path.extname(f)}`));
    return `music${path.extname(f)}`;
  } catch {
    return undefined;
  }
}

function notice(title: string, body: string) {
  if (!process.env.GITHUB_ACTIONS) return;
  const clean = (s: string) => s.replace(/[\r\n%]/g, " ");
  console.log(`::notice title=${clean(title).replace(/[:,]/g, " ")}::${clean(body).slice(0, 900)}`);
}

async function main() {
  const t0 = Date.now();
  const date = new Date().toISOString().slice(0, 10);
  const history = await loadHistory();
  const takenSlots = history.map((h) => h.publishAt).filter((s): s is string => Boolean(s));

  // Scheduled runs fire several times a day because GitHub often starts cron jobs late or not at all.
  // Only the first one that finds the next publish slot empty makes an episode.
  if (args.has("if-slot-free")) {
    const slot = publishAtIso();
    const taken = history.find((h) => h.publishAt === slot);
    if (taken) {
      console.log(`Slot ${slot} already has "${taken.title}". Nothing to do.`);
      notice("Already scheduled", `${slot} has ${taken.title}`);
      return;
    }
    console.log(`Slot ${slot} is free; making an episode for it.`);
  }

  // 1. Script (with this week's trends)
  let script: EpisodeScript;
  const scriptPath = args.get("script") ?? (args.has("sample") ? config.paths.sample : undefined);
  if (scriptPath) {
    script = EpisodeScript.parse(JSON.parse(await fs.readFile(scriptPath, "utf8")));
    console.log(`Script: loaded ${path.relative(process.cwd(), scriptPath)}`);
  } else {
    console.log("Trends: searching what's hot this week…");
    const trends = await trendingNotes();
    console.log(trends ? `  ${trends.split("\n").length} trend notes` : "  none (evergreen episode)");
    console.log(`Script: asking ${config.scriptProvider === "claude" ? config.anthropicModel : config.geminiTextModel}…`);
    script = await writeScript(history, trends);
  }
  console.log(`  "${script.title}" — ${script.pov} — ${script.beats.length} beats`);
  notice(script.title, `${script.pov} | ${script.beats.map((b) => `${b.speaker}: ${b.line || "(reaction)"}`).join(" / ")}`);

  const runDir = path.join(config.paths.out, `${date}-${slug(script.title)}`);
  const publicDir = path.join(runDir, "public");
  await fs.mkdir(publicDir, { recursive: true });
  await fs.writeFile(path.join(runDir, "script.json"), JSON.stringify(script, null, 2));

  // 2. Voices: one request per character (all of their lines at once), then lip sync per line.
  const voiced = new Map<number, Voiced & { file: string }>();
  const fileFor = (i: number) => `line-${String(i + 1).padStart(2, "0")}.wav`;
  // First try: the whole skit as one natural two-voice conversation.
  const spoken = script.beats.map((b, i) => (b.line.trim() ? i : -1)).filter((i) => i >= 0);
  const dialogue = await voiceDialogue(
    spoken.map((i) => ({ speaker: script.beats[i].speaker, line: script.beats[i].line, expression: script.beats[i].expression })),
    spoken.map((i) => path.join(publicDir, fileFor(i))),
    config.voices,
  );
  if (dialogue) spoken.forEach((beatIndex, k) => voiced.set(beatIndex, { ...dialogue[k], file: fileFor(beatIndex) }));
  notice("Voice mode", dialogue ? "one natural dialogue take with per-line emotion" : "fallback: one take per character");
  // Fallback: each character in their own take.
  for (const who of (dialogue ? [] : ["sketch", "bro"]) as Speaker[]) {
    const idx = script.beats.map((b, i) => (b.speaker === who && b.line.trim() ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const files = idx.map((i) => `line-${String(i + 1).padStart(2, "0")}.wav`);
    const out = await voiceEpisode(
      idx.map((i) => script.beats[i].line),
      files.map((f) => path.join(publicDir, f)),
      config.voices[who],
      who,
    );
    idx.forEach((beatIndex, k) => voiced.set(beatIndex, { ...out[k], file: files[k] }));
  }

  const beats: RenderedBeat[] = [];
  for (const [i, beat] of script.beats.entries()) {
    const sfxFile = await makeSfx(beat.sfx, publicDir);
    const v = voiced.get(i);
    if (!v) {
      beats.push({ ...beat, sfxFile, duration: SILENT_BEAT_SECONDS, words: [], mouthCues: [] });
      console.log(`  beat ${i + 1}: ${SILENT_BEAT_SECONDS}s reaction${sfxFile ? ` + ${beat.sfx}` : ""}`);
      continue;
    }
    const cues = await mouthCues(v.wavPath, beat.line);
    beats.push({ ...beat, audioFile: v.file, sfxFile, duration: v.duration, words: v.words, mouthCues: cues });
    console.log(`  beat ${i + 1}: ${v.duration.toFixed(2)}s ${beat.speaker} — "${beat.line}"`);
  }

  // 3. Render
  const props: EpisodeProps = {
    title: script.title,
    pov: script.pov,
    scene: script.scene,
    beats,
    musicFile: await pickMusic(publicDir),
    fps: FPS,
    gapSeconds: Number(process.env.BEAT_GAP?.trim() || "0.6"),
    outroSeconds: 0.9,
    watermark: config.watermark,
  };
  await fs.writeFile(path.join(runDir, "props.json"), JSON.stringify(props, null, 2));
  const seconds = computeTimeline(props).totalSeconds;
  if (seconds > 59) console.warn(`  Warning: ${seconds.toFixed(1)}s is long for a Short.`);
  console.log(`Render: ${seconds.toFixed(1)}s video${props.musicFile ? " with music" : ""}`);
  const mp4 = path.join(runDir, "episode.mp4");
  await renderEpisode(props, publicDir, mp4);
  console.log(`  saved ${path.relative(process.cwd(), mp4)}`);

  // Facebook photo + story images, made from frames of the same episode.
  const wantImages = facebookConfigured() || args.has("no-upload");
  const photoJpg = path.join(runDir, "facebook-photo.jpg");
  const storyJpg = path.join(runDir, "facebook-story.jpg");
  let imagesOk = false;
  if (wantImages) {
    try {
      const tl = computeTimeline(props);
      const last = beats.length - 1;
      const lastBeat = beats[last];
      // Punchline: the reaction shot after the boom zoom, or late in the last line.
      const punchT = lastBeat.audioFile ? tl.beatStarts[last] + lastBeat.duration * 0.7 : tl.beatStarts[last] + 0.5;
      const hookT = tl.beatStarts[0] + Math.min(1.2, beats[0].duration * 0.6);
      await renderMemePhoto(props, Math.round(punchT * FPS), publicDir, photoJpg);
      await renderStoryImage(props, Math.round(hookT * FPS), "NEW MEME", storySubline(), publicDir, storyJpg);
      imagesOk = true;
      console.log("  Facebook images: photo (punchline, 4:5) + story (hook with \"new meme\" card)");
    } catch (err) {
      console.warn(`  Could not make the Facebook images: ${String((err as Error)?.message ?? err).slice(0, 300)}`);
    }
  }

  // 4. Upload
  if (args.has("no-upload")) {
    console.log("Upload: skipped (--no-upload)");
  } else if (args.has("facebook-only")) {
    if (!facebookConfigured()) throw new Error("Facebook test needs FACEBOOK_PAGE_ID and FACEBOOK_PAGE_TOKEN secrets.");
    await postToFacebook({ date, title: script.title, theme: script.theme }, undefined, true);
  } else {
    const { videoId, publishAt } = await uploadShort(mp4, script, takenSlots);
    console.log(`Upload: https://youtube.com/shorts/${videoId}${publishAt ? ` (goes public ${publishAt})` : ""}`);
    // Record the slot at once, so a crash or a failed later step can never cause a second upload.
    const entry: HistoryEntry = { date, title: script.title, theme: script.theme, videoId, publishAt };
    await appendHistory(entry);

    if (args.has("no-facebook") || !facebookConfigured()) {
      console.log(`Facebook: skipped (${args.has("no-facebook") ? "--no-facebook" : "FACEBOOK_ENABLED is false or Facebook secrets are missing"})`);
    } else {
      await postToFacebook(entry, publishAt, false);
      await updateLastHistory(entry);
    }
  }

  /** Reel + photo + story on the Page. Each part is optional and never blocks the others. */
  async function postToFacebook(entry: HistoryEntry, publishAt: string | undefined, test: boolean) {
    const fail = (what: string, err: unknown) => {
      console.error(err);
      const msg = String((err as Error)?.message ?? err).replace(/[\r\n%]/g, " ");
      if (process.env.GITHUB_ACTIONS) console.log(`::error title=Facebook ${what} failed::${msg}`);
      process.exitCode = 1; // YouTube still went out; fail the run so the problem gets noticed
    };
    const label = test ? "Facebook test" : "Facebook";
    if (facebookParts.reel()) {
      try {
        const fb = await uploadFacebookReel(mp4, script, publishAt);
        entry.facebookVideoId = fb.videoId;
        console.log(`Facebook: Reel ${fb.videoId} ${fb.state}`);
        notice(label, `Reel ${fb.videoId} ${fb.state}`);
      } catch (err) {
        fail("Reel", err);
      }
    }
    if (!imagesOk) {
      if (facebookParts.photo() || facebookParts.story()) fail("images", new Error("photo/story images were not rendered"));
      return;
    }
    if (facebookParts.photo()) {
      try {
        const base = publishAt ? new Date(publishAt).getTime() : Date.now();
        const at = config.facebookPhotoDelayHours > 0 ? new Date(base + config.facebookPhotoDelayHours * 3600_000).toISOString() : publishAt;
        const ph = await postFacebookPhoto(photoJpg, script, at);
        entry.facebookPhotoId = ph.id;
        console.log(`Facebook: photo ${ph.id} ${ph.state}`);
        notice(`${label} photo`, `${ph.id} ${ph.state}`);
      } catch (err) {
        fail("photo", err);
      }
    }
    if (facebookParts.story()) {
      try {
        const st = await postFacebookStory(storyJpg);
        if (st.id) entry.facebookStoryId = st.id;
        console.log(`Facebook: story ${st.id} ${st.state}`);
        notice(`${label} story`, `${st.id || "-"} ${st.state}`);
      } catch (err) {
        fail("story", err);
      }
    }
  }

  /** "Tonight 7 PM on Reels" / "Tomorrow 7 PM on Reels" / "Out now on Reels", in Page-local time. */
  function storySubline(): string {
    if (config.uploadMode !== "schedule" || args.has("facebook-only")) return "Out now on Reels";
    const slot = new Date(publishAtIso(new Date(), takenSlots));
    const off = config.publishUtcOffset * 3600_000;
    const local = new Date(slot.getTime() + off);
    const today = new Date(Date.now() + off);
    const h = local.getUTCHours();
    const m = local.getUTCMinutes();
    const time = `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
    const sameDay = local.toISOString().slice(0, 10) === today.toISOString().slice(0, 10);
    return `${sameDay ? (h >= 17 ? "Tonight" : "Today") : "Tomorrow"} ${time} on Reels`;
  }

  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

/** Short, readable error text. Google API errors carry the useful part in response.data. */
function describe(err: unknown): string {
  const e = err as { message?: string; response?: { status?: number; data?: unknown } };
  const data = e?.response?.data ? ` | ${e.response.status} ${JSON.stringify(e.response.data)}` : "";
  return `${e?.message ?? String(err)}${data}`.slice(0, 1500);
}

main().catch((err) => {
  console.error(err);
  if (process.env.GITHUB_ACTIONS) {
    const msg = describe(err).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
    console.log(`::error title=Episode failed::${msg}`);
  }
  process.exit(1);
});
