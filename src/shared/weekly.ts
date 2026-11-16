import type { Action, Expression, MouthCue, WordTiming } from "./episode";

export const WIDE_W = 1920;
export const WIDE_H = 1080;

/** One talking segment of the weekly video: Sketch Man on the left, a title card on the right. */
export type HostProps = {
  fps: number;
  line: string;
  audioFile?: string;
  /** Spoken length in seconds. */
  duration: number;
  /** Extra seconds after the line (outro end-screen space). */
  hold: number;
  words: WordTiming[];
  mouthCues: MouthCue[];
  expression: Expression;
  action: Action;
  /** Big card text, e.g. "MONDAY" or "THIS WEEK". */
  heading: string;
  /** Small text under the heading. */
  sub: string;
  watermark: string;
};

/** Background + side panels around a 9:16 episode placed in the middle of a 16:9 frame. */
export type ClipFrameProps = {
  day: string;
  date: string;
  pov: string;
  index: number;
  total: number;
  watermark: string;
};

export type ThumbProps = { text: string; sub: string };

/** Where the 9:16 clip sits in the 16:9 frame (full height). */
export const CLIP_BOX = { w: 608, h: 1080, x: Math.round((1920 - 608) / 2), y: 0 };
