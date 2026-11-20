import { GoogleGenAI } from "@google/genai";
import fs from "node:fs/promises";
import { Action, Expression, Prop, Scene, Sfx } from "../shared/episode";
import { Effect, PantomimeScript, ShotType, Who } from "../shared/pantomime";
import { config, req } from "./config";
import type { HistoryEntry } from "./history";
import { shouldFallBack, withRetry } from "./retry";

const SCHEMA = {
  type: "object",
  required: ["title", "description", "tags", "theme", "pov", "scene", "shots"],
  properties: {
    title: { type: "string", description: "Shorts title, max 60 chars: the relatable situation + 1 emoji + ' #shorts'." },
    description: { type: "string", description: "1–2 short sentences, no spoilers, no links." },
    tags: { type: "array", items: { type: "string" }, description: "8–14 search tags." },
    theme: { type: "string" },
    pov: {
      type: "string",
      description: "The ONE line of text on screen for the whole meme (max 60 chars), first person or POV, e.g. 'Me after 3 hours of sleep: I'm fine'. It is the setup; the shots are the punchline.",
    },
    scene: { type: "string", enum: Scene.options, description: "Main set." },
    shots: {
      type: "array",
      description: "5–9 shots, hard cuts between them, 8–15 seconds in total.",
      items: {
        type: "object",
        required: ["shot", "who", "focus", "expression", "action", "prop", "effect", "sfx", "line", "seconds"],
        properties: {
          shot: {
            type: "string",
            enum: ShotType.options,
            description:
              "wide = whole scene; medium = waist up; closeup = face; extreme = face fills the screen, wobbling (use for the big reaction); peek = seen through a round dark vignette like a keyhole or someone watching; silhouette = dark backlit figures with glowing eyes (dramatic reveal).",
          },
          who: { type: "string", enum: Who.options },
          focus: { type: "string", enum: ["sketch", "bro"], description: "Who the camera is on (and who speaks the line)." },
          scene: { type: "string", enum: Scene.options, description: "Only when the location changes." },
          expression: { type: "string", enum: Expression.options, description: "Use the over-the-top faces: exhausted, cryLaugh, terrified, embarrassed, furious." },
          otherExpression: { type: "string", enum: Expression.options },
          action: { type: "string", enum: Action.options },
          prop: { type: "string", enum: Prop.options },
          effect: { type: "string", enum: Effect.options },
          sfx: { type: "string", enum: Sfx.options, description: "Meme sound at the cut. boom = punchline hit. Use 2–4 sounds per meme." },
          line: { type: "string", description: "Usually \"\". At most 2 shots may have a tiny spoken line of 1–5 words (like 'bro.' or 'I'm fine.')." },
          seconds: { type: "number", description: "0.7–2.5 seconds. Fast cuts: most shots about 1–1.5 s." },
        },
      },
    },
  },
} as const;

async function prompt(history: HistoryEntry[], trends: string): Promise<string> {
  const bible = await fs.readFile(config.paths.bible, "utf8");
  const recent = history.slice(-60).map((h) => `- ${h.title} (${h.theme})`).join("\n") || "- none";
  return `You make viral PANTOMIME meme Shorts with the cartoon Sketch Man (and sometimes his friend Bro).
Style: like the biggest cartoon-meme channels. Almost NO dialogue. One relatable line of text on screen,
then a fast series of shots where exaggerated faces, body language, camera cuts and meme sounds tell the joke.
It must be funny with the sound off and understood in any country. Audience: ${config.audience}.

<characters>
${bible}
</characters>

<recent_topics_do_not_repeat>
${recent}
</recent_topics_do_not_repeat>

<trending_now>
${trends || "none: pick an evergreen everyday situation"}
</trending_now>

Recipe that works:
1. Text setup: a confident or relatable claim ("3 hours of sleep doesn't affect me at all", "Trying not to laugh in class").
2. Show it going wrong, escalating fast (each shot a bit more absurd).
3. A surprising visual twist or reveal (silhouette, peek, extreme close-up), hit with "boom" or "scratch".
4. End on a strong reaction shot (extreme or closeup) so the Short loops.
Good shot rhythm: wide → closeup → medium → extreme → wide/silhouette → extreme. Change shot type every cut.
Use the big faces (exhausted, cryLaugh, terrified, embarrassed, furious) and effects (tears, sweat, zzz, steam).

Example (do not reuse): pov "Me pretending I'm not scared of the dark"; shots: wide bedroom, sketch cool thumbsUp; closeup sketch thinking (sfx heartbeat);
peek: bro silhouette in doorway; extreme sketch terrified tremble effect sweat (sfx scratch); wide sketch run (sfx slide); closeup bro cryLaugh tears (line "bro.").

Only write gags the animation can show: Sketch Man ALWAYS wears his glasses (never base a joke on taking them off),
the only props are phone, laptop, book and pencil, and the sets are the listed scenes. The joke must come from faces, poses,
camera cuts and timing, not from objects we can't draw.
Clean comedy only: no swearing, romance, violence, politics, religion, real people, brands, or other cartoon characters.
Write the title and the on-screen text in ${config.contentLanguage}.`;
}

export async function writePantomime(history: HistoryEntry[], trends: string): Promise<PantomimeScript> {
  const ai = new GoogleGenAI({ apiKey: req("GEMINI_API_KEY") });
  const text = await prompt(history, trends);
  const call = (model: string) =>
    withRetry(`pantomime script (${model})`, () =>
      ai.models.generateContent({ model, contents: text, config: { responseMimeType: "application/json", responseJsonSchema: SCHEMA, temperature: 1 } }),
    );
  for (let attempt = 1; attempt <= 3; attempt++) {
    let res;
    try {
      res = await call(config.geminiTextModel);
    } catch (err) {
      if (!shouldFallBack(err) || !config.geminiTextFallback) throw err;
      res = await call(config.geminiTextFallback);
    }
    try {
      const parsed = PantomimeScript.safeParse(JSON.parse(res.text ?? "{}"));
      if (parsed.success) {
        // Keep at most 2 spoken lines.
        let spoken = 0;
        for (const s of parsed.data.shots) if (s.line && ++spoken > 2) s.line = "";
        return parsed.data;
      }
      console.warn(`Pantomime script attempt ${attempt} failed validation:`, parsed.error.issues.slice(0, 3));
    } catch (e) {
      console.warn(`Pantomime script attempt ${attempt}: bad JSON`, String(e).slice(0, 200));
    }
  }
  throw new Error("Could not get a valid pantomime script after 3 attempts.");
}
