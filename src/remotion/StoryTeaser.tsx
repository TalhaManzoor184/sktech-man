import React from "react";
import { AbsoluteFill } from "remotion";
import type { EpisodeProps } from "../shared/episode";
import { HAND_FONT } from "./Captions";
import { Episode } from "./Episode";
import { C, INK, Pencil } from "./sketch/SketchMan";

/** Props for the Facebook Story image: one frozen frame of the episode plus a "new meme" card. */
export type TeaserProps = EpisodeProps & {
  /** Frame of the episode to show behind the card (usually the hook). */
  teaserFrame: number;
  /** Big line, e.g. "NEW MEME". */
  headline: string;
  /** Small line, e.g. "Tonight 7 PM on Reels". */
  sub: string;
};

/** Still image for a Facebook Page Story (1080×1920). Rendered with renderStill at `teaserFrame`. */
export const StoryTeaser: React.FC<TeaserProps> = (p) => (
  <AbsoluteFill style={{ backgroundColor: C.paper }}>
    <Episode {...p} />
    <svg viewBox="0 0 540 960" width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
      {/* soft fade at the bottom so the card reads well */}
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.paper} stopOpacity={0} />
          <stop offset="1" stopColor={C.paper} stopOpacity={0.92} />
        </linearGradient>
      </defs>
      <rect x={0} y={600} width={540} height={360} fill="url(#fade)" />
      <g transform="translate(270 760) rotate(-3)">
        <rect x={-206} y={-76} width={420} height={160} rx={14} fill={INK} opacity={0.9} />
        <rect x={-212} y={-82} width={420} height={160} rx={14} fill={C.white} stroke={INK} strokeWidth={5} />
        <text x={-2} y={-12} textAnchor="middle" fontFamily={HAND_FONT} fontSize={62} fill={INK}>
          {p.headline}
        </text>
        <path d="M -150 6 Q -2 20 146 4" fill="none" stroke={C.yellow} strokeWidth={9} strokeLinecap="round" opacity={0.85} />
        <text x={-2} y={52} textAnchor="middle" fontFamily={HAND_FONT} fontSize={34} fill={INK}>
          {p.sub}
        </text>
        <g transform="translate(196 -70) rotate(28) scale(0.55)">
          <Pencil />
        </g>
      </g>
    </svg>
  </AbsoluteFill>
);
