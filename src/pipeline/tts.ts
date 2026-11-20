import { GoogleGenAI } from "@google/genai";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { Expression, Speaker, WordTiming } from "../shared/episode";
import { durationOf, ffmpeg, normalizeTake, stretchFilters, toEpisodeWav } from "./audio";
import { config, req } from "./config";
import { shouldFallBack, withRetry } from "./retry";

const run = promisify(execFile);

export type Voiced = { wavPath: string; duration: number; words: WordTiming[] };

/** Which voice to use. Each character has its own. */
export type VoiceSpec = { gemini: string; style: string; elevenId?: string; espeakPitch: string; pitch: number; speed: number };

/** Spread words across the clip by character length. Used when the provider gives no timings. */
function estimateWords(text: string, duration: number): WordTiming[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  const weights = tokens.map((t) => t.replace(/[^\w']/g, "").length + 1.5);
  const total = weights.reduce((a, b) => a + b, 0);
  let t = 0;
  return tokens.map((text, i) => {
    const d = (weights[i] / total) * duration;
    const w = { text, start: t, end: t + d };
    t += d;
    return w;
  });
}

/** ElevenLabs returns per-character timings; rebuild words from them. */
function wordsFromAlignment(a: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] }): WordTiming[] {
  const words: WordTiming[] = [];
  let cur: WordTiming | null = null;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (cur) words.push(cur);
      cur = null;
      return;
    }
    if (!cur) cur = { text: "", start: a.character_start_times_seconds[i], end: a.character_end_times_seconds[i] };
    cur.text += ch;
    cur.end = a.character_end_times_seconds[i];
  });
  if (cur) words.push(cur);
  return words;
}

async function elevenlabs(text: string, rawPath: string, v: VoiceSpec): Promise<WordTiming[] | null> {
  const voice = v.elevenId || req("ELEVENLABS_VOICE_ID");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": req("ELEVENLABS_API_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: config.elevenModel,
      voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.6, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    audio_base64: string;
    alignment?: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };
  };
  await fs.writeFile(rawPath, Buffer.from(json.audio_base64, "base64"));
  return json.alignment ? wordsFromAlignment(json.alignment) : null;
}

/**
 * Google Gemini TTS (Interactions API). Returns 24 kHz mono WAV.
 * Gemini gives no word timings, so captions use the estimate; Rhubarb still drives the mouth exactly.
 */
async function gemini(text: string, rawPath: string, v: VoiceSpec): Promise<null> {
  try {
    return await withRetry(`voice (${config.geminiModel})`, () => geminiOnce(config.geminiModel, text, rawPath, v));
  } catch (err) {
    if (!shouldFallBack(err) || !config.geminiTtsFallback) throw err;
    console.warn(`  ${config.geminiModel} is busy or out of quota; using ${config.geminiTtsFallback}`);
    return await withRetry(`voice (${config.geminiTtsFallback})`, () => geminiOnce(config.geminiTtsFallback, text, rawPath, v));
  }
}

async function geminiOnce(model: string, text: string, rawPath: string, v: VoiceSpec): Promise<null> {
  const ai = new GoogleGenAI({ apiKey: req("GEMINI_API_KEY") });
  const interaction = await ai.interactions.create({
    model,
    input: [
      {
        type: "user_input",
        content: [
          {
            type: "text",
            text,
            annotations: v.style ? [{ type: "speech_metadata", style: v.style }] : undefined,
          },
        ],
      },
    ],
    response_format: { type: "audio", mime_type: "audio/wav" },
    generation_config: { speech_config: [{ voice: v.gemini, language: config.ttsLanguage }] },
  });
  const data = interaction.output_audio?.data;
  if (!data) throw new Error(`Gemini returned no audio for: "${text}"`);
  await fs.writeFile(rawPath, Buffer.from(data, "base64"));
  return null;
}

/** Offline robot voice for testing the pipeline without API keys. */
async function espeak(text: string, rawPath: string, v: VoiceSpec): Promise<null> {
  await run("espeak-ng", ["-v", "en-us+m3", "-p", v.espeakPitch, "-s", "160", "-w", rawPath, text]);
  return null;
}

type Silence = { start: number; end: number };

export async function findSilences(file: string): Promise<Silence[]> {
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-i", file, "-af", "silencedetect=noise=-38dB:d=0.15", "-f", "null", "-"], {
    maxBuffer: 16 * 1024 * 1024,
  });
  const out: Silence[] = [];
  let start: number | null = null;
  for (const m of stderr.matchAll(/silence_(start|end): (-?[\d.]+)/g)) {
    if (m[1] === "start") start = Math.max(0, Number(m[2]));
    else if (start !== null) {
      out.push({ start, end: Number(m[2]) });
      start = null;
    }
  }
  return out;
}

