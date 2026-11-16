import fs from "node:fs/promises";
import { config } from "./config";

export type HistoryEntry = {
  date: string;
  title: string;
  theme: string;
  videoId?: string;
  publishAt?: string;
  facebookVideoId?: string;
  facebookPhotoId?: string;
  facebookStoryId?: string;
};

export async function loadHistory(): Promise<HistoryEntry[]> {
  try {
    return JSON.parse(await fs.readFile(config.paths.history, "utf8")) as HistoryEntry[];
  } catch {
    return [];
  }
}

export async function appendHistory(entry: HistoryEntry): Promise<void> {
  const all = await loadHistory();
  all.push(entry);
  await fs.writeFile(config.paths.history, JSON.stringify(all, null, 2) + "\n");
}

/** Replace the last entry (used to add Facebook ids after the YouTube entry is already saved). */
export async function updateLastHistory(entry: HistoryEntry): Promise<void> {
  const all = await loadHistory();
  if (all.length) all[all.length - 1] = entry;
  else all.push(entry);
  await fs.writeFile(config.paths.history, JSON.stringify(all, null, 2) + "\n");
}
