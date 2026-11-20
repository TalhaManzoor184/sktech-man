import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { ffmpeg } from "./audio";
import type { EpisodeProps } from "../shared/episode";
import { config } from "./config";

/** Bundles the Remotion project once and reuses it for the video and the stills. */
const bundles = new Map<string, Promise<string>>();
function serveUrlFor(publicDir: string): Promise<string> {
  if (!bundles.has(publicDir)) bundles.set(publicDir, bundle({ entryPoint: config.paths.entry, publicDir }));
  return bundles.get(publicDir)!;
}

export async function renderEpisode(props: EpisodeProps, publicDir: string, outFile: string): Promise<void> {
  const serveUrl = await serveUrlFor(publicDir);
  const inputProps = props as unknown as Record<string, unknown>;
  const composition = await selectComposition({
    serveUrl,
    id: "SketchEpisode",
    inputProps,
    browserExecutable: config.chromePath,
  });
  let lastPct = -10;
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    codec: "h264",
    crf: 18,
    // Facebook Reels wants a closed GOP of 2–5 s and standard-range 4:2:0; YouTube is fine with both.
    gopSize: 60,
    pixelFormat: "yuv420p",
    colorSpace: "bt709",
    audioBitrate: "192k",
    outputLocation: outFile,
    browserExecutable: config.chromePath,
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 100);
      if (pct >= lastPct + 10) {
        lastPct = pct;
        console.log(`  render ${pct}%`);
      }
    },
  });
}

async function still(publicDir: string, id: string, props: Record<string, unknown>, frame: number, png: string): Promise<void> {
  const serveUrl = await serveUrlFor(publicDir);
  const composition = await selectComposition({ serveUrl, id, inputProps: props, browserExecutable: config.chromePath });
  await renderStill({ serveUrl, composition, inputProps: props, frame, output: png, imageFormat: "png", browserExecutable: config.chromePath });
}

/**
 * Facebook photo post: the punchline frame, cropped to 4:5 (1080×1350) from the top so the
 * POV text and the reaction face stay in. Returns the JPEG path.
 */
export async function renderMemePhoto(props: EpisodeProps, frame: number, publicDir: string, outJpg: string): Promise<string> {
  const png = outJpg.replace(/\.jpe?g$/i, ".png");
  await still(publicDir, "SketchEpisode", props as unknown as Record<string, unknown>, frame, png);
  await ffmpeg(["-i", png, "-vf", "crop=1080:1350:0:0", "-q:v", "2", outJpg]);
  return outJpg;
}

/** Facebook Story image (1080×1920): the hook frame with a "new meme" card. Returns the JPEG path. */
export async function renderStoryImage(
  props: EpisodeProps,
  teaserFrame: number,
  headline: string,
  sub: string,
  publicDir: string,
  outJpg: string,
): Promise<string> {
  const png = outJpg.replace(/\.jpe?g$/i, ".png");
  await still(publicDir, "StoryTeaser", { ...props, teaserFrame, headline, sub } as unknown as Record<string, unknown>, teaserFrame, png);
  await ffmpeg(["-i", png, "-q:v", "2", outJpg]);
  return outJpg;
}

/* ---------- weekly compilation ---------- */

/** One Sketch Man host segment of the weekly video (1920×1080 MP4). */
export async function renderHostSegment(props: import("../shared/weekly").HostProps, publicDir: string, outFile: string): Promise<void> {
  const serveUrl = await serveUrlFor(publicDir);
  const inputProps = props as unknown as Record<string, unknown>;
  const composition = await selectComposition({ serveUrl, id: "WeeklyHost", inputProps, browserExecutable: config.chromePath });
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    codec: "h264",
    crf: 20,
    pixelFormat: "yuv420p",
    audioBitrate: "192k",
    outputLocation: outFile,
    browserExecutable: config.chromePath,
  });
}

/** Still PNG of a landscape composition (clip frame or thumbnail). */
export async function renderWideStill(id: "ClipFrame" | "WeeklyThumb", props: object, publicDir: string, png: string): Promise<void> {
  await still(publicDir, id, props as Record<string, unknown>, 0, png);
}

/** Pantomime meme (same output settings as the regular episodes). */
export async function renderPantomime(props: import("../shared/pantomime").PantomimeProps, publicDir: string, outFile: string): Promise<void> {
  const serveUrl = await serveUrlFor(publicDir);
  const inputProps = props as unknown as Record<string, unknown>;
  const composition = await selectComposition({ serveUrl, id: "Pantomime", inputProps, browserExecutable: config.chromePath });
  let lastPct = -10;
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    codec: "h264",
    crf: 18,
    gopSize: 60,
    pixelFormat: "yuv420p",
    colorSpace: "bt709",
    audioBitrate: "192k",
    outputLocation: outFile,
    browserExecutable: config.chromePath,
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 100);
      if (pct >= lastPct + 20) {
        lastPct = pct;
        console.log(`  render ${pct}%`);
      }
    },
  });
}
