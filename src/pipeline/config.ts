import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { VoiceSpec } from "./tts";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function opt(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export function req(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}. Add it to .env (local) or the GitHub repository secrets.`);
  return v;
}

export const config = {
  // Script writer: gemini (default) or claude
  scriptProvider: opt("SCRIPT_PROVIDER", "gemini") as "gemini" | "claude",
  geminiTextModel: opt("GEMINI_TEXT_MODEL", "gemini-3.8-flash"),
  /** Used when the main text model stays overloaded after retries. Empty to disable. */
  geminiTextFallback: opt("GEMINI_TEXT_FALLBACK", "gemini-3.5-flash-lite"),
  anthropicModel: opt("ANTHROPIC_MODEL", "claude-sonnet-5-5"),

  /** Look up what is trending this week (Gemini + Google Search) before writing. "off" to skip. */
  trends: opt("TRENDS", "on") !== "off",
  /** Language the jokes are written and spoken in, e.g. "English" or "Hinglish (Roman Urdu/Hindi mixed with English)". */
  contentLanguage: opt("CONTENT_LANGUAGE", "English"),
  /** Who the jokes are aimed at. Used for trend research and the script. */
  audience: opt("AUDIENCE", "teens and young adults worldwide, especially the US, UK, India and Pakistan"),

  // Voice
  ttsProvider: opt("TTS_PROVIDER", "gemini") as "gemini" | "elevenlabs" | "espeak",
  geminiModel: opt("GEMINI_TTS_MODEL", "gemini-3.8-flash-tts"),
  geminiTtsFallback: opt("GEMINI_TTS_FALLBACK", "gemini-3.8-flash-lite-tts"),
  /** BCP-47 language for the voice: en-US, en-IN, hi-IN, ur-PK… */
  ttsLanguage: opt("TTS_LANGUAGE", "en-US"),
  elevenModel: opt("ELEVENLABS_MODEL", "eleven_multilingual_v2"),

  voices: {
    sketch: {
      gemini: opt("SKETCH_VOICE", "Puck"),
      style: opt("SKETCH_STYLE", "nerdy, fast-talking, easily panicked young guy with sitcom comic timing; expressive and funny, not too fast"),
      elevenId: opt("ELEVENLABS_VOICE_ID"),
      espeakPitch: "60",
      pitch: Number(opt("SKETCH_PITCH", "1.05")),
    } satisfies VoiceSpec,
    bro: {
      gemini: opt("BRO_VOICE", "Fenrir"),
      style: opt("BRO_STYLE", "laid-back, overconfident best friend; deadpan, slow and smug, very funny"),
      elevenId: opt("ELEVENLABS_BRO_VOICE_ID"),
      espeakPitch: "30",
      pitch: Number(opt("BRO_PITCH", "0.95")),
    } satisfies VoiceSpec,
  },

  // Lip sync
  rhubarbPath: opt("RHUBARB_PATH", "rhubarb"),

  // Render
  chromePath: opt("CHROME_PATH") || undefined,
  watermark: opt("WATERMARK", "@sketchman"),

  // Upload
  /** "schedule" = private now, auto-public at PUBLISH_TIME (after PUBLISH_DELAY_DAYS).
   *  "private"  = private, you publish by hand.
   *  "public"   = public immediately. */
  uploadMode: opt("UPLOAD_MODE", "schedule") as "schedule" | "private" | "public",
  /** Local time of day to go public in schedule mode, HH:MM. 19:00 PKT = 10:00 AM New York. */
  publishTime: opt("PUBLISH_TIME", "19:00"),
  publishUtcOffset: Number(opt("PUBLISH_UTC_OFFSET", "5")),
  publishDelayDays: Number(opt("PUBLISH_DELAY_DAYS", "0")),
  /** Meme comedy for teens/adults: not made for kids. */
  madeForKids: opt("MADE_FOR_KIDS", "false") === "true",
  /** YouTube metadata language, e.g. en, hi, ur. */
  videoLanguage: opt("VIDEO_LANGUAGE", "en"),

  paths: {
    bible: path.join(ROOT, "character/bible.md"),
    history: path.join(ROOT, "data/history.json"),
    sample: path.join(ROOT, "data/sample-episode.json"),
    music: path.join(ROOT, "assets/music"),
    out: path.join(ROOT, "out"),
    entry: path.join(ROOT, "src/remotion/index.ts"),
  },
};
