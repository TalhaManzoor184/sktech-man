import React from "react";
import type { Expression, MouthShape, Prop } from "../../shared/episode";

/**
 * Sketch Man and his friend Bro — the locked character rigs, drawn in code so they look the same
 * in every episode. Only pose, face and mouth change.
 *
 * Coordinates: origin is the ground point between the feet, y grows downward (head is near y -440).
 * Arms use "outward" coordinates: +x is away from the body on the side being drawn.
 * The left arm and leg are the same drawing mirrored.
 */

export const INK = "#1B1B1B";
export const C = {
  ink: INK,
  skin: "#FBF6EC",
  shirt: "#FFFFFF",
  hoodie: "#C9CED3",
  yellow: "#F5B91E",
  yellowDark: "#D99A0B",
  pink: "#F08A9B",
  blue: "#2F7FD8",
  blueDark: "#1E5FAA",
  grey: "#9A9A9A",
  mouth: "#8A2232",
  tongue: "#F08A9B",
  white: "#FFFFFF",
  paper: "#F4EEE1",
} as const;

export type HandShape = "open" | "fist" | "thumb" | "point";
export type ArmPose = { x: number; y: number; hand: HandShape };

export type CharacterPose = {
  armL: ArmPose;
  armR: ArmPose;
  /** 0..1 foot lift. */
  legL: number;
  legR: number;
  /** Head tilt in degrees. */
  headTilt: number;
  /** Shoulders raised, px (shrug). */
  shoulders: number;
};

export type Variant = "sketch" | "bro";

/* ---------- helpers ---------- */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HEAD = { cx: 0, cy: -440, rx: 88, ry: 98 };
const SHOULDER = { x: 40, y: -314 };
const HIP = { x: 15, y: -212 };
const UPPER = 72;
const FORE = 66;

function ellipsePoint(a: number, scale = 1, h = HEAD) {
  const r = (a * Math.PI) / 180;
  return [h.cx + Math.cos(r) * h.rx * scale, h.cy + Math.sin(r) * h.ry * scale] as const;
}