/**
 * Pick one pause per line boundary. Each boundary's expected position comes from the line lengths;
 * the chosen pause is the longest one near that spot. Returns cut times in seconds, or null.
 */
export function chooseCuts(silences: Silence[], lines: string[], total: number): number[] | null {
  const weights = lines.map((l) => l.replace(/[^\w]/g, "").length + 4);
  const sum = weights.reduce((a, b) => a + b, 0);
  const cand = silences
    .filter((s) => s.start > 0.1 && s.end < total - 0.1)
    .map((s) => ({ mid: (s.start + s.end) / 2, dur: s.end - s.start }));
  const n = lines.length - 1;
  if (cand.length < n) return null;

  const expected: number[] = [];
  let acc = 0;
  for (let k = 0; k < n; k++) {
    acc += weights[k];
    expected.push((acc / sum) * total);
  }
  // Pause length matters most; distance from the expected spot only breaks ties.
  const score = (k: number, j: number) => cand[j].dur - 0.15 * Math.abs(cand[j].mid - expected[k]);

  // Dynamic programming: best[k][j] = best total when boundary k uses candidate j (candidates in time order).
  const m = cand.length;
  const best: number[][] = Array.from({ length: n }, () => Array(m).fill(-Infinity));
  const from: number[][] = Array.from({ length: n }, () => Array(m).fill(-1));
  for (let j = 0; j < m; j++) best[0][j] = score(0, j);
  for (let k = 1; k < n; k++) {
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < j; i++) {
        if (best[k - 1][i] === -Infinity || cand[j].mid - cand[i].mid < 0.4) continue;
        const v = best[k - 1][i] + score(k, j);
        if (v > best[k][j]) {
          best[k][j] = v;
          from[k][j] = i;
        }
      }
    }
  }
  let j = best[n - 1].indexOf(Math.max(...best[n - 1]));
  if (j < 0 || best[n - 1][j] === -Infinity) return null;
  const cuts: number[] = [];
  for (let k = n - 1; k >= 0; k--) {
    cuts.unshift(cand[j].mid);
    j = from[k][j];
  }
  return cuts;
}

/**
 * Voice the whole episode. With Gemini, all lines go in ONE request (the free tier allows only a
 * few TTS requests a day) and the audio is cut at the pauses between lines. Other providers, or a
 * failed split, fall back to one request per line.
 */
/** Spoken words in a line (for measuring pace). */
const wordCount = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/**
 * Measure how fast the voice actually talks (words per second over all of a character's lines)
 * and slow every clip down by the same factor until it matches config.targetWps.
 * Never speeds up, never slows below 0.8× (stretching more than that starts to sound artificial).
 */
async function pace(voiced: Voiced[], lines: string[], who: string): Promise<Voiced[]> {
  const words = lines.reduce((a, l) => a + wordCount(l), 0);
  const secs = voiced.reduce((a, x) => a + x.duration, 0);
  if (!words || !secs) return voiced;
  const before = words / secs;
  const factor = Math.max(0.8, Math.min(1, config.targetWps / before));
  if (factor > 0.985) {
    console.log(`  ${who} pace: ${before.toFixed(2)} words/s (target ${config.targetWps}), unchanged`);
    return voiced;
  }
  const out: Voiced[] = [];
  for (const x of voiced) {
    const tmp = x.wavPath.replace(/\.wav$/, ".pace.wav");
    await ffmpeg(["-i", x.wavPath, "-af", (await stretchFilters(factor)).join(",") || "anull", "-ar", "44100", "-ac", "1", tmp]);
    await fs.rename(tmp, x.wavPath);
    const duration = await durationOf(x.wavPath);
    const k = duration / Math.max(0.01, x.duration);
    out.push({ wavPath: x.wavPath, duration, words: x.words.map((w) => ({ text: w.text, start: w.start * k, end: w.end * k })) });
  }
  const after = words / out.reduce((a, x) => a + x.duration, 0);
  console.log(`  ${who} pace: ${before.toFixed(2)} → ${after.toFixed(2)} words/s (slowed ×${factor.toFixed(2)})`);
  if (process.env.GITHUB_ACTIONS) console.log(`::notice title=Voice pace ${who}::${before.toFixed(2)} → ${after.toFixed(2)} words per second (slowed x${factor.toFixed(2)})`);
  return out;
}

/** Voice one character's lines, then bring them to the target pace. */
export async function voiceEpisode(lines: string[], outWavs: string[], v: VoiceSpec, who = "voice"): Promise<Voiced[]> {
  const voiced = await voiceRaw(lines, outWavs, v);
  return pace(voiced, lines, who);
}

