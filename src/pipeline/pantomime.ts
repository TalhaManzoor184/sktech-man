import fs from "node:fs/promises";
import path from "node:path";
import { FPS, type EpisodeScript } from "../shared/episode";
import { PantomimeScript, pantomimeFrames, type PantomimeProps, type RenderedShot } from "../shared/pantomime";
import { ffmpeg } from "./audio";
import { config, ROOT } from "./config";
import { archiveName } from "./episodeSource";
import { facebookConfigured, facebookParts, postFacebookPhoto, postFacebookStory, uploadFacebookReel } from "./facebook";
import { appendHistory, loadHistory, updateLastHistory, type HistoryEntry } from "./history";
import { instagramAccountId, instagramConfigured, instagramParts, postInstagramPhoto, postInstagramReel, postInstagramStory } from "./instagram";
import { mouthCues } from "./lipsync";
import { writePantomime } from "./pantomimeScript";
import { renderPantomime } from "./render";
import { makeSfx } from "./sfx";
import { trendingNotes } from "./trends";
import { voiceEpisode } from "./tts";
import { isPrimarySlot, uploadShort } from "./upload";

/**
 * Pantomime meme Short: one line of text, fast shots, big faces, meme sounds, almost no dialogue.
 *
 *   npm run pantomime                        write, render, upload (UPLOAD_MODE decides public/scheduled)
 *   npm run pantomime -- --no-upload         render only
 *   npm run pantomime -- --sample            use data/sample-pantomime.json (no writer)
 *   npm run pantomime -- --script=file.json  use a hand-written shot list
 *   npm run pantomime -- --tts=espeak        offline robot voice (testing only)
 */

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"] as const;
  }),
);
if (args.has("tts")) config.ttsProvider = args.get("tts") as typeof config.ttsProvider;

