import fs from "node:fs/promises";
import type { EpisodeScript } from "../shared/episode";
import { config, req } from "./config";

/**
 * Facebook Reels Publishing API (Page Reels).
 * Needs a Facebook Page and a never-expiring Page access token (see `npm run auth:facebook`).
 * The Meta app must be in Live mode, or Reels are visible only to people with a role on the app.
 */

const GRAPH = "https://graph.facebook.com";
const RUPLOAD = "https://rupload.facebook.com/video-upload";

export function facebookConfigured(): boolean {
  if (process.env.FACEBOOK_ENABLED === "false") return false;
  return Boolean(process.env.FACEBOOK_PAGE_ID && process.env.FACEBOOK_PAGE_TOKEN);
}

type GraphError = { error?: { message: string; type?: string; code?: number; error_subcode?: number; fbtrace_id?: string } };

async function graph<T>(method: "GET" | "POST", path: string, params: Record<string, string>): Promise<T> {
  const v = config.facebookGraphVersion;
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${GRAPH}/${v}/${path}?${qs}`, { method });
  const json = (await res.json()) as T & GraphError;
  if (!res.ok || json.error) {
    throw new Error(`Facebook ${path} failed: ${json.error?.code ?? res.status} ${json.error?.message ?? ""}`);
  }
  return json;
}

/** Facebook caption: the title without YouTube's #shorts, the POV line, the joke, hashtags. */
function caption(script: EpisodeScript): string {
  const title = script.title.replace(/\s*#shorts\b/gi, "").trim();
  const tags = ["#sketchman", "#memes", "#relatable", "#funny", "#animation", "#reels"];
  return `${title}\n\n${script.pov}\n${script.description}\n\n${tags.join(" ")}`;
}

function fbTitle(script: EpisodeScript): string {
  return script.title.replace(/\s*#shorts\b/gi, "").trim();
}

type VideoStatus = {
  status?: {
    video_status?: string;
    uploading_phase?: { status?: string };
    processing_phase?: { status?: string; error?: { message?: string } };
    publishing_phase?: { status?: string; publish_status?: string };
  };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Upload a Reel. With `publishAt` (ISO time more than 10 minutes ahead) it is scheduled;
 * otherwise it is published right away.
 */
export async function uploadFacebookReel(file: string, script: EpisodeScript, publishAt?: string): Promise<{ videoId: string; state: string }> {
  const pageId = req("FACEBOOK_PAGE_ID");
  const token = req("FACEBOOK_PAGE_TOKEN");

  // 1. Start an upload session
  const start = await graph<{ video_id: string; upload_url?: string }>("POST", `${pageId}/video_reels`, {
    upload_phase: "start",
    access_token: token,
  });
  const videoId = start.video_id;

  // 2. Upload the file in one request
  const bytes = await fs.readFile(file);
  const up = await fetch(`${RUPLOAD}/${config.facebookGraphVersion}/${videoId}`, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${token}`,
      offset: "0",
      file_size: String(bytes.length),
      "Content-Type": "application/octet-stream",
    },
    body: bytes,
  });
  const upJson = (await up.json().catch(() => ({}))) as { success?: boolean } & GraphError;
  if (!up.ok || !upJson.success) throw new Error(`Facebook upload failed: ${up.status} ${upJson.error?.message ?? JSON.stringify(upJson)}`);

  // 3. Publish now, or schedule (Facebook needs the time 10 min – 29 days ahead)
  const when = publishAt ? Math.floor(new Date(publishAt).getTime() / 1000) : 0;
  const draft = process.env.FACEBOOK_DRAFT === "true"; // test runs: save as a draft, never public
  const schedule = !draft && when > Date.now() / 1000 + 11 * 60;
  const params: Record<string, string> = {
    access_token: token,
    video_id: videoId,
    upload_phase: "finish",
    video_state: draft ? "DRAFT" : schedule ? "SCHEDULED" : "PUBLISHED",
    description: caption(script),
    title: fbTitle(script),
    is_ai_generated: "true", // script and voice are AI-generated
  };
  if (schedule) params.scheduled_publish_time = String(when);
  await graph("POST", `${pageId}/video_reels`, params);

  // 4. Wait until Facebook has processed it (or report a processing error)
  for (let i = 0; i < 30; i++) {
    await sleep(10_000);
    const st = await graph<VideoStatus>("GET", videoId, { fields: "status", access_token: token });
    const s = st.status ?? {};
    if (s.video_status === "error" || s.processing_phase?.status === "error" || s.publishing_phase?.status === "error") {
      throw new Error(`Facebook processing failed: ${s.processing_phase?.error?.message ?? s.video_status}`);
    }
    const pub = s.publishing_phase?.publish_status;
    if (s.video_status === "ready" || pub === "published" || pub === "scheduled" || pub === "draft") {
      return { videoId, state: draft ? "saved as draft" : schedule ? `scheduled for ${publishAt}` : "published" };
    }
  }
  console.warn("  Facebook is still processing the Reel; it should appear shortly.");
  return { videoId, state: schedule ? `scheduled for ${publishAt}` : "processing" };
}

