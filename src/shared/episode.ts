import { z } from "zod";

/** Faces from the Sketch Man concept sheet. "cool" swaps the glasses for sunglasses. */
export const Expression = z.enum([
  "happy", "laughing", "surprised", "thinking", "wink", "sad", "angry", "cool",
  // over-the-top meme faces
  "exhausted", "cryLaugh", "terrified", "embarrassed", "furious", "overloaded",
]);
export type Expression = z.infer<typeof Expression>;

/** Body animation for a beat. */
export const Action = z.enum(["idle", "thumbsUp", "point", "run", "shrug", "facepalm", "jump", "panic", "think", "wave", "sleepwalk", "tremble", "stretch"]);
export type Action = z.infer<typeof Action>;

/** Something held in the hands for the whole beat. */
export const Prop = z.enum(["none", "phone", "laptop", "book", "pencil", "candy"]);
export type Prop = z.infer<typeof Prop>;

/** Sound effect played when the beat starts. All are synthesised, so they are royalty-free. */
export const Sfx = z.enum(["none", "boom", "whoosh", "ding", "pop", "sad", "drumroll", "slide", "boing", "scratch", "snore", "heartbeat", "gulp"]);
export type Sfx = z.infer<typeof Sfx>;

/** Hand-drawn sets. */
export const Scene = z.enum(["classroom", "bedroom", "street", "kitchen", "paper", "bathroom", "office"]);
export type Scene = z.infer<typeof Scene>;

/** Who is talking. "bro" is Sketch Man's best friend. */
export const Speaker = z.enum(["sketch", "bro"]);
export type Speaker = z.infer<typeof Speaker>;

/** One beat of the skit. An empty line is a silent reaction shot. */
/** Writers sometimes return `""`, "...", "(silence)" or "-" for a silent beat. Treat those as empty. */
const SpokenLine = z
  .string()
  .max(140)
  .transform((s) => {
    const t = s.trim();
    if (/^[\s"'“”‘’.…\-–—*]*$/.test(t)) return "";
    if (/^[([]\s*(silence|silent|pause|reaction|no line|beat)[^)\]]*[)\]]$/i.test(t)) return "";
    return t;
  });

export const Beat = z.object({
  speaker: Speaker,
  line: SpokenLine,
  expression: Expression,
  action: Action,
  prop: Prop.default("none"),
  sfx: Sfx.default("none"),
  /** Face of the character who is NOT speaking (two-character episodes). */
  otherExpression: Expression.optional(),
  scene: Scene.optional(),
});
export type Beat = z.infer<typeof Beat>;

/** What the script writer produces. */
export const EpisodeScript = z
  .object({
    title: z.string().min(5).max(90),
    description: z.string().min(20).max(900),
    tags: z.array(z.string()).min(3).max(15),
    theme: z.string().min(2).max(80),
    /** The "POV: ..." text that stays at the top of the screen. */
    pov: z.string().min(4).max(80),
    scene: Scene,
    beats: z.array(Beat).min(3).max(12),
  })
  .refine((s) => s.beats.some((b) => b.line.trim()), { message: "At least one beat must have a spoken line." });
export type EpisodeScript = z.infer<typeof EpisodeScript>;

/** Rhubarb mouth shapes. */
export const MouthShape = z.enum(["A", "B", "C", "D", "E", "F", "G", "H", "X"]);
export type MouthShape = z.infer<typeof MouthShape>;

export type MouthCue = { start: number; end: number; value: MouthShape };
export type WordTiming = { text: string; start: number; end: number };

/** A beat after voice + lip sync, with timing in seconds relative to the beat start. */
export type RenderedBeat = Beat & {
  audioFile?: string; // relative to Remotion's public dir; absent for silent beats
  sfxFile?: string;
  duration: number;
  words: WordTiming[];
  mouthCues: MouthCue[];
};

/** Everything the Remotion composition needs. Passed as inputProps. */
export type EpisodeProps = {
  title: string;
  pov: string;
  scene: Scene;
  beats: RenderedBeat[];
  musicFile?: string;
  fps: number;
  gapSeconds: number;
  /** Hold on the last frame so the Short loops cleanly. */
  outroSeconds: number;
  /** Small handle in the corner, e.g. "@sketchman". Empty to hide. */
  watermark: string;
  /** Small sticker on the last beat, e.g. "Follow for tomorrow's disaster". Empty to hide. */
  followText?: string;
};

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
/** Length of a silent reaction beat. */
export const SILENT_BEAT_SECONDS = 1.7;
