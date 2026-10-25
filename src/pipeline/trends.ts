import { GoogleGenAI } from "@google/genai";
import { config } from "./config";
import { shouldFallBack, withRetry } from "./retry";

/**
 * Ask Gemini (with Google Search) what relatable topics and meme formats are trending this week.
 * Returns plain-text notes for the script writer, or "" when unavailable — the run never fails on this.
 */
export async function trendingNotes(): Promise<string> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!config.trends || !key) return "";
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `Today is ${today}. I make short cartoon meme skits (YouTube Shorts / Reels) for ${config.audience}.

Search the web and list 10 things that are trending or in season RIGHT NOW (this week or month) that a relatable, clean comedy skit could be built on, for example:
- relatable situations people are posting about (exams, season changes, holidays, festivals, new phone or game releases, sports events, viral challenges, school/work moments)
- trending meme FORMATS and phrases (describe the format, do not quote song lyrics)
- upcoming dates in the next 7 days (holidays, exam seasons, big releases)

Rules: no politics, no tragedies or disasters, no crime, no real people's names, no brand-bashing. Prefer things that work worldwide; mark anything specific to one country.
Answer as a short bullet list, one line each: the trend, then " → " and one funny skit angle.`;

  const ai = new GoogleGenAI({ apiKey: key });
  const call = (model: string) =>
    withRetry(`trends (${model})`, () =>
      ai.models.generateContent({ model, contents: prompt, config: { tools: [{ googleSearch: {} }], temperature: 0.7 } }),
    );
  try {
    let res;
    try {
      res = await call(config.geminiTextModel);
    } catch (err) {
      if (!shouldFallBack(err) || !config.geminiTextFallback) throw err;
      res = await call(config.geminiTextFallback);
    }
    const text = (res.text ?? "").trim();
    return text.slice(0, 4000);
  } catch (err) {
    console.warn(`  Trend lookup skipped: ${String((err as Error)?.message ?? err).slice(0, 200)}`);
    return "";
  }
}
