import fs from "node:fs/promises";
import type { EpisodeScript } from "../shared/episode";
import { config, req } from "./config";
import { graph, graphForm, imageForm } from "./facebook";

/**
 * Instagram Content Publishing API, through the Facebook Page the Instagram account is linked to.
 * Uses the same never-expiring Page token as Facebook; the token needs instagram_basic and
 * instagram_content_publish, and the Instagram account must be a Business account.
 * Instagram can't schedule through the API, so everything is published when the run gets here.
 */

export function instagramConfigured(): boolean {
  if (process.env.INSTAGRAM_ENABLED === "false") return false;
  return Boolean(process.env.FACEBOOK_PAGE_TOKEN && process.env.FACEBOOK_PAGE_ID);
}

let igId: string | null | undefined;

/**
 * The Instagram account id: INSTAGRAM_ACCOUNT_ID if set, otherwise the Business account linked to
 * the Facebook Page (needs instagram_basic on the token). null when there is none.
 */
export async function instagramAccountId(): Promise<string | null> {
  if (igId !== undefined) return igId;
  const fromEnv = process.env.INSTAGRAM_ACCOUNT_ID?.trim();
  if (fromEnv) return (igId = fromEnv);
  try {
    const r = await graph<{ instagram_business_account?: { id: string; username?: string } }>("GET", req("FACEBOOK_PAGE_ID"), {
      fields: "instagram_business_account{id,username}",
      access_token: req("FACEBOOK_PAGE_TOKEN"),
    });
    igId = r.instagram_business_account?.id ?? null;
    if (igId) console.log(`  Instagram account: @${r.instagram_business_account?.username ?? "?"} (${igId})`);
  } catch (err) {
    console.warn(`  Instagram account lookup failed: ${String((err as Error)?.message ?? err).slice(0, 200)}`);
    igId = null;
  }
  return igId;
}

export const instagramParts = {
  reel: () => process.env.INSTAGRAM_REEL !== "false",
  photo: () => process.env.INSTAGRAM_PHOTO !== "false",
  story: () => process.env.INSTAGRAM_STORY !== "false",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ig = () => {
  if (!igId) throw new Error("No Instagram account id");
  return igId;
};
const token = () => req("FACEBOOK_PAGE_TOKEN");

function reelCaption(script: EpisodeScript): string {
  const title = script.title.replace(/\s*#shorts\b/gi, "").trim();
  const tags = ["#sketchman", "#memes", "#relatable", "#funny", "#animation", "#reels", "#meme"];
  return `${title}\n\n${script.pov}\n\n${tags.join(" ")}`.slice(0, 2200);
}

function photoCaption(script: EpisodeScript): string {
  const tags = ["#sketchman", "#memes", "#relatable", "#funny", "#meme", "#memesdaily"];
  return `${script.pov} 💀\n\nFull skit on our Reels 🎬\n\n${tags.join(" ")}`.slice(0, 2200);
}

/** Wait until a media container has finished processing. */
async function waitReady(containerId: string, minutes = 10): Promise<void> {
  const deadline = Date.now() + minutes * 60_000;
  while (Date.now() < deadline) {
    const s = await graph<{ status_code?: string; status?: string }>("GET", containerId, { fields: "status_code,status", access_token: token() });
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`Instagram container ${containerId}: ${s.status_code} ${s.status ?? ""}`);
    await sleep(5000);
  }
  throw new Error(`Instagram container ${containerId} was not ready after ${minutes} minutes`);
}

async function publish(containerId: string): Promise<string> {
  await waitReady(containerId);
  // "9007 Media ID is not available" happens when publish comes a moment too early; wait and retry.
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await graph<{ id: string }>("POST", `${ig()}/media_publish`, { creation_id: containerId, access_token: token() });
      return res.id;
    } catch (err) {
      if (attempt >= 6 || !/\b9007\b|not available|not ready/i.test(String(err))) throw err;
      await sleep(10_000 * attempt);
    }
  }
}

/** Instagram needs a public image URL. Upload the image to the Page as a hidden photo and use its URL. */
async function hostedImageUrl(file: string): Promise<string> {
  const pageId = req("FACEBOOK_PAGE_ID");
  const photo = await graphForm<{ id: string }>(`${pageId}/photos`, await imageForm(file, { access_token: token(), published: "false", temporary: "true" }));
  const info = await graph<{ images?: { source: string; width: number }[] }>("GET", photo.id, { fields: "images", access_token: token() });
  const best = (info.images ?? []).sort((a, b) => b.width - a.width)[0];
  if (!best?.source) throw new Error("Could not get a public URL for the image");
  return best.source;
}

/** Reel: resumable upload of the local MP4, then publish. Also shown in the main feed. */
export async function postInstagramReel(mp4: string, script: EpisodeScript): Promise<string> {
  const c = await graph<{ id: string; uri?: string }>("POST", `${ig()}/media`, {
    media_type: "REELS",
    upload_type: "resumable",
    caption: reelCaption(script),
    share_to_feed: "true",
    access_token: token(),
  });
  const bytes = await fs.readFile(mp4);
  const uri = c.uri ?? `https://rupload.facebook.com/ig-api-upload/${config.facebookGraphVersion}/${c.id}`;
  const up = await fetch(uri, {
    method: "POST",
    headers: { Authorization: `OAuth ${token()}`, offset: "0", file_size: String(bytes.length), "Content-Type": "application/octet-stream" },
    body: bytes,
  });
  if (!up.ok) throw new Error(`Instagram video upload failed: ${up.status} ${(await up.text()).slice(0, 300)}`);
  return publish(c.id);
}

/** Feed photo (the meme image). */
export async function postInstagramPhoto(jpg: string, script: EpisodeScript): Promise<string> {
  const c = await graph<{ id: string }>("POST", `${ig()}/media`, { image_url: await hostedImageUrl(jpg), caption: photoCaption(script), access_token: token() });
  return publish(c.id);
}

/** Story (the teaser image). Business accounts only. */
export async function postInstagramStory(jpg: string): Promise<string> {
  const c = await graph<{ id: string }>("POST", `${ig()}/media`, { image_url: await hostedImageUrl(jpg), media_type: "STORIES", access_token: token() });
  return publish(c.id);
}