/* ---------- photo post and story ---------- */

/** POST a multipart form (for image uploads). */
async function graphForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${GRAPH}/${config.facebookGraphVersion}/${path}`, { method: "POST", body: form });
  const json = (await res.json()) as T & GraphError;
  if (!res.ok || json.error) throw new Error(`Facebook ${path} failed: ${json.error?.code ?? res.status} ${json.error?.message ?? ""}`);
  return json;
}

async function imageForm(file: string, fields: Record<string, string>): Promise<FormData> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append("source", new Blob([await fs.readFile(file)], { type: "image/jpeg" }), "image.jpg");
  return form;
}

/** Caption for the photo post: the meme setup, pointing to the Reel for the full skit. */
function photoCaption(script: EpisodeScript): string {
  const tags = ["#sketchman", "#memes", "#relatable", "#funny", "#meme"];
  return `${script.pov} 💀\n\nFull skit in our Reels 🎬\n\n${tags.join(" ")}`;
}

/**
 * Post the meme picture on the Page. With `publishAt` more than 10 minutes ahead it is scheduled,
 * otherwise published now. FACEBOOK_DRAFT=true uploads it unpublished (hidden) for tests.
 */
export async function postFacebookPhoto(file: string, script: EpisodeScript, publishAt?: string): Promise<{ id: string; state: string }> {
  const pageId = req("FACEBOOK_PAGE_ID");
  const token = req("FACEBOOK_PAGE_TOKEN");
  const draft = process.env.FACEBOOK_DRAFT === "true";
  const when = publishAt ? Math.floor(new Date(publishAt).getTime() / 1000) : 0;
  const schedule = !draft && when > Date.now() / 1000 + 11 * 60;
  const fields: Record<string, string> = { access_token: token, message: photoCaption(script) };
  if (draft) fields.published = "false";
  else if (schedule) {
    fields.published = "false";
    fields.scheduled_publish_time = String(when);
  }
  const res = await graphForm<{ id: string; post_id?: string }>(`${pageId}/photos`, await imageForm(file, fields));
  return { id: res.post_id ?? res.id, state: draft ? "uploaded unpublished (test)" : schedule ? `scheduled for ${publishAt}` : "published" };
}

/**
 * Post an image as a Page Story. Stories can't be scheduled through the API, so it goes live now
 * and stays up for 24 hours. Skipped in draft/test mode because a Story has no draft state.
 */
export async function postFacebookStory(file: string): Promise<{ id: string; state: string }> {
  if (process.env.FACEBOOK_DRAFT === "true") return { id: "", state: "skipped in test mode (Stories have no draft)" };
  const pageId = req("FACEBOOK_PAGE_ID");
  const token = req("FACEBOOK_PAGE_TOKEN");
  // 1. Upload the image unpublished; 2. turn it into a Story.
  const photo = await graphForm<{ id: string }>(`${pageId}/photos`, await imageForm(file, { access_token: token, published: "false" }));
  const story = await graph<{ success?: boolean; post_id?: string }>("POST", `${pageId}/photo_stories`, { access_token: token, photo_id: photo.id });
  if (story.success === false) throw new Error("Facebook photo_stories returned success=false");
  return { id: story.post_id ?? photo.id, state: "published (live for 24 h)" };
}

/** Which Facebook formats are on. Each can be switched off with a repository variable. */
export const facebookParts = {
  reel: () => process.env.FACEBOOK_REEL !== "false",
  photo: () => process.env.FACEBOOK_PHOTO !== "false",
  story: () => process.env.FACEBOOK_STORY !== "false",
};
