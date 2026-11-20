import { z } from "zod";
import { Action, Expression, Prop, Scene, Sfx, type MouthCue, type WordTiming } from "./episode";

/** Camera for one shot. */
export const ShotType = z.enum(["wide", "medium", "closeup", "extreme", "peek", "silhouette"]);
export type ShotType = z.infer<typeof ShotType>;

/** Drawn on top of a character. */
export const Effect = z.enum(["none", "tears", "sweat", "shake", "zzz", "steam", "sparkle", "hearts"]);
export type Effect = z.infer<typeof Effect>;

/** Who is in the shot. */
export const Who = z.enum(["sketch", "bro", "both"]);
export type Who = z.infer<typeof Who>;

const ShortLine = z
  .string()
  .max(60)
  .default("")
  .transform((s) => {
    const t = s.trim();
    return /^[\s"'“”‘’.…\-–—*()[\]]*$/.test(t) ? "" : t;
  });

export const Shot = z.object({
  shot: ShotType,
  who: Who,
  /** Who the camera is on in "both" shots, and who speaks the line. */
  focus: z.enum(["sketch", "bro"]).default("sketch"),
  scene: Scene.optional(),
  expression: Expression,
  /** Face of the other character in "both" shots. */
  otherExpression: Expression.optional(),
  action: Action,
  prop: Prop.default("none"),
  effect: Effect.default("none"),
  sfx: Sfx.default("none"),
  /** Optional tiny spoken line (0–6 words). Most shots are silent. */
  line: ShortLine,
  /** Seconds on screen (stretched to fit a spoken line). */
  seconds: z.number().min(0.5).max(3.5),
});
export type Shot = z.infer<typeof Shot>;

export const PantomimeScript = z.object({
  title: z.string().min(5).max(90),
  description: z.string().min(10).max(900),
  tags: z.array(z.string()).min(3).max(15),
  theme: z.string().min(2).max(80),
  pov: z.string().min(4).max(80),
  scene: Scene,
  shots: z.array(Shot).min(4).max(12),
});
export type PantomimeScript = z.infer<typeof PantomimeScript>;

/** A shot after voice + sound effect files are made. */
export type RenderedShot = Shot & {
  duration: number;
  audioFile?: string;
  sfxFile?: string;
  words: WordTiming[];
  mouthCues: MouthCue[];
};

export type PantomimeProps = {
  pov: string;
  scene: z.infer<typeof Scene>;
  shots: RenderedShot[];
  fps: number;
  musicFile?: string;
  musicVolume: number;
  watermark: string;
  followText?: string;
};

export function pantomimeFrames(p: Pick<PantomimeProps, "shots" | "fps">): { starts: number[]; total: number } {
  const starts: number[] = [];
  let t = 0;
  for (const s of p.shots) {
    starts.push(Math.round(t * p.fps));
    t += s.duration;
  }
  return { starts, total: Math.max(1, Math.round(t * p.fps)) };
}
