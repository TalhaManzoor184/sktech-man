import React from "react";
import type { WordTiming } from "../shared/episode";
import { C, INK } from "./sketch/SketchMan";

export const HAND_FONT = "'Patrick Hand', 'Comic Sans MS', cursive";

function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (cur && (cur + " " + w).length > max) {
      out.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  return out.slice(0, 3);
}

/** The "POV: ..." line, hand-lettered at the top and kept for the whole Short (the meme setup). */
export const PovBanner: React.FC<{ text: string; frame: number }> = ({ text, frame }) => {
  const lines = wrap(text, 30);
  const size = 34;
  const lineH = 40;
  const h = lines.length * lineH + 26;
  const appear = Math.min(1, frame / 6);
  return (
    <g transform={`translate(270 ${52 + h / 2}) scale(${0.9 + 0.1 * appear}) rotate(-1.2)`} opacity={appear}>
      <rect x={-250} y={-h / 2} width={500} height={h} rx={10} fill="#FFFFFF" stroke={INK} strokeWidth={4} />
      <rect x={-244} y={-h / 2 + 6} width={500} height={h} rx={10} fill="none" stroke={INK} strokeWidth={1.5} opacity={0.35} />
      {lines.map((l, i) => (
        <text
          key={i}
          x={0}
          y={-h / 2 + 13 + lineH * (i + 0.78)}
          textAnchor="middle"
          fontFamily={HAND_FONT}
          fontSize={size}
          fill={INK}
        >
          {l}
        </text>
      ))}
    </g>
  );
};

const MAX_CHARS_PER_ROW = 18;

function rows(words: WordTiming[]): WordTiming[][] {
  const out: WordTiming[][] = [];
  let cur: WordTiming[] = [];
  let len = 0;
  for (const w of words) {
    const add = (cur.length ? 1 : 0) + w.text.length;
    if (cur.length && len + add > MAX_CHARS_PER_ROW) {
      out.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(w);
    len += (cur.length > 1 ? 1 : 0) + w.text.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * Word-by-word spoken captions under the POV banner, clear of the Shorts title overlay at the
 * bottom and the button column on the right. At most two rows at a time.
 */
export const Captions: React.FC<{ words: WordTiming[]; t: number; appear: number }> = ({ words, t, appear }) => {
  if (!words.length) return null;
  const all = rows(words);
  let activeRow = all.findIndex((r) => r.some((w) => t < w.end));
  if (activeRow < 0) activeRow = all.length - 1;
  const page = Math.floor(activeRow / 2);
  const visible = all.slice(page * 2, page * 2 + 2);
  const lineH = 50;
  const top = 228;
  const s = 0.88 + 0.12 * appear;
  return (
    <g transform={`translate(262 ${top}) scale(${s})`} opacity={appear}>
      {visible.map((row, ri) => (
        <text
          key={ri}
          x={0}
          y={ri * lineH}
          textAnchor="middle"
          fontFamily={HAND_FONT}
          fontSize={46}
          paintOrder="stroke"
          stroke="#FFFFFF"
          strokeWidth={10}
          strokeLinejoin="round"
        >
          {row.map((w, wi) => {
            const active = t >= w.start && t < w.end;
            return (
              <tspan key={wi} dx={wi === 0 ? 0 : 10} fill={active ? C.blue : INK}>
                {w.text}
              </tspan>
            );
          })}
        </text>
      ))}
    </g>
  );
};
