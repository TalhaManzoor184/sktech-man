import fs from "node:fs";
import { google } from "googleapis";
import type { EpisodeScript } from "../shared/episode";
import { config, req } from "./config";

export function youtubeClient() {
  const auth = new google.auth.OAuth2(req("YOUTUBE_CLIENT_ID"), req("YOUTUBE_CLIENT_SECRET"));
  auth.setCredentials({ refresh_token: req("YOUTUBE_REFRESH_TOKEN") });
  return google.youtube({ version: "v3", auth });
}

/**
 * Next PUBLISH_TIME (in PUBLISH_UTC_OFFSET local time), PUBLISH_DELAY_DAYS from now, as ISO UTC.
 * Slots listed in `taken` (already used by an earlier episode) are skipped, so two videos never
 * go public at the same time.
 */
export function publishAtIso(now = new Date(), taken: Iterable<string> = []): string {
  const used = new Set(taken);
  const times = config.publishTimes.length ? config.publishTimes : [config.publishTime];
  const offsetMs = config.publishUtcOffset * 3600_000;
  const local = new Date(now.getTime() + offsetMs);
  // Earliest slot (any of the daily times) at least 15 minutes ahead that no episode has yet.
  for (let d = config.publishDelayDays; d < config.publishDelayDays + 400; d++) {
    for (const t of times) {
      const [hh, mm] = t.split(":").map(Number);
      const target = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + d, hh, mm) - offsetMs;
      if (target < now.getTime() + 15 * 60_000) continue;
      const iso = new Date(target).toISOString();
      if (!used.has(iso)) return iso;
    }
  }
  throw new Error("No free publish slot found");
}

/** True when the slot is the day's main one (gets the photo + Story on Facebook/Instagram). */
export function isPrimarySlot(iso?: string): boolean {
  if (!iso) return true;
  if (config.publishTimes.length <= 1) return true;
  const local = new Date(new Date(iso).getTime() + config.publishUtcOffset * 3600_000);
  const hhmm = `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
  const [ph, pm] = config.primaryTime.split(":").map(Number);
  return hhmm === `${String(ph).padStart(2, "0")}:${String(pm).padStart(2, "0")}`;
}

const FOOTER = `

Sketch Man vs. everyday life. A new hand-drawn meme every day.

#Shorts #Relatable #Memes #Animation #SketchMan`;

export async function uploadShort(file: string, script: EpisodeScript, takenSlots: string[] = []): Promise<{ videoId: string; publishAt?: string }> {
  const yt = youtubeClient();
  const publishAt = config.uploadMode === "schedule" ? publishAtIso(new Date(), takenSlots) : undefined;
  const res = await yt.videos.insert({
    part: ["snippet", "status"],
    notifySubscribers: true,
    requestBody: {
      snippet: {
        title: script.title.slice(0, 100),
        description: (script.description + FOOTER).slice(0, 4900),
        tags: script.tags,
        categoryId: "23", // Comedy
        defaultLanguage: config.videoLanguage,
        defaultAudioLanguage: config.videoLanguage,
      },
      status: {
        privacyStatus: config.uploadMode === "public" ? "public" : "private",
        publishAt,
        // Must match who the content is for (see MADE_FOR_KIDS in config and character/bible.md).
        selfDeclaredMadeForKids: config.madeForKids,
        embeddable: true,
      },
    },
    media: { mimeType: "video/mp4", body: fs.createReadStream(file) },
  });
  const videoId = res.data.id;
  if (!videoId) throw new Error("YouTube did not return a video id.");
  return { videoId, publishAt };
}

/** Next occurrence of HH:MM local time (PUBLISH_UTC_OFFSET), at least 15 minutes from now. */
export function nextLocalTime(hhmm: string, now = new Date()): string {
  const [hh, mm] = hhmm.split(":").map(Number);
  const off = config.publishUtcOffset * 3600_000;
  const local = new Date(now.getTime() + off);
  let t = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hh, mm) - off;
  while (t < now.getTime() + 15 * 60_000) t += 24 * 3600_000;
  return new Date(t).toISOString();
}

/** Upload a regular (long-form) video. Scheduled at `publishAt`, or public now / private by UPLOAD_MODE. */
export async function uploadLongForm(
  file: string,
  meta: { title: string; description: string; tags: string[] },
  publishAt?: string,
): Promise<{ videoId: string; publishAt?: string }> {
  const yt = youtubeClient();
  const schedule = config.uploadMode === "schedule" && publishAt;
  const res = await yt.videos.insert({
    part: ["snippet", "status"],
    notifySubscribers: true,
    requestBody: {
      snippet: {
        title: meta.title.replace(/\s*#shorts\b/gi, "").slice(0, 100),
        description: meta.description.slice(0, 4900),
        tags: meta.tags,
        categoryId: "23", // Comedy
        defaultLanguage: config.videoLanguage,
        defaultAudioLanguage: config.videoLanguage,
      },
      status: {
        privacyStatus: config.uploadMode === "public" ? "public" : "private",
        publishAt: schedule ? publishAt : undefined,
        selfDeclaredMadeForKids: config.madeForKids,
        embeddable: true,
      },
    },
    media: { mimeType: "video/mp4", body: fs.createReadStream(file) },
  });
  const videoId = res.data.id;
  if (!videoId) throw new Error("YouTube did not return a video id.");
  return { videoId, publishAt: schedule ? publishAt : undefined };
}

/** Custom thumbnail. Needs a phone-verified channel; failures are reported, not fatal. */
export async function setThumbnail(videoId: string, jpg: string): Promise<void> {
  const yt = youtubeClient();
  await yt.thumbnails.set({ videoId, media: { mimeType: "image/jpeg", body: fs.createReadStream(jpg) } });
}
