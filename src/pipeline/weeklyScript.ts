import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { Action, Expression } from "../shared/episode";
import { config } from "./config";
import { shouldFallBack, withRetry } from "./retry";

export const HostLine = z.object({
  line: z.string().min(2).max(160),
  expression: Expression,
  action: Action,
});
export type HostLine = z.infer<typeof HostLine>;

export const WeeklyScript = z.object({
  title: z.string().min(5).max(95),
  description: z.string().min(20).max(900),
  tags: z.array(z.string()).min(3).max(15),
  thumbnailText: z.string().min(3).max(40),
  intro: HostLine,
  /** One per episode, in order: Sketch Man introduces the next meme without spoiling it. */
  bridges: z.array(HostLine),
  outro: HostLine,
});
export type WeeklyScript = z.infer<typeof WeeklyScript>;

export type WeeklyEpisode = { day: string; title: string; theme: string; pov?: string };

const LINE = {
  type: "object",
  required: ["line", "expression", "action"],
  properties: {
    line: { type: "string", description: "What Sketch Man says, 6–22 words, spoken out loud, funny, in character." },
    expression: { type: "string", enum: Expression.options },
    action: { type: "string", enum: Action.options },
  },
} as const;

function schema(n: number) {
  return {
    type: "object",
    required: ["title", "description", "tags", "thumbnailText", "intro", "bridges", "outro"],
    properties: {
      title: { type: "string", description: "YouTube title for the weekly compilation, max 70 characters, curiosity + relatable, 1 emoji, NO #shorts." },
      description: { type: "string", description: "2–3 sentences about this week's memes. No links, no timestamps (added automatically)." },
      tags: { type: "array", items: { type: "string" }, description: "8–14 tags: memes, relatable, compilation, animation, funny, the themes of the week." },
      thumbnailText: { type: "string", description: "2–5 punchy words for the thumbnail, e.g. 'MEMES THAT HIT TOO HARD'." },
      intro: { ...LINE, description: "Sketch Man welcomes viewers to this week's memes (hook in the first sentence)." },
      bridges: { type: "array", items: LINE, minItems: n, maxItems: n, description: `Exactly ${n} lines, one before each meme, in order. Tease the situation, never spoil the punchline. Start with the day, e.g. "Tuesday, …".` },
      outro: { ...LINE, description: "Sketch Man wraps up and invites viewers to subscribe for a new meme every day at 7 PM. Friendly, not pushy." },
    },
  } as const;
}

/** Safe defaults if the writer is unavailable, so the weekly video still goes out. */
export function fallbackScript(eps: WeeklyEpisode[], week: string): WeeklyScript {
  return {
    title: `Sketch Man: This Week's Most Relatable Memes 😭 (${week})`,
    description: `Every Sketch Man meme from this week in one place: ${eps.map((e) => e.theme).join(", ")}.`,
    tags: ["sketch man", "memes", "relatable", "funny", "animation", "compilation", "cartoon"],
    thumbnailText: "Memes that hit too hard",
    intro: { line: "Hey! It's Sketch Man. Here's every disaster from my week. Yes, all of them.", expression: "happy", action: "wave" },
    bridges: eps.map((e) => ({ line: `${e.day}. ${e.theme}. Don't ask.`, expression: "thinking", action: "think" })),
    outro: { line: "That's my week. New meme every day at seven. Subscribe so you don't miss tomorrow's disaster.", expression: "happy", action: "thumbsUp" },
  };
}

export async function writeWeeklyScript(eps: WeeklyEpisode[], week: string): Promise<WeeklyScript> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return fallbackScript(eps, week);
  const list = eps.map((e, i) => `${i + 1}. ${e.day}: "${e.title.replace(/\s*#shorts/i, "")}" — ${e.pov ?? e.theme}`).join("\n");
  const prompt = `You are Sketch Man, a nerdy, dramatic hand-drawn cartoon guy, hosting the weekly compilation of your YouTube Shorts memes (${week}).
Write in ${config.contentLanguage}. Clean comedy for teens and young adults. Lines must sound like natural speech: contractions, short sentences.

This week's memes, in order:
${list}

Write the intro, one bridge line before each meme (exactly ${eps.length}), the outro, and the YouTube title/description/tags/thumbnail text.`;
  const ai = new GoogleGenAI({ apiKey: key });
  const call = (model: string) =>
    withRetry(`weekly script (${model})`, () =>
      ai.models.generateContent({ model, contents: prompt, config: { responseMimeType: "application/json", responseJsonSchema: schema(eps.length), temperature: 0.9 } }),
    );
  try {
    let res;
    try {
      res = await call(config.geminiTextModel);
    } catch (err) {
      if (!shouldFallBack(err) || !config.geminiTextFallback) throw err;
      res = await call(config.geminiTextFallback);
    }
    const parsed = WeeklyScript.safeParse(JSON.parse(res.text ?? "{}"));
    if (parsed.success && parsed.data.bridges.length === eps.length) return parsed.data;
    console.warn("  Weekly script did not validate; using the default lines.");
  } catch (err) {
    console.warn(`  Weekly script failed (${String((err as Error)?.message ?? err).slice(0, 200)}); using the default lines.`);
  }
  return fallbackScript(eps, week);
}
