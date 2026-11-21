import fs from "node:fs/promises";
import path from "node:path";
import type { EpisodeScript } from "../shared/episode";
import { ffmpeg } from "./audio";
import { config, ROOT } from "./config";
import { archiveName } from "./episodeSource";
import { facebookConfigured, facebookParts, postFacebookPhoto, postFacebookStory, uploadFacebookReel } from "./facebook";
import { appendHistory, loadHistory, updateLastHistory, type HistoryEntry } from "./history";
import { instagramAccountId, instagramConfigured, instagramParts, postInstagramPhoto, postInstagramReel, postInstagramStory } from "./instagram";
import { isPrimarySlot, uploadShort } from "./upload";

/**
 * Post a ready-made reel (e.g. an HTML animation rendered to MP4) to YouTube, Facebook and Instagram.
 *   npm run post-video -- --meta=data/reels/exam-eye-contact.json
 * The meta file: { video, title, pov, description, tags, theme, photoAt?, photoCropY?, storyAt? }
 */
type Meta = {
  video: string;
  title: string;
  pov: string;
  description: string;
  tags: string[];
  theme?: string;
  photoAt?: number;
  photoCropY?: number;
  storyAt?: number;
};

function notice(title: string, body: string) {
  console.log(`${title}: ${body}`);
  if (!process.env.GITHUB_ACTIONS) return;
  const clean = (s: string) => s.replace(/[\r\n%]/g, " ");
  console.log(`::notice title=${clean(title).replace(/[:,]/g, " ")}::${clean(body).slice(0, 900)}`);
}
function fail(what: string, err: unknown) {
  console.error(err);
  const msg = String((err as Error)?.message ?? err).replace(/[\r\n%]/g, " ");
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=${what} failed::${msg}`);
}

async function main() {
  const metaArg = process.argv.find((a) => a.startsWith("--meta="))?.slice(7);
  if (!metaArg) throw new Error("Pass --meta=path/to/reel.json");
  const meta = JSON.parse(await fs.readFile(path.resolve(ROOT, metaArg), "utf8")) as Meta;
  const mp4 = path.resolve(ROOT, meta.video);
  await fs.access(mp4);

  const history = await loadHistory();
  if (history.some((h) => h.title === meta.title)) throw new Error(`Already posted: "${meta.title}" (see data/history.json)`);
  const takenSlots = history.map((h) => h.publishAt).filter((s): s is string => Boolean(s));

  const runDir = path.join(config.paths.out, "post-video");
  await fs.mkdir(runDir, { recursive: true });
  const photoJpg = path.join(runDir, "photo.jpg");
  const storyJpg = path.join(runDir, "story.jpg");
  await ffmpeg(["-y", "-ss", String(meta.photoAt ?? 1), "-i", mp4, "-frames:v", "1", "-vf", `crop=1080:1350:0:${meta.photoCropY ?? 0}`, "-q:v", "2", photoJpg]);
  await ffmpeg(["-y", "-ss", String(meta.storyAt ?? 1), "-i", mp4, "-frames:v", "1", "-q:v", "2", storyJpg]);

  const asEpisode = { title: meta.title, pov: meta.pov, description: meta.description, tags: meta.tags, theme: meta.theme ?? "", beats: [] } as unknown as EpisodeScript;
  const date = new Date().toISOString().slice(0, 10);

  const { videoId, publishAt } = await uploadShort(mp4, asEpisode, takenSlots);
  notice("YouTube", `https://youtube.com/shorts/${videoId}${publishAt ? ` public at ${publishAt}` : " public now"}`);
  const entry: HistoryEntry = { date, title: meta.title, theme: meta.theme ?? "", pov: meta.pov, videoId, publishAt, style: "html-reel" };
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
        const ph = await postFacebookPhoto(photoJpg, asEpisode, publishAt);
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
        save(await post());
        notice(`Instagram ${name}`, "published");
      } catch (err) {
        fail(`Instagram ${name}`, err);
      }
    }
    await updateLastHistory(entry);
  }
}

main().catch((err) => {
  console.error(err);
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=Post video failed::${String((err as Error)?.message ?? err).replace(/[\r\n%]/g, " ").slice(0, 1500)}`);
  process.exit(1);
});
