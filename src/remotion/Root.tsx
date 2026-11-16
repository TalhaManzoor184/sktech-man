import "@fontsource/patrick-hand/400.css";
import React from "react";
import { Composition } from "remotion";
import { FPS, HEIGHT, WIDTH, type EpisodeProps } from "../shared/episode";
import { computeTimeline } from "../shared/timeline";
import { Episode } from "./Episode";
import { StoryTeaser, type TeaserProps } from "./StoryTeaser";
import { ClipFrame, WeeklyHost, WeeklyThumb } from "./weekly/Weekly";
import { WIDE_H, WIDE_W, type ClipFrameProps, type HostProps, type ThumbProps } from "../shared/weekly";

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
  <>
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
    {/* Facebook Story image: one frozen frame of the episode with a "new meme" card. */}
    <Composition
      id="StoryTeaser"
      component={StoryTeaser as unknown as React.FC<Record<string, unknown>>}
      width={WIDTH}
      height={HEIGHT}
      fps={FPS}
      durationInFrames={90}
      defaultProps={{ ...PREVIEW, teaserFrame: 30, headline: "NEW MEME", sub: "Tonight 7 PM on Reels" } satisfies TeaserProps as unknown as Record<string, unknown>}
      calculateMetadata={({ props }) => {
        const p = props as unknown as EpisodeProps;
        return { durationInFrames: computeTimeline(p).totalFrames, fps: p.fps };
      }}
    />
    {/* Weekly long-form compilation (16:9) */}
    <Composition
      id="WeeklyHost"
      component={WeeklyHost as unknown as React.FC<Record<string, unknown>>}
      width={WIDE_W}
      height={WIDE_H}
      fps={FPS}
      durationInFrames={120}
      defaultProps={
        {
          fps: FPS,
          line: "This week I folded a fitted sheet. The sheet won.",
          duration: 3,
          hold: 0.6,
          words: w("This week I folded a fitted sheet. The sheet won.", 3),
          mouthCues: [],
          expression: "happy",
          action: "wave",
          heading: "THIS WEEK",
          sub: "7 memes that hit way too close to home",
          watermark: "@sketchman",
        } satisfies HostProps as unknown as Record<string, unknown>
      }
      calculateMetadata={({ props }) => {
        const p = props as unknown as HostProps;
        return { durationInFrames: Math.max(1, Math.ceil((p.duration + p.hold) * p.fps)), fps: p.fps };
      }}
    />
    <Composition
      id="ClipFrame"
      component={ClipFrame as unknown as React.FC<Record<string, unknown>>}
      width={WIDE_W}
      height={WIDE_H}
      fps={FPS}
      durationInFrames={1}
      defaultProps={{ day: "MONDAY", date: "Nov 10", pov: "POV: you ask your friend for the answer during the exam", index: 1, total: 7, watermark: "@sketchman" } satisfies ClipFrameProps as unknown as Record<string, unknown>}
    />
    <Composition
      id="WeeklyThumb"
      component={WeeklyThumb as unknown as React.FC<Record<string, unknown>>}
      width={WIDE_W}
      height={WIDE_H}
      fps={FPS}
      durationInFrames={1}
      defaultProps={{ text: "Memes that hit too hard", sub: "WEEK 46" } satisfies ThumbProps as unknown as Record<string, unknown>}
    />
  </>
);
