import fs from "node:fs/promises";
import path from "node:path";
import { EpisodeScript, FPS, SILENT_BEAT_SECONDS, type EpisodeProps, type RenderedBeat, type Speaker } from "../shared/episode";
import { computeTimeline } from "../shared/timeline";
import { config } from "./config";
import { appendHistory, loadHistory } from "./history";
import { mouthCues } from "./lipsync";
import { renderEpisode } from "./render";
import { writeScript } from "./script";
import { makeSfx } from "./sfx";
import { trendingNotes } from "./trends";
import { voiceEpisode, type Voiced } from "./tts";
import { uploadShort } from "./upload";

/**
 * One full episode: trends → script → voices → lip sync → sound effects → render → upload.
 *
 *   npm run episode                       full daily run
 *   npm run episode -- --no-upload        everything except YouTube
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
  for (const who of ["sketch", "bro"] as Speaker[]) {
    const idx = script.beats.map((b, i) => (b.speaker === who && b.line.trim() ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const files = idx.map((i) => `line-${String(i + 1).padStart(2, "0")}.wav`);
    const out = await voiceEpisode(
      idx.map((i) => script.beats[i].line),
      files.map((f) => path.join(publicDir, f)),
      config.voices[who],
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
    gapSeconds: Number(process.env.BEAT_GAP?.trim() || "0.5"),
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

  // 4. Upload
  if (args.has("no-upload")) {
    console.log("Upload: skipped (--no-upload)");
  } else {
    const { videoId, publishAt } = await uploadShort(mp4, script);
    console.log(`Upload: https://youtube.com/shorts/${videoId}${publishAt ? ` (goes public ${publishAt})` : ""}`);
    await appendHistory({ date, title: script.title, theme: script.theme, videoId, publishAt });
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