/** Messy scribble hair, generated once from a fixed seed so it never changes between episodes. */
const HAIR = (() => {
  const r = rng(184);
  // Hair cap: outer edge follows the head, inner edge is a ragged fringe.
  const outer: string[] = [];
  for (let a = -188; a <= 8; a += 6) {
    const [x, y] = ellipsePoint(a, 1.06 + r() * 0.05);
    outer.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  const fringe: string[] = [];
  const n = 13;
  for (let i = 0; i <= n; i++) {
    const x = 92 - (184 * i) / n;
    const edge = Math.abs(x) > 70 ? -455 : -492;
    const y = edge + (i % 2 ? 14 + r() * 10 : -4 + r() * 6);
    fringe.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  const cap = `M ${outer.join(" L ")} L ${fringe.join(" L ")} Z`;
  // Spikes: zig-zag strokes sticking out of the top.
  const spikes: string[] = [];
  for (let i = 0; i < 34; i++) {
    const a = -164 + (i / 33) * 148 + (r() - 0.5) * 8;
    const [bx, by] = ellipsePoint(a, 1.0);
    const len = 14 + r() * 24 + (Math.abs(a + 90) < 40 ? 8 : 0);
    const rad = ((a + (r() - 0.5) * 36) * Math.PI) / 180;
    const tx = bx + Math.cos(rad) * len;
    const ty = by + Math.sin(rad) * len;
    const mx = (bx + tx) / 2 + (r() - 0.5) * 14;
    const my = (by + ty) / 2 + (r() - 0.5) * 14;
    spikes.push(`M ${bx.toFixed(1)} ${by.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`);
  }
  // Loose scribble loops over the mass of hair.
  const loops: string[] = [];
  for (let i = 0; i < 9; i++) {
    const [x, y] = ellipsePoint(-165 + i * 18, 0.92);
    loops.push(`M ${(x - 14).toFixed(1)} ${y.toFixed(1)} q 10 -20 22 -4 q 8 12 -6 14`);
  }
  return { cap, spikes: spikes.join(" "), loops: loops.join(" ") };
})();

/** Two-bone IK. Returns elbow position; the elbow always bends outward/down. */
function solveArm(sx: number, sy: number, tx: number, ty: number) {
  let dx = tx - sx;
  let dy = ty - sy;
  let d = Math.hypot(dx, dy);
  const max = UPPER + FORE - 0.5;
  const min = Math.abs(UPPER - FORE) + 4;
  if (d > max) {
    dx *= max / d;
    dy *= max / d;
    d = max;
  } else if (d < min) {
    const k = min / Math.max(d, 0.001);
    dx *= k;
    dy *= k;
    d = min;
  }
  const phi = Math.atan2(dy, dx);
  const alpha = Math.acos(Math.min(1, Math.max(-1, (UPPER * UPPER + d * d - FORE * FORE) / (2 * UPPER * d))));
  const e1 = [sx + UPPER * Math.cos(phi + alpha), sy + UPPER * Math.sin(phi + alpha)];
  const e2 = [sx + UPPER * Math.cos(phi - alpha), sy + UPPER * Math.sin(phi - alpha)];
  // Prefer the elbow that sits further out (bigger x), then lower (bigger y).
  const score = (e: number[]) => e[0] * 2 + e[1] * 0.3;
  const elbow = score(e1) >= score(e2) ? e1 : e2;
  return { elbow, hand: [sx + dx, sy + dy] };
}

/* ---------- body parts ---------- */

const Hand: React.FC<{ shape: HandShape }> = ({ shape }) => (
  <g>
    {shape === "point" && (
      <rect x={4} y={-8} width={30} height={11} rx={5.5} fill={C.white} stroke={INK} strokeWidth={4} />
    )}
    {shape === "thumb" && <rect x={-6} y={-36} width={12} height={28} rx={6} fill={C.white} stroke={INK} strokeWidth={4} />}
    {shape === "open" && (
      <g fill={C.white} stroke={INK} strokeWidth={4}>
        <ellipse cx={-9} cy={-15} rx={5.5} ry={10} />
        <ellipse cx={1} cy={-18} rx={5.5} ry={11} />
        <ellipse cx={11} cy={-15} rx={5.5} ry={10} />
        <ellipse cx={18} cy={-2} rx={9} ry={5} transform="rotate(-30 18 -2)" />
      </g>
    )}
    <circle r={shape === "open" ? 14 : 13} fill={C.white} stroke={INK} strokeWidth={4.5} />
    {shape !== "open" && <path d="M -7 -2 Q 0 3 7 -2" fill="none" stroke={INK} strokeWidth={2.5} strokeLinecap="round" />}
  </g>
);

const Arm: React.FC<{ pose: ArmPose; sleeve: string; shoulders: number }> = ({ pose, sleeve, shoulders }) => {
  const sx = SHOULDER.x;
  const sy = SHOULDER.y - shoulders;
  const { elbow, hand } = solveArm(sx, sy, pose.x, pose.y);
  const d = `M ${sx} ${sy} L ${elbow[0].toFixed(1)} ${elbow[1].toFixed(1)} L ${hand[0].toFixed(1)} ${hand[1].toFixed(1)}`;
  // Short sleeve along the first part of the upper arm.
  const ux = (elbow[0] - sx) / UPPER;
  const uy = (elbow[1] - sy) / UPPER;
  const s2 = [sx + ux * 20, sy + uy * 20];
  return (
    <g>
      <path d={d} fill="none" stroke={INK} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M ${sx} ${sy} L ${s2[0].toFixed(1)} ${s2[1].toFixed(1)}`} stroke={INK} strokeWidth={24} strokeLinecap="round" />
      <path d={`M ${sx} ${sy} L ${s2[0].toFixed(1)} ${s2[1].toFixed(1)}`} stroke={sleeve} strokeWidth={15} strokeLinecap="round" />
      <g transform={`translate(${hand[0].toFixed(1)} ${hand[1].toFixed(1)})`}>
        <Hand shape={pose.hand} />
      </g>
    </g>
  );
};

/** High-top sneaker drawn for the right foot (toe points outward, +x). */
const Shoe: React.FC = () => (
  <g strokeLinejoin="round">
    <path d="M -14 -30 L 12 -30 Q 15 -14 24 -10 Q 42 -6 44 6 L -18 6 Q -20 -12 -14 -30 Z" fill={INK} stroke={INK} strokeWidth={4} />
    <ellipse cx={36} cy={0} rx={10} ry={7} fill={C.white} stroke={INK} strokeWidth={3} />
    <path d="M 0 -24 L 10 -20 M -2 -16 L 12 -12 M 0 -8 L 14 -5" stroke={C.white} strokeWidth={2.6} strokeLinecap="round" />
    <circle cx={-10} cy={-18} r={4.5} fill={C.white} stroke={INK} strokeWidth={2} />
    <path d="M -22 5 H 48 Q 51 16 40 16 H -16 Q -26 16 -22 5 Z" fill={C.white} stroke={INK} strokeWidth={4} />
    <path d="M -18 11 H 44" stroke={INK} strokeWidth={1.6} opacity={0.6} />
  </g>
);

const Leg: React.FC<{ lift: number }> = ({ lift }) => {
  const ax = HIP.x + 10;
  const ay = -44 - lift * 62;
  const kx = HIP.x + 6 + lift * 34;
  const ky = (HIP.y + ay) / 2 - lift * 8;
  return (
    <g>
      <path d={`M ${HIP.x} ${HIP.y} L ${kx.toFixed(1)} ${ky.toFixed(1)} L ${ax} ${ay.toFixed(1)}`} fill="none" stroke={INK} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
      <g transform={`translate(${ax} ${(ay + 30).toFixed(1)})`}>
        <Shoe />
      </g>
    </g>
  );
};

/* ---------- face ---------- */

type EyeMode = "open" | "wide" | "arc" | "blink" | "sad" | "angry" | "up";

type Face = {
  l: EyeMode;
  r: EyeMode;
  /** Brow offsets: [inner, outer] in px, positive = higher. */
  brow: [number, number];
  browR?: [number, number];
  mouth: MouthShape | "grin" | "bigGrin" | "frown" | "hmm" | "grit" | "smirk" | "o";
};

const FACES: Record<Expression, Face> = {
  happy: { l: "open", r: "open", brow: [4, 2], mouth: "grin" },
  laughing: { l: "arc", r: "arc", brow: [6, 4], mouth: "bigGrin" },
  surprised: { l: "wide", r: "wide", brow: [14, 12], mouth: "o" },
  thinking: { l: "up", r: "up", brow: [0, 0], browR: [10, 14], mouth: "hmm" },
  wink: { l: "arc", r: "open", brow: [2, 0], browR: [6, 6], mouth: "smirk" },
  sad: { l: "sad", r: "sad", brow: [10, -4], mouth: "frown" },
  angry: { l: "angry", r: "angry", brow: [-10, 6], mouth: "grit" },
  cool: { l: "open", r: "open", brow: [0, 4], mouth: "smirk" },
};

/** Eye inside a clip region. side: -1 = left, 1 = right. */
const Eye: React.FC<{ id: string; side: number; mode: EyeMode; cx: number; cy: number; look: [number, number]; lidColor: string }> = ({
  id,
  side,
  mode,
  cx,
  cy,
  look,
  lidColor,
}) => {
  if (mode === "arc" || mode === "blink") {
    const d = mode === "arc" ? `M ${cx - 17} ${cy + 6} Q ${cx} ${cy - 14} ${cx + 17} ${cy + 6}` : `M ${cx - 17} ${cy} Q ${cx} ${cy + 7} ${cx + 17} ${cy}`;
    return <path d={d} fill="none" stroke={INK} strokeWidth={6.5} strokeLinecap="round" />;
  }
  const r = mode === "wide" ? 7.5 : 11.5;
  let px = cx + look[0];
  let py = cy + look[1];
  if (mode === "up") {
    px = cx + 7;
    py = cy - 11;
  }
  if (mode === "sad") py += 6;
  // Upper eyelid line for sad / angry. inner = toward the nose.
  let lid: string | null = null;
  if (mode === "sad" || mode === "angry") {
    const inner = cx - side * 34;
    const outer = cx + side * 34;
    const yi = mode === "angry" ? cy - 2 : cy - 22;
    const yo = mode === "angry" ? cy - 22 : cy - 6;
    lid = `M ${inner} ${yi} L ${outer} ${yo} L ${outer} ${cy - 60} L ${inner} ${cy - 60} Z`;
  }
  return (
    <g clipPath={`url(#${id})`}>
      <circle cx={px} cy={py} r={r} fill={INK} />
      <circle cx={px - r * 0.35} cy={py - r * 0.4} r={r * 0.3} fill={C.white} />
      {lid && <path d={lid} fill={lidColor} stroke={INK} strokeWidth={4} strokeLinejoin="round" />}
    </g>
  );
};

type MouthDef = { line?: string; d?: string; ell?: [number, number, number, number]; tongue?: [number, number, number, number]; teeth?: string };

// Mouth centre is (0, -382).
const MY = -382;
const MOUTHS: Record<Face["mouth"], MouthDef> = {
  grin: { d: `M -30 ${MY - 6} Q 0 ${MY - 2} 30 ${MY - 6} Q 26 ${MY + 30} 0 ${MY + 30} Q -26 ${MY + 30} -30 ${MY - 6} Z`, tongue: [4, MY + 21, 13, 7] },
  bigGrin: {
    d: `M -36 ${MY - 10} Q 0 ${MY - 4} 36 ${MY - 10} Q 32 ${MY + 40} 0 ${MY + 40} Q -32 ${MY + 40} -36 ${MY - 10} Z`,
    tongue: [4, MY + 29, 16, 8],
    teeth: `M -30 ${MY - 8} Q 0 ${MY - 3} 30 ${MY - 8} L 28 ${MY - 1} Q 0 ${MY + 3} -28 ${MY - 1} Z`,
  },
  frown: { line: `M -20 ${MY + 10} Q 0 ${MY - 8} 20 ${MY + 10}` },
  hmm: { line: `M -16 ${MY + 2} Q -6 ${MY - 4} 4 ${MY + 2} T 22 ${MY}` },
  grit: {
    d: `M -26 ${MY - 6} H 26 Q 30 ${MY + 12} 22 ${MY + 14} H -22 Q -30 ${MY + 12} -26 ${MY - 6} Z`,
    teeth: `M -24 ${MY - 4} H 24 Q 27 ${MY + 10} 20 ${MY + 12} H -20 Q -27 ${MY + 10} -24 ${MY - 4} Z`,
  },
  smirk: { line: `M -20 ${MY + 2} Q 4 ${MY + 12} 24 ${MY - 8}` },
  o: { ell: [0, MY + 6, 12, 15] },
  X: { line: `M -20 ${MY - 2} Q 0 ${MY + 14} 20 ${MY - 2}` },
  A: { line: `M -14 ${MY + 4} Q 0 ${MY + 7} 14 ${MY + 4}` },
  B: { d: `M -22 ${MY - 4} Q 0 ${MY} 22 ${MY - 4} Q 18 ${MY + 14} 0 ${MY + 14} Q -18 ${MY + 14} -22 ${MY - 4} Z`, teeth: `M -18 ${MY - 2} Q 0 ${MY + 1} 18 ${MY - 2} L 16 ${MY + 4} Q 0 ${MY + 6} -16 ${MY + 4} Z` },
  C: { d: `M -22 ${MY - 6} Q 0 ${MY - 2} 22 ${MY - 6} Q 20 ${MY + 22} 0 ${MY + 22} Q -20 ${MY + 22} -22 ${MY - 6} Z`, tongue: [0, MY + 15, 10, 5] },
  D: {
    d: `M -28 ${MY - 8} Q 0 ${MY - 4} 28 ${MY - 8} Q 26 ${MY + 34} 0 ${MY + 34} Q -26 ${MY + 34} -28 ${MY - 8} Z`,
    tongue: [0, MY + 25, 13, 7],
    teeth: `M -22 ${MY - 6} Q 0 ${MY - 3} 22 ${MY - 6} L 20 ${MY} Q 0 ${MY + 3} -20 ${MY} Z`,
  },
  E: { ell: [0, MY + 8, 14, 15], tongue: [0, MY + 17, 8, 4] },
  F: { ell: [0, MY + 6, 8, 8] },
  G: { d: `M -20 ${MY - 2} Q 0 ${MY + 2} 20 ${MY - 2} Q 16 ${MY + 12} 0 ${MY + 12} Q -16 ${MY + 12} -20 ${MY - 2} Z`, teeth: `M -14 ${MY - 1} Q 0 ${MY + 2} 14 ${MY - 1} L 13 ${MY + 6} Q 0 ${MY + 8} -13 ${MY + 6} Z` },
  H: { d: `M -22 ${MY - 6} Q 0 ${MY - 2} 22 ${MY - 6} Q 20 ${MY + 22} 0 ${MY + 22} Q -20 ${MY + 22} -22 ${MY - 6} Z`, tongue: [0, MY + 6, 9, 6] },
};

const Mouth: React.FC<{ shape: Face["mouth"] }> = ({ shape }) => {
  const m = MOUTHS[shape];
  if (m.line) return <path d={m.line} fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round" />;
  return (
    <g>
      {m.d && <path d={m.d} fill={C.mouth} />}
      {m.ell && <ellipse cx={m.ell[0]} cy={m.ell[1]} rx={m.ell[2]} ry={m.ell[3]} fill={C.mouth} />}
      {m.tongue && <ellipse cx={m.tongue[0]} cy={m.tongue[1]} rx={m.tongue[2]} ry={m.tongue[3]} fill={C.tongue} />}
      {m.teeth && <path d={m.teeth} fill={C.white} />}
      {m.d && <path d={m.d} fill="none" stroke={INK} strokeWidth={5} strokeLinejoin="round" />}
      {m.ell && <ellipse cx={m.ell[0]} cy={m.ell[1]} rx={m.ell[2]} ry={m.ell[3]} fill="none" stroke={INK} strokeWidth={5} />}
    </g>
  );
};

const Brow: React.FC<{ side: number; cx: number; y: number; off: [number, number]; thick: number }> = ({ side, cx, y, off, thick }) => {
  const xi = cx - side * 18;
  const xo = cx + side * 18;
  const yi = y - off[0];
  const yo = y - off[1];
  return (
    <path
      d={`M ${xi} ${yi} Q ${(xi + xo) / 2} ${Math.min(yi, yo) - 6} ${xo} ${yo}`}
      fill="none"
      stroke={INK}
      strokeWidth={thick}
      strokeLinecap="round"
    />
  );
};

/* ---------- props ---------- */

const Phone: React.FC = () => (
  <g transform="rotate(-8)">
    <rect x={-18} y={-58} width={36} height={64} rx={7} fill={INK} />
    <rect x={-14} y={-53} width={28} height={50} rx={3} fill={C.blue} opacity={0.85} />
    <path d="M -9 -44 H 6 M -9 -36 H 9 M -9 -28 H 2" stroke={C.white} strokeWidth={2.4} strokeLinecap="round" />
  </g>
);

/** Laptop seen from behind, held in front of the chest. */
const Laptop: React.FC = () => (
  <g>
    <path d="M -62 -300 H 62 L 58 -222 H -58 Z" fill="#D7D9DC" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
    <circle cx={0} cy={-262} r={9} fill={C.white} stroke={INK} strokeWidth={3} />
    <path d="M -70 -222 H 70 L 64 -210 H -64 Z" fill="#B9BCC0" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
  </g>
);

const Book: React.FC = () => (
  <g strokeLinejoin="round">
    <path d="M 0 -296 Q -30 -308 -58 -300 V -232 Q -30 -240 0 -228 Z" fill={C.white} stroke={INK} strokeWidth={4.5} />
    <path d="M 0 -296 Q 30 -308 58 -300 V -232 Q 30 -240 0 -228 Z" fill={C.white} stroke={INK} strokeWidth={4.5} />
    <path d="M -48 -286 H -12 M -48 -274 H -14 M -48 -262 H -18 M 12 -286 H 48 M 14 -274 H 48 M 18 -262 H 46" stroke={C.grey} strokeWidth={2.4} />
    <path d="M -58 -232 Q -30 -240 0 -228 Q 30 -240 58 -232 V -224 Q 30 -232 0 -220 Q -30 -232 -58 -224 Z" fill={C.blue} stroke={INK} strokeWidth={4} />
  </g>
);

/** The yellow pencil from the concept sheet. Drawn pointing up from its base at the origin. */
export const Pencil: React.FC<{ length?: number }> = ({ length = 120 }) => (
  <g strokeLinejoin="round">
    <rect x={-8} y={-length} width={16} height={length - 22} fill={C.yellow} stroke={INK} strokeWidth={4} />
    <path d={`M -2.5 ${-length + 2} V -24`} stroke={C.yellowDark} strokeWidth={3} />
    <path d="M -8 -22 L 0 6 L 8 -22 Z" fill="#E9C9A0" stroke={INK} strokeWidth={4} />
    <path d="M -3 -4 L 0 6 L 3 -4 Z" fill={INK} />
    <rect x={-8.5} y={-length - 10} width={17} height={12} fill="#BFC3C7" stroke={INK} strokeWidth={3.5} />
    <rect x={-8} y={-length - 28} width={16} height={18} rx={6} fill={C.pink} stroke={INK} strokeWidth={4} />
  </g>
);

/* ---------- the character ---------- */

export type CharacterProps = {
  id: string;
  variant: Variant;
  expression: Expression;
  /** Lip-sync shape; overrides the expression's resting mouth while talking. */
  mouth?: MouthShape | null;
  blink?: boolean;
  pose: CharacterPose;
  prop?: Prop;
  look?: [number, number];
};

export const CharacterDefs: React.FC<{ id: string; variant: Variant }> = ({ id, variant }) => {
  const sketch = variant === "sketch";
  return (
    <defs>
      {[-1, 1].map((side) => (
        <clipPath key={side} id={`${id}-eye${side}`}>
          {sketch ? <circle cx={side * 40} cy={-436} r={30} /> : <ellipse cx={side * 34} cy={-438} rx={23} ry={28} />}
        </clipPath>
      ))}
      <mask id={`${id}-shade`}>
        <ellipse cx={HEAD.cx} cy={HEAD.cy} rx={HEAD.rx} ry={HEAD.ry} fill="#fff" />
        <ellipse cx={HEAD.cx - 20} cy={HEAD.cy - 14} rx={HEAD.rx} ry={HEAD.ry} fill="#000" />
      </mask>
    </defs>
  );
};

export const Character: React.FC<CharacterProps> = ({ id, variant, expression, mouth = null, blink = false, pose, prop = "none", look = [0, 0] }) => {
  const sketch = variant === "sketch";
  const face = FACES[expression];
  const cool = expression === "cool";
  const eyeL: EyeMode = blink && (face.l === "open" || face.l === "up") ? "blink" : face.l;
  const eyeR: EyeMode = blink && (face.r === "open" || face.r === "up") ? "blink" : face.r;
  const shirt = sketch ? C.shirt : C.hoodie;
  const eyeX = sketch ? 40 : 34;
  const eyeY = sketch ? -436 : -438;

  // Props override the hands so they actually hold the thing.
  let armL = pose.armL;
  let armR = pose.armR;
  if (prop === "laptop" || prop === "book") {
    armL = { x: prop === "laptop" ? 62 : 56, y: -250, hand: "fist" };
    armR = { x: prop === "laptop" ? 62 : 56, y: -250, hand: "fist" };
  } else if (prop === "phone") {
    armR = { x: 30, y: -300, hand: "fist" };
  } else if (prop === "pencil") {
    armR = { ...armR, hand: "fist" };
  }
  const armRHand = solveArm(SHOULDER.x, SHOULDER.y - pose.shoulders, armR.x, armR.y).hand;

  return (
    <g>
      <ellipse cx={0} cy={14} rx={92} ry={12} fill={INK} opacity={0.12} />
      {/* legs */}
      <g transform="scale(-1 1)">
        <Leg lift={pose.legL} />
      </g>
      <Leg lift={pose.legR} />

      {/* torso */}
      <g transform={`translate(0 ${-pose.shoulders * 0.4})`}>
        <path d="M -42 -322 Q 0 -334 42 -322 L 36 -206 Q 0 -198 -36 -206 Z" fill={shirt} stroke={INK} strokeWidth={5} strokeLinejoin="round" />
        {sketch ? (
          <>
            <path d="M -30 -320 Q -34 -270 -28 -226" fill="none" stroke="#4A4A4A" strokeWidth={7} strokeLinecap="round" />
            <path d="M 14 -300 l 16 16 M 10 -286 l 20 20 M 8 -270 l 22 22 M 8 -252 l 20 20" stroke={INK} strokeWidth={1.4} opacity={0.35} />
          </>
        ) : (
          <>
            <path d="M -16 -322 Q 0 -300 16 -322" fill="none" stroke={INK} strokeWidth={4} />
            <path d="M -6 -310 V -280 M 6 -310 V -282" stroke={INK} strokeWidth={3} strokeLinecap="round" />
            <path d="M -24 -246 H 24 V -222 H -24 Z" fill="none" stroke={INK} strokeWidth={3.5} strokeLinejoin="round" />
          </>
        )}
      </g>

      {/* held items that sit in front of the torso */}
      {prop === "laptop" && <Laptop />}
      {prop === "book" && <Book />}

      {/* arms */}
      <g transform="scale(-1 1)">
        <Arm pose={armL} sleeve={shirt} shoulders={pose.shoulders} />
      </g>
      <Arm pose={armR} sleeve={shirt} shoulders={pose.shoulders} />
      {prop === "phone" && (
        <g transform={`translate(${(armRHand[0] - 6).toFixed(1)} ${(armRHand[1] + 6).toFixed(1)})`}>
          <Phone />
        </g>
      )}
      {prop === "pencil" && (
        <g transform={`translate(${armRHand[0].toFixed(1)} ${(armRHand[1] + 18).toFixed(1)}) rotate(20) scale(0.75)`}>
          <Pencil />
        </g>
      )}

      {/* head */}
      <g transform={`rotate(${pose.headTilt.toFixed(2)} 0 -330) translate(0 ${-pose.shoulders * 0.4})`}>
        <path d="M -8 -350 V -320 M 8 -350 V -320" stroke={INK} strokeWidth={5} />
        <rect x={-8} y={-352} width={16} height={32} fill={C.skin} />
        {[-1, 1].map((s) => (
          <ellipse key={s} cx={s * 86} cy={-436} rx={14} ry={20} fill={C.skin} stroke={INK} strokeWidth={5} />
        ))}
        <ellipse cx={HEAD.cx} cy={HEAD.cy} rx={HEAD.rx} ry={HEAD.ry} fill={C.skin} stroke={INK} strokeWidth={6} />
        <g mask={`url(#${id}-shade)`}>
          <path
            d={Array.from({ length: 26 }, (_, i) => `M ${-60 + i * 8} -330 l 46 -46`).join(" ") + " " + Array.from({ length: 30 }, (_, i) => `M ${10 + i * 6} -560 l 4 240`).join(" ")}
            stroke={INK}
            strokeWidth={1.5}
            opacity={0.32}
          />
        </g>

        {sketch ? (
          <>
            {/* hair */}
            <path d={HAIR.cap} fill={INK} stroke={INK} strokeWidth={4} strokeLinejoin="round" />
            <path d={HAIR.spikes} fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />
            <path d={HAIR.loops} fill="none" stroke="#444" strokeWidth={2} opacity={0.6} />
            {/* pencil behind the ear */}
            <g transform="translate(58 -506) rotate(32)">
              <Pencil length={112} />
            </g>
          </>
        ) : (
          <>
            {/* Bro: backwards cap */}
            <path d="M -92 -470 C -96 -566 96 -566 92 -470 Q 0 -488 -92 -470 Z" fill={C.blue} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
            <path d="M 30 -546 C 60 -530 80 -506 84 -476" fill="none" stroke={C.blueDark} strokeWidth={5} opacity={0.8} />
            <path d="M -92 -474 Q -122 -470 -132 -452 Q -110 -440 -86 -456 Z" fill={C.blueDark} stroke={INK} strokeWidth={5} strokeLinejoin="round" />
            <circle cx={0} cy={-548} r={7} fill={C.blueDark} stroke={INK} strokeWidth={4} />
            <path d="M -60 -470 q 4 12 -2 22 M 62 -470 q -4 12 2 22" stroke={INK} strokeWidth={4} fill="none" strokeLinecap="round" />
            {[-1, 1].map((s) => (
              <g key={s} fill={INK} opacity={0.55}>
                <circle cx={s * 52} cy={-398} r={2.6} />
                <circle cx={s * 60} cy={-404} r={2.6} />
                <circle cx={s * 56} cy={-390} r={2.6} />
              </g>
            ))}
          </>
        )}

        {/* eyes */}
        {[-1, 1].map((side) => (
          <React.Fragment key={side}>
            {sketch ? (
              <circle cx={side * eyeX} cy={eyeY} r={30} fill={C.white} />
            ) : (
              <ellipse cx={side * eyeX} cy={eyeY} rx={23} ry={28} fill={C.white} stroke={INK} strokeWidth={5} />
            )}
            {!cool && (
              <Eye
                id={`${id}-eye${side}`}
                side={side}
                mode={side < 0 ? eyeL : eyeR}
                cx={side * eyeX + (side < 0 ? 3 : -3)}
                cy={eyeY + 2}
                look={look}
                lidColor={sketch ? C.white : C.skin}
              />
            )}
          </React.Fragment>
        ))}
        {sketch && (
          <g fill="none" stroke={INK} strokeLinecap="round">
            <circle cx={-40} cy={-436} r={33} strokeWidth={9} />
            <circle cx={40} cy={-436} r={33} strokeWidth={9} />
            <path d="M -8 -440 Q 0 -448 8 -440" strokeWidth={7} />
            <path d="M -72 -440 L -86 -444 M 72 -440 L 86 -444" strokeWidth={6} />
          </g>
        )}
        {cool && (
          <g>
            <path d="M -76 -452 H -6 Q -6 -412 -40 -408 Q -74 -412 -76 -452 Z M 6 -452 H 76 Q 74 -412 40 -408 Q 6 -412 6 -452 Z" fill={INK} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
            <path d="M -6 -450 H 6" stroke={INK} strokeWidth={7} />
            <path d="M -62 -442 l 14 -6 M 22 -442 l 14 -6" stroke={C.white} strokeWidth={4} strokeLinecap="round" />
          </g>
        )}

        {/* brows */}
        <Brow side={-1} cx={-eyeX} y={sketch ? -482 : -480} off={face.brow} thick={sketch ? 8 : 9} />
        <Brow side={1} cx={eyeX} y={sketch ? -482 : -480} off={face.browR ?? face.brow} thick={sketch ? 8 : 9} />

        {/* nose + mouth */}
        <path d="M -2 -412 Q 8 -404 0 -398" fill="none" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
        <Mouth shape={mouth ?? face.mouth} />
      </g>
    </g>
  );
};