async function voiceRaw(lines: string[], outWavs: string[], v: VoiceSpec): Promise<Voiced[]> {
  if (!lines.length) return [];
  if (config.ttsProvider === "gemini" && lines.length > 1) {
    const raw = path.join(path.dirname(outWavs[0]), `voice-${v.gemini}.raw.wav`);
    await gemini(lines.join("\n"), raw, v);
    const take = raw.replace(/\.raw\.wav$/, ".take.wav");
    await normalizeTake(raw, take);
    await fs.rename(take, raw);
    const total = await durationOf(raw);
    const cuts = chooseCuts(await findSilences(raw), lines, total);
    if (cuts) {
      const bounds = [0, ...cuts, total];
      const voiced: Voiced[] = [];
      for (const [i, out] of outWavs.entries()) {
        const seg = out.replace(/\.wav$/, ".seg.wav");
        await ffmpeg(["-i", raw, "-ss", bounds[i].toFixed(3), "-to", bounds[i + 1].toFixed(3), seg]);
        await toEpisodeWav(seg, out, v.pitch, v.speed, false);
        await fs.rm(seg, { force: true });
        const duration = await durationOf(out);
        voiced.push({ wavPath: out, duration, words: estimateWords(lines[i], duration) });
      }
      await fs.rm(raw, { force: true });
      return voiced;
    }
    console.warn("  Could not find a pause between every line; voicing line by line instead.");
    await fs.rm(raw, { force: true });
  }
  const voiced: Voiced[] = [];
  for (const [i, line] of lines.entries()) voiced.push(await voiceLine(line, outWavs[i], v));
  return voiced;
}

export async function voiceLine(text: string, outWav: string, v: VoiceSpec): Promise<Voiced> {
  const raw = outWav.replace(/\.wav$/, config.ttsProvider === "elevenlabs" ? ".raw.mp3" : ".raw.wav");
  const provider = { gemini, elevenlabs, espeak }[config.ttsProvider];
  if (!provider) throw new Error(`Unknown TTS_PROVIDER "${config.ttsProvider}". Use gemini, elevenlabs or espeak.`);
  const timings = await provider(text, raw, v);

  const rawDuration = await durationOf(raw);
  await toEpisodeWav(raw, outWav, v.pitch, v.speed);
  await fs.rm(raw, { force: true });
  const duration = await durationOf(outWav);

  let words: WordTiming[];
  if (timings && timings.length) {
    // Silence trimming shifts the start; rescale provider timings onto the trimmed clip.
    const first = timings[0].start;
    const last = timings[timings.length - 1].end;
    const span = Math.max(0.01, Math.min(rawDuration, last) - first);
    const k = duration / span;
    words = timings.map((w) => ({ text: w.text, start: (w.start - first) * k, end: (w.end - first) * k }));
  } else {
    words = estimateWords(text, duration);
  }
  return { wavPath: outWav, duration, words };
}

/* ---------- two-character dialogue in one take ---------- */

/** How each face should sound. Sent with every line so the delivery matches the animation. */
const EMOTION: Record<Expression, string> = {
  happy: "cheerful and upbeat, smiling while talking",
  laughing: "amused, laughing a little while saying it",
  surprised: "genuinely shocked, a quick surprised gasp in the voice",
  thinking: "thoughtful and unsure, a little hesitant",
  wink: "sly and playful, a bit smug",
  sad: "disappointed and deflated, with a small sigh",
  angry: "frustrated and annoyed, exasperated",
  cool: "smug and confident, totally relaxed",
  exhausted: "completely exhausted, half asleep, slurred and slow",
  cryLaugh: "laughing so hard it's hard to talk, wheezing",
  terrified: "terrified, voice shaking",
  embarrassed: "embarrassed and awkward, quiet",
  furious: "furious, about to explode",
  overloaded: "wildly over-excited, sugar rush, giddy",
};

const NAME: Record<Speaker, string> = { sketch: "Sketch", bro: "Bro" };

const DIRECTION =
  "Funny cartoon skit between two friends. Sound like a real person in a casual conversation: natural rhythm, " +
  "natural breaths, real emotion; not an announcer, not reading a script. Relaxed pace, short pause between turns.";

export type DialogueLine = { speaker: Speaker; line: string; expression: Expression };

/**
 * Voice the whole skit as ONE natural conversation (Gemini multi-speaker), with an emotion
 * direction per line, then cut it into lines at the pauses. Returns null if Gemini refuses the
 * request or the cut fails, so the caller can fall back to voicing each character separately.
 */
