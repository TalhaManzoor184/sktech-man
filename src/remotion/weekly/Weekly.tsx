import React from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from "remotion";
import type { MouthShape } from "../../shared/episode";
import { CLIP_BOX, type ClipFrameProps, type HostProps, type ThumbProps } from "../../shared/weekly";
import { HAND_FONT } from "../Captions";
import { blendedPose } from "../pose";
import { C, Character, CharacterDefs, INK, Pencil } from "../sketch/SketchMan";

/* Landscape (1920×1080) pieces of the weekly compilation, drawn in the same pencil style. */

const Paper: React.FC = () => (
  <g>
    <defs>
      <pattern id="ruledWide" width={1920} height={54} patternUnits="userSpaceOnUse">
        <line x1={0} y1={53} x2={1920} y2={53} stroke="#8DB3D9" strokeWidth={2} opacity={0.45} />
      </pattern>
    </defs>
    <rect width={1920} height={1080} fill={C.paper} />
    <rect y={80} width={1920} height={1000} fill="url(#ruledWide)" />
    <path d="M 110 0 V 1080" stroke="#E39AA6" strokeWidth={3} opacity={0.6} />
  </g>
);

const Boil: React.FC<{ frame: number }> = ({ frame }) => (
  <filter id="boilWide" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves={2} seed={Math.floor(frame / 3) % 7} result="n" />
    <feDisplacementMap in="SourceGraphic" in2="n" scale={4} xChannelSelector="R" yChannelSelector="G" />
  </filter>
);

function wrap(text: string, max: number, maxLines = 4): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (cur && (cur + " " + w).length > max) {
      out.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  return out.slice(0, maxLines);
}

/** Sketch Man hosting: talks (lip-synced) on the left, chapter card + captions on the right. */
export const WeeklyHost: React.FC<HostProps> = (p) => {
  const frame = useCurrentFrame();
  const t = frame / p.fps;
  const talking = !!p.audioFile && t <= p.duration;
  const cue = talking ? p.mouthCues.find((c) => t >= c.start && t < c.end) : undefined;
  const mouth: MouthShape | null = talking ? (cue?.value ?? "X") : null;
  const pose = blendedPose(p.action, t);
  const blink = frame % 104 < 4 && !["laughing", "wink", "cool"].includes(p.expression);
  const appear = Math.min(1, frame / 8);
  const sub = wrap(p.sub, 30, 3);
  // Current caption line (whole line, active word highlighted).
  const words = p.words;
  return (
    <AbsoluteFill style={{ backgroundColor: C.paper }}>
      <svg viewBox="0 0 1920 1080" width="100%" height="100%">
        <defs>
          <Boil frame={frame} />
        </defs>
        <CharacterDefs id="host" variant="sketch" />
        <g filter="url(#boilWide)">
          <Paper />
          <g transform={`translate(${(520 + pose.x).toFixed(1)} ${(1010 + pose.y * 1.5).toFixed(1)}) rotate(${pose.tilt.toFixed(2)}) scale(1.5)`}>
            <Character id="host" variant="sketch" expression={p.expression} mouth={mouth} blink={blink} pose={pose} look={[4, 0]} />
          </g>
          {/* chapter card */}
          <g transform={`translate(1290 330) rotate(-2) scale(${0.92 + 0.08 * appear})`} opacity={appear}>
            <rect x={-470} y={-150} width={940} height={300} rx={22} fill={INK} opacity={0.9} transform="translate(10 10)" />
            <rect x={-470} y={-150} width={940} height={300} rx={22} fill={C.white} stroke={INK} strokeWidth={6} />
            <text x={0} y={-30} textAnchor="middle" fontFamily={HAND_FONT} fontSize={110} fill={INK}>
              {p.heading}
            </text>
            <path d="M -300 8 Q 0 30 300 4" fill="none" stroke={C.yellow} strokeWidth={14} strokeLinecap="round" opacity={0.85} />
            {sub.map((l, i) => (
              <text key={i} x={0} y={70 + i * 48} textAnchor="middle" fontFamily={HAND_FONT} fontSize={42} fill={INK}>
                {l}
              </text>
            ))}
            <g transform="translate(450 -150) rotate(30) scale(0.9)">
              <Pencil />
            </g>
          </g>
        </g>
        {/* captions */}
        {talking && words.length > 0 && (
          <text x={1290} y={760} textAnchor="middle" fontFamily={HAND_FONT} fontSize={64} paintOrder="stroke" stroke="#FFFFFF" strokeWidth={14} strokeLinejoin="round">
            {pageOf(words, t).map((w, i) => (
              <tspan key={i} dx={i ? 14 : 0} fill={t >= w.start && t < w.end ? C.blue : INK}>
                {w.text}
              </tspan>
            ))}
          </text>
        )}
        {p.watermark && (
          <text x={1880} y={1050} textAnchor="end" fontFamily={HAND_FONT} fontSize={34} fill={INK} opacity={0.45}>
            {p.watermark}
          </text>
        )}
      </svg>
      {p.audioFile && <Audio src={staticFile(p.audioFile)} />}
    </AbsoluteFill>
  );
};

