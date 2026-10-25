import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import fs from "node:fs/promises";
import { Action, EpisodeScript, Expression, Prop, Scene, Sfx, Speaker } from "../shared/episode";
import { config, req } from "./config";
import type { HistoryEntry } from "./history";
import { shouldFallBack, withRetry } from "./retry";

const E = Expression.options;
const A = Action.options;

/** JSON Schema for one episode. Shared by both script writers. */
const EPISODE_SCHEMA = {
  type: "object",
  required: ["title", "description", "tags", "theme", "pov", "scene", "beats"],
  properties: {
    title: {
      type: "string",
      description: "YouTube Shorts title, max 60 characters. Relatable meme style (e.g. 'When the teacher says it's open book 😭'), 1–2 emoji, then ' #shorts'. Not clickbait, not aimed at children.",
    },
    description: { type: "string", description: "1–2 short funny sentences about the situation without spoiling the punchline. No links." },
    tags: { type: "array", items: { type: "string" }, description: "8–14 search tags: the situation, 'relatable', 'meme', 'animation', 'funny', plus the trend if one is used." },
    theme: { type: "string", description: "The one situation of the episode in a few words." },
    pov: {
      type: "string",
      description: "The setup text shown on screen for the whole Short, max 70 characters. Usually starts with 'POV:' or 'When'. Written in the content language.",
    },
    scene: { type: "string", enum: Scene.options },
    beats: {
      type: "array",
      description: "4–9 beats in order. The skit is 12–30 seconds.",
      items: {
        type: "object",
        required: ["speaker", "line", "expression", "action", "prop", "sfx"],
        properties: {
          speaker: { type: "string", enum: Speaker.options },
          line: { type: "string", description: "What the speaker says: 2–14 words, punchy. Use \"\" for a silent reaction shot (max 2 per episode)." },
          expression: { type: "string", enum: E },
          action: { type: "string", enum: A },
          prop: { type: "string", enum: Prop.options },
          sfx: { type: "string", enum: Sfx.options, description: "Plays as the beat starts. 'boom' also zooms the camera into the speaker's face; use it on the punchline reaction." },
          otherExpression: { type: "string", enum: E, description: "Face of the character who is listening (only when Bro is in the episode)." },
          scene: { type: "string", enum: Scene.options, description: "Optional set change from this beat on." },
        },
      },
    },
  },
} as const;

async function buildPrompt(history: HistoryEntry[], trends: string): Promise<string> {
  const bible = await fs.readFile(config.paths.bible, "utf8");
  const recent = history.slice(-40).map((h) => `- ${h.date}: ${h.title} (theme: ${h.theme})`).join("\n") || "- none yet";
  return `You write the daily YouTube Shorts meme skit for Sketch Man, a hand-drawn cartoon. Audience: ${config.audience}.
Write everything the viewer reads or hears (title, POV text, lines) in ${config.contentLanguage}.

<character_bible>
${bible}
</character_bible>

<recent_episodes>
${recent}
</recent_episodes>

<trending_now>
${trends || "No trend list today: pick an evergreen relatable situation from the bible."}
</trending_now>

Write today's episode. Requirements:
- Pick ONE situation that is not in the recent episodes (vary the theme family too, not just the wording).
  If a trending item fits Sketch Man's world and the content rules, prefer it; otherwise go evergreen.
- The joke must land without sound too: the POV text sets it up, faces and actions sell it.
- Beat 1 is the hook and must be funny or intriguing within 2 seconds. Build fast to a twist or punchline.
- End right after the punchline reaction (no wrap-up line, no catchphrase) so the Short loops.
- Total spoken words 25–70.
- Match expression, action, prop and sfx to each line. Use at most 3 sound effects.
- Do not ask viewers to like, comment or subscribe. No hashtags except #shorts in the title.`;
}

async function askClaude(prompt: string): Promise<unknown> {
  const client = new Anthropic({ apiKey: req("ANTHROPIC_API_KEY") });
  const res = await client.messages.create({
    model: config.anthropicModel,
    max_tokens: 2500,
    tools: [{ name: "write_episode", description: "Save today's Sketch Man episode script.", input_schema: EPISODE_SCHEMA as unknown as Anthropic.Tool.InputSchema }],
    tool_choice: { type: "tool", name: "write_episode" },
    messages: [{ role: "user", content: prompt + "\nCall the write_episode tool with the result." }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  return block && "input" in block ? block.input : undefined;
}

async function askGemini(prompt: string): Promise<unknown> {
  const ai = new GoogleGenAI({ apiKey: req("GEMINI_API_KEY") });
  const call = (model: string) =>
    withRetry(`script (${model})`, () =>
      ai.models.generateContent({
        model,
        contents: prompt + "\nReturn the episode as JSON matching the schema.",
        config: { responseMimeType: "application/json", responseJsonSchema: EPISODE_SCHEMA, temperature: 1 },
      }),
    );
  let res;
  try {
    res = await call(config.geminiTextModel);
  } catch (err) {
    if (!shouldFallBack(err) || !config.geminiTextFallback) throw err;
    console.warn(`  ${config.geminiTextModel} is busy or out of quota; using ${config.geminiTextFallback}`);
    res = await call(config.geminiTextFallback);
  }
  const text = res.text;
  if (!text) throw new Error("Gemini returned an empty script.");
  return JSON.parse(text);
}

export async function writeScript(history: HistoryEntry[], trends: string): Promise<EpisodeScript> {
  const prompt = await buildPrompt(history, trends);
  const ask = config.scriptProvider === "claude" ? askClaude : askGemini;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const parsed = EpisodeScript.safeParse(await ask(prompt));
      if (parsed.success) return parsed.data;
      console.warn(`Script attempt ${attempt} failed validation:`, parsed.error.issues.slice(0, 3));
    } catch (e) {
      if (attempt === 3) throw e;
      console.warn(`Script attempt ${attempt} failed:`, String(e).slice(0, 300));
    }
  }
  throw new Error("Could not get a valid episode script after 3 attempts.");
}
