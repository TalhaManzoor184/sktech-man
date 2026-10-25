import "@fontsource/patrick-hand/400.css";
import React from "react";
import { Composition } from "remotion";
import { FPS, HEIGHT, WIDTH, type EpisodeProps } from "../shared/episode";
import { computeTimeline } from "../shared/timeline";
import { Episode } from "./Episode";

const w = (line: string, duration: number) => {
  const tokens = line.split(" ");
  return tokens.map((text, i) => ({ text, start: (i / tokens.length) * duration, end: ((i + 1) / tokens.length) * duration }));
};

/** Placeholder props so `npm run studio` opens without a generated episode. */
const PREVIEW: EpisodeProps = {
  title: "Preview",
  pov: "POV: you're doing the homework at the last minute",
  scene: "classroom",
  fps: FPS,
  gapSeconds: 0.3,
  outroSeconds: 0.4,
  watermark: "@sketchman",
  beats: [
    { speaker: "sketch", line: "Bro, what did you get for question five?", expression: "thinking", action: "think", prop: "book", sfx: "none", audioFile: "", duration: 2, words: w("Bro, what did you get for question five?", 2), mouthCues: [] },
    { speaker: "bro", line: "Seventy two. Trust me.", expression: "cool", action: "thumbsUp", prop: "none", sfx: "pop", otherExpression: "happy", audioFile: "", duration: 1.6, words: w("Seventy two. Trust me.", 1.6), mouthCues: [] },
    { speaker: "sketch", line: "", expression: "surprised", action: "idle", prop: "none", sfx: "boom", otherExpression: "cool", duration: 1.1, words: [], mouthCues: [] },
  ],
};

export const Root: React.FC = () => (
  <Composition
    id="SketchEpisode"
    component={Episode as unknown as React.FC<Record<string, unknown>>}
    width={WIDTH}
    height={HEIGHT}
    fps={FPS}
    durationInFrames={90}
    defaultProps={PREVIEW as unknown as Record<string, unknown>}
    calculateMetadata={({ props }) => {
      const p = props as unknown as EpisodeProps;
      return { durationInFrames: computeTimeline(p).totalFrames, fps: p.fps };
    }}
  />
);