/** Up to ~32 characters of words around the one being spoken. */
function pageOf(words: HostProps["words"], t: number) {
  const pages: (typeof words)[] = [];
  let cur: typeof words = [];
  let len = 0;
  for (const w of words) {
    if (cur.length && len + w.text.length + 1 > 32) {
      pages.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(w);
    len += w.text.length + 1;
  }
  if (cur.length) pages.push(cur);
  return pages.find((pg) => pg.some((w) => t < w.end)) ?? pages[pages.length - 1];
}

/** Still frame drawn around each 9:16 episode: day + date on the left, the POV setup on the right. */
export const ClipFrame: React.FC<ClipFrameProps> = (p) => {
  const pov = wrap(p.pov, 20, 5);
  const L = CLIP_BOX.x / 2;
  const R = CLIP_BOX.x + CLIP_BOX.w + CLIP_BOX.x / 2;
  return (
    <AbsoluteFill style={{ backgroundColor: C.paper }}>
      <svg viewBox="0 0 1920 1080" width="100%" height="100%">
        <Paper />
        {/* hole outline for the clip */}
        <rect x={CLIP_BOX.x - 8} y={-10} width={CLIP_BOX.w + 16} height={1100} fill={INK} />
        <g transform={`translate(${L} 300) rotate(-3)`}>
          <text x={0} y={0} textAnchor="middle" fontFamily={HAND_FONT} fontSize={104} fill={INK}>
            {p.day}
          </text>
          <path d="M -200 26 Q 0 46 200 20" fill="none" stroke={C.yellow} strokeWidth={14} strokeLinecap="round" opacity={0.85} />
          <text x={0} y={100} textAnchor="middle" fontFamily={HAND_FONT} fontSize={44} fill={INK} opacity={0.7}>
            {p.date}
          </text>
          <text x={0} y={250} textAnchor="middle" fontFamily={HAND_FONT} fontSize={40} fill={INK} opacity={0.6}>
            Meme {p.index} of {p.total}
          </text>
        </g>
        <g transform={`translate(${R} 420) rotate(2)`}>
          <rect x={-300} y={-60 - pov.length * 28} width={600} height={120 + pov.length * 56} rx={18} fill={C.white} stroke={INK} strokeWidth={5} />
          {pov.map((l, i) => (
            <text key={i} x={0} y={-pov.length * 28 + 30 + i * 56} textAnchor="middle" fontFamily={HAND_FONT} fontSize={46} fill={INK}>
              {l}
            </text>
          ))}
        </g>
        <g transform={`translate(${R} 900)`}>
          <text x={0} y={0} textAnchor="middle" fontFamily={HAND_FONT} fontSize={38} fill={INK} opacity={0.65}>
            New meme every day · 7 PM
          </text>
          {p.watermark && (
            <text x={0} y={52} textAnchor="middle" fontFamily={HAND_FONT} fontSize={34} fill={INK} opacity={0.45}>
              {p.watermark}
            </text>
          )}
        </g>
      </svg>
    </AbsoluteFill>
  );
};

/** 1280×720 thumbnail: big hand-lettered text and a shocked Sketch Man. */
export const WeeklyThumb: React.FC<ThumbProps> = (p) => {
  const lines = wrap(p.text.toUpperCase(), 14, 3);
  const idle = blendedPose("panic", 0.3);
  return (
    <AbsoluteFill style={{ backgroundColor: C.paper }}>
      <svg viewBox="0 0 1920 1080" width="100%" height="100%">
        <Paper />
        <rect width={1920} height={1080} fill={C.yellow} opacity={0.22} />
        <CharacterDefs id="thumb" variant="sketch" />
        <g transform="translate(1460 1110) scale(1.75)">
          <Character id="thumb" variant="sketch" expression="surprised" pose={idle} />
        </g>
        {lines.map((l, i) => (
          <text
            key={i}
            x={90}
            y={260 + i * 175}
            fontFamily={HAND_FONT}
            fontSize={170}
            fill={i === lines.length - 1 ? C.blue : INK}
            paintOrder="stroke"
            stroke="#FFFFFF"
            strokeWidth={22}
            strokeLinejoin="round"
          >
            {l}
          </text>
        ))}
        <g transform="translate(90 930) rotate(-2)">
          <rect x={0} y={-62} width={Math.max(380, p.sub.length * 34)} height={90} rx={14} fill={INK} />
          <text x={24} y={4} fontFamily={HAND_FONT} fontSize={60} fill={C.white}>
            {p.sub}
          </text>
        </g>
      </svg>
    </AbsoluteFill>
  );
};