export async function voiceDialogue(items: DialogueLine[], outWavs: string[], voices: Record<Speaker, VoiceSpec>): Promise<Voiced[] | null> {
  if (config.ttsProvider !== "gemini" || items.length < 2) return null;
  const speakers = [...new Set(items.map((i) => i.speaker))];
  const multi = speakers.length > 1;

  // Text: one line per turn. Multi-speaker needs "Name: text" so the model knows who speaks.
  let text = "";
  const annotations: Record<string, unknown>[] = [];
  for (const [k, it] of items.entries()) {
    const prefix = multi ? `${NAME[it.speaker]}: ` : "";
    // Ranges must cover the whole text, so each one includes its "Name: " prefix and the newline after it.
    const start = Buffer.byteLength(text);
    text += prefix + it.line;
    if (k < items.length - 1) text += "\n";
    const end = Buffer.byteLength(text);
    annotations.push({
      type: "speech_metadata",
      ...(multi ? { speaker: NAME[it.speaker] } : {}),
      style: `${DIRECTION} ${voices[it.speaker].style}. This line: ${EMOTION[it.expression]}.`,
      start_index: start,
      end_index: end,
    });
  }

  const dir = path.dirname(outWavs[0]);
  const raw = path.join(dir, "dialogue.raw.wav");
  const take = path.join(dir, "dialogue.take.wav");
  const call = (model: string) =>
    withRetry(`dialogue (${model})`, async () => {
      const ai = new GoogleGenAI({ apiKey: req("GEMINI_API_KEY") });
      const interaction = await ai.interactions.create({
        model,
        input: [
          {
            type: "user_input",
            // Multi-speaker needs a speaker on every annotation, so the overall direction is part of each line's style.
            content: [{ type: "text", text, annotations: annotations as never }],
          },
        ],
        response_format: { type: "audio", mime_type: "audio/wav" },
        generation_config: {
          speech_config: speakers.map((s) => ({
            ...(multi ? { speaker: NAME[s] } : {}),
            voice: voices[s].gemini,
            language: config.ttsLanguage,
          })),
        },
      });
      const data = interaction.output_audio?.data;
      if (!data) throw new Error("Gemini returned no audio for the dialogue.");
      await fs.writeFile(raw, Buffer.from(data, "base64"));
    });

  try {
    try {
      await call(config.geminiModel);
    } catch (err) {
      if (!shouldFallBack(err) || !config.geminiTtsFallback) throw err;
      console.warn(`  ${config.geminiModel} is busy or out of quota; using ${config.geminiTtsFallback}`);
      await call(config.geminiTtsFallback);
    }
    await normalizeTake(raw, take);
    const total = await durationOf(take);
    const cuts = chooseCuts(await findSilences(take), items.map((i) => i.line), total);
    if (!cuts) {
      console.warn("  Dialogue take: could not find a pause between every line; voicing each character separately.");
      if (process.env.GITHUB_ACTIONS) console.log("::warning title=Dialogue take::could not find a pause between every line");
      return null;
    }
    const bounds = [0, ...cuts, total];
    const voiced: Voiced[] = [];
    for (const [i, out] of outWavs.entries()) {
      const seg = out.replace(/\.wav$/, ".seg.wav");
      await ffmpeg(["-i", take, "-ss", bounds[i].toFixed(3), "-to", bounds[i + 1].toFixed(3), seg]);
      const v = voices[items[i].speaker];
      await toEpisodeWav(seg, out, v.pitch, v.speed, false);
      await fs.rm(seg, { force: true });
      const duration = await durationOf(out);
      voiced.push({ wavPath: out, duration, words: estimateWords(items[i].line, duration) });
    }
    // Bring each character to the target pace (same factor for all of that character's lines).
    for (const s of speakers) {
      const idx = items.map((it, i) => (it.speaker === s ? i : -1)).filter((i) => i >= 0);
      const paced = await pace(idx.map((i) => voiced[i]), idx.map((i) => items[i].line), s);
      idx.forEach((i, k) => (voiced[i] = paced[k]));
    }
    console.log(`  Dialogue take: ${multi ? "two voices" : "one voice"}, one conversation, ${items.length} lines`);
    return voiced;
  } catch (err) {
    const msg = String((err as Error)?.message ?? err).slice(0, 300);
    console.warn(`  Dialogue take failed (${msg}); voicing each character separately.`);
    if (process.env.GITHUB_ACTIONS) console.log(`::warning title=Dialogue take failed::${msg.replace(/[\r\n%]/g, " ")}`);
    return null;
  } finally {
    await Promise.all([raw, take].map((f) => fs.rm(f, { force: true })));
  }
}
