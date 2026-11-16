import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "./config";
import type { HistoryEntry } from "./history";

const run = promisify(execFile);

/** GitHub Release that keeps every episode's MP4 (Actions artifacts are too small and expire). */
export const ARCHIVE_TAG = "episodes";

/** Asset name for an episode in the archive: one per publish slot. */
export function archiveName(e: Pick<HistoryEntry, "publishAt" | "date">): string {
  return `ep-${(e.publishAt ?? e.date).slice(0, 10)}.mp4`;
}

async function fromRelease(name: string, dir: string): Promise<string | null> {
  try {
    await run("gh", ["release", "download", ARCHIVE_TAG, "--pattern", name, "--dir", dir, "--clobber"], { maxBuffer: 8 * 1024 * 1024 });
    const f = path.join(dir, name);
    await fs.access(f);
    return f;
  } catch {
    return null;
  }
}

/** The Page's own Reel can be downloaded through the Graph API (`source`). */
async function fromFacebook(videoId: string, out: string): Promise<string | null> {
  const token = process.env.FACEBOOK_PAGE_TOKEN?.trim();
  if (!token) return null;
  try {
    const meta = await fetch(`https://graph.facebook.com/${config.facebookGraphVersion}/${videoId}?fields=source&access_token=${encodeURIComponent(token)}`);
    const json = (await meta.json()) as { source?: string };
    if (!json.source) return null;
    const res = await fetch(json.source);
    if (!res.ok) return null;
    await fs.writeFile(out, Buffer.from(await res.arrayBuffer()));
    return out;
  } catch {
    return null;
  }
}

/**
 * Get the MP4 for one publish slot. `candidates` are the history entries for that slot (duplicates
 * from the Nov 2026 bug included); the first one that can be found is used.
 */
export async function fetchEpisode(candidates: HistoryEntry[], dir: string): Promise<{ file: string; entry: HistoryEntry; from: string } | null> {
  const name = archiveName(candidates[0]);
  const rel = await fromRelease(name, dir);
  if (rel) return { file: rel, entry: candidates[0], from: "archive" };
  for (const e of candidates) {
    if (!e.facebookVideoId) continue;
    const f = await fromFacebook(e.facebookVideoId, path.join(dir, `fb-${e.facebookVideoId}.mp4`));
    if (f) return { file: f, entry: e, from: "facebook" };
  }
  return null;
}