function notice(title: string, body: string) {
  if (!process.env.GITHUB_ACTIONS) return;
  const clean = (s: string) => s.replace(/[\r\n%]/g, " ");
  console.log(`::notice title=${clean(title).replace(/[:,]/g, " ")}::${clean(body).slice(0, 900)}`);
}
function fail(what: string, err: unknown) {
  console.error(err);
  const msg = String((err as Error)?.message ?? err).replace(/[\r\n%]/g, " ");
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=${what} failed::${msg}`);
  process.exitCode = 1;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "meme";

async function main() {
  const t0 = Date.now();
  const date = new Date().toISOString().slice(0, 10);
  const history = await loadHistory();
  const takenSlots = history.map((h) => h.publishAt).filter((s): s is string => Boolean(s));

  // 1. Script
  let script: PantomimeScript;
  const scriptFile = args.get("script") || (args.has("sample") ? "data/sample-pantomime.json" : "");
  if (scriptFile) {
    script = PantomimeScript.parse(JSON.parse(await fs.readFile(path.resolve(ROOT, scriptFile), "utf8")));
    console.log(`Script: ${scriptFile}`);
  } else {
    const trends = await trendingNotes();
    script = await writePantomime(history, trends);
  }
  console.log(`Pantomime: "${script.title}" — ${script.pov} — ${script.shots.length} shots`);
  notice(script.title, `${script.pov} | ${script.shots.map((s) => `${s.shot}:${s.focus}/${s.expression}${s.line ? ` "${s.line}"` : ""}`).join(" · ")}`);

  const runDir = path.join(config.paths.out, `${date}-pm-${slug(script.title)}`);
  const publicDir = path.join(runDir, "public");
  await fs.mkdir(publicDir, { recursive: true });
  await fs.writeFile(path.join(runDir, "script.json"), JSON.stringify(script, null, 2));

  // 2. Voices for the few spoken lines (one take per character), sound effects, timing
  const voiced = new Map<number, { file: string; duration: number; words: RenderedShot["words"]; wav: string }>();
  for (const who of ["sketch", "bro"] as const) {
    const idx = script.shots.map((s, i) => (s.line && s.focus === who ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const files = idx.map((i) => `line-${String(i + 1).padStart(2, "0")}.wav`);
    const out = await voiceEpisode(idx.map((i) => script.shots[i].line), files.map((f) => path.join(publicDir, f)), config.voices[who], who);
    idx.forEach((i, k) => voiced.set(i, { file: files[k], duration: out[k].duration, words: out[k].words, wav: out[k].wavPath }));
  }
  const shots: RenderedShot[] = [];
  for (const [i, s] of script.shots.entries()) {
    const v = voiced.get(i);
    shots.push({
      ...s,
      duration: Math.max(s.seconds, v ? v.duration + 0.35 : 0),
      audioFile: v?.file,
      sfxFile: await makeSfx(s.sfx, publicDir),
      words: v?.words ?? [],
      mouthCues: v ? await mouthCues(v.wav, s.line) : [],
    });
  }
  // Hold the last reaction a little longer so the loop lands.
  shots[shots.length - 1].duration += 0.4;

  // 3. Music (louder than in talking episodes: it carries the meme)
  let musicFile: string | undefined;
  try {
    const tracks = (await fs.readdir(config.paths.music)).filter((f) => /\.(mp3|wav|m4a|ogg)$/i.test(f));
    if (tracks.length) {
      const f = tracks[Math.floor(Math.random() * tracks.length)];
      musicFile = `music${path.extname(f)}`;
      await fs.copyFile(path.join(config.paths.music, f), path.join(publicDir, musicFile));
    }
  } catch {
    /* no music */
  }

  const props: PantomimeProps = {
    pov: script.pov,
    scene: script.scene,
    shots,
    fps: FPS,
    musicFile,
    musicVolume: Number(process.env.PANTOMIME_MUSIC_VOLUME || "0.28"),
    watermark: config.watermark,
    followText: process.env.FOLLOW_TEXT ?? "Follow for tomorrow's disaster",
  };
  await fs.writeFile(path.join(runDir, "props.json"), JSON.stringify(props, null, 2));
  const { starts, total } = pantomimeFrames(props);
  console.log(`Render: ${(total / FPS).toFixed(1)}s, ${shots.length} shots${musicFile ? " with music" : ""}`);
  const mp4 = path.join(runDir, "episode.mp4");
  await renderPantomime(props, publicDir, mp4);
  console.log(`  saved ${path.relative(process.cwd(), mp4)}`);

  // Images for Facebook/Instagram: the final reaction (4:5) and the first shot (9:16)
  const photoJpg = path.join(runDir, "facebook-photo.jpg");
  const storyJpg = path.join(runDir, "facebook-story.jpg");
  const lastT = (starts[starts.length - 1] + 0.45 * FPS) / FPS;
  await ffmpeg(["-ss", lastT.toFixed(2), "-i", mp4, "-frames:v", "1", "-vf", "crop=1080:1350:0:0", "-q:v", "2", photoJpg]);
  await ffmpeg(["-ss", (Math.min(0.9, shots[0].duration * 0.6)).toFixed(2), "-i", mp4, "-frames:v", "1", "-q:v", "2", storyJpg]);

  // 4. Upload
  if (args.has("no-upload")) {
    console.log("Upload: skipped (--no-upload)");
    console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    return;
  }
  const asEpisode = { ...script, beats: [] } as unknown as EpisodeScript;
  const { videoId, publishAt } = await uploadShort(mp4, asEpisode, takenSlots);
  console.log(`Upload: https://youtube.com/shorts/${videoId}${publishAt ? ` (goes public ${publishAt})` : " (public now)"}`);
  notice("YouTube", `https://youtube.com/shorts/${videoId}${publishAt ? ` public at ${publishAt}` : " public now"}`);
  const entry: HistoryEntry = { date, title: script.title, theme: script.theme, pov: script.pov, videoId, publishAt, style: "pantomime" };
  await appendHistory(entry);
  await fs.writeFile(path.join(config.paths.out, "archive.txt"), `${mp4}\n${archiveName(entry)}\n`);

  const primary = isPrimarySlot(publishAt);
  if (facebookConfigured()) {
    if (facebookParts.reel())
      try {
        const fb = await uploadFacebookReel(mp4, asEpisode, publishAt);
        entry.facebookVideoId = fb.videoId;
        notice("Facebook", `Reel ${fb.videoId} ${fb.state}`);
      } catch (err) {
        fail("Facebook Reel", err);
      }
    if (primary && facebookParts.photo())
      try {
        const base = publishAt ? new Date(publishAt).getTime() : Date.now();
        const at = config.facebookPhotoDelayHours > 0 ? new Date(base + config.facebookPhotoDelayHours * 3600_000).toISOString() : publishAt;
        const ph = await postFacebookPhoto(photoJpg, asEpisode, at);
        entry.facebookPhotoId = ph.id;
        notice("Facebook photo", `${ph.id} ${ph.state}`);
      } catch (err) {
        fail("Facebook photo", err);
      }
    if (primary && facebookParts.story())
      try {
        const st = await postFacebookStory(storyJpg);
        entry.facebookStoryId = st.id || undefined;
        notice("Facebook story", `${st.id} ${st.state}`);
      } catch (err) {
        fail("Facebook story", err);
      }
    await updateLastHistory(entry);
  }
  if (instagramConfigured() && process.env.FACEBOOK_DRAFT !== "true" && (await instagramAccountId())) {
    const parts: [string, boolean, () => Promise<string>, (id: string) => void][] = [
      ["Reel", instagramParts.reel(), () => postInstagramReel(mp4, asEpisode), (id) => (entry.instagramReelId = id)],
      ["photo", primary && instagramParts.photo(), () => postInstagramPhoto(photoJpg, asEpisode), (id) => (entry.instagramPhotoId = id)],
      ["story", primary && instagramParts.story(), () => postInstagramStory(storyJpg), (id) => (entry.instagramStoryId = id)],
    ];
    for (const [name, on, post, save] of parts) {
      if (!on) continue;
      try {
        const id = await post();
        save(id);
        notice(`Instagram ${name}`, `${id} published`);
      } catch (err) {
        fail(`Instagram ${name}`, err);
      }
    }
    await updateLastHistory(entry);
  }
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

main().catch((err) => {
  console.error(err);
  if (process.env.GITHUB_ACTIONS) {
    const msg = String((err as Error)?.message ?? err).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A").slice(0, 1500);
    console.log(`::error title=Pantomime failed::${msg}`);
  }
  process.exit(1);
});

