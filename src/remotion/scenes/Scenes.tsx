import React from "react";
import type { Scene } from "../../shared/episode";
import { C } from "../sketch/SketchMan";

/**
 * Hand-drawn sets in a 540×960 viewBox (scaled 2× to 1080×1920).
 * Muted pencil colours so the characters (full black ink) stay in front.
 * The ground line (where feet stand) is at y = 845.
 */

const LINE = "#5B5B5B";
export const GROUND = 845;

const Hatch: React.FC<{ id: string; gap?: number; opacity?: number }> = ({ id, gap = 7, opacity = 0.28 }) => (
  <pattern id={id} width={gap} height={gap} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <line x1={0} y1={0} x2={0} y2={gap} stroke={C.ink} strokeWidth={1.3} opacity={opacity} />
  </pattern>
);

export const SceneDefs: React.FC = () => (
  <defs>
    <Hatch id="hatch" />
    <Hatch id="hatchLight" gap={9} opacity={0.16} />
    <pattern id="ruled" width={540} height={34} patternUnits="userSpaceOnUse">
      <line x1={0} y1={33} x2={540} y2={33} stroke="#8DB3D9" strokeWidth={1.4} opacity={0.55} />
    </pattern>
  </defs>
);

const Floor: React.FC<{ fill: string; boards?: boolean }> = ({ fill, boards }) => (
  <g>
    <rect y={GROUND - 40} width={540} height={960 - GROUND + 40} fill={fill} />
    <path d={`M 0 ${GROUND - 40} H 540`} stroke={LINE} strokeWidth={3} />
    {boards &&
      [GROUND - 6, GROUND + 34, GROUND + 78].map((y, i) => (
        <path key={i} d={`M 0 ${y} H 540`} stroke={LINE} strokeWidth={1.6} opacity={0.5} />
      ))}
  </g>
);

const Window: React.FC<{ x: number; y: number; w: number; h: number; f: number }> = ({ x, y, w, h, f }) => (
  <g transform={`translate(${x} ${y})`}>
    <rect width={w} height={h} fill="#CFE0E8" stroke={LINE} strokeWidth={5} />
    <ellipse cx={((f * 0.25) % (w + 80)) - 40} cy={h * 0.3} rx={26} ry={10} fill="#fff" opacity={0.9} />
    <path d={`M ${w / 2} 0 V ${h} M 0 ${h / 2} H ${w}`} stroke={LINE} strokeWidth={4} />
    <rect y={h} x={-8} width={w + 16} height={10} fill="#D8CDB8" stroke={LINE} strokeWidth={3} />
  </g>
);

const Classroom: React.FC<{ f: number }> = ({ f }) => (
  <g>
    <rect width={540} height={960} fill="#E8E2D4" />
    <rect x={30} y={250} width={340} height={190} fill="#58685F" stroke={LINE} strokeWidth={8} />
    <g fill="none" stroke="#F2F2EC" strokeWidth={3} strokeLinecap="round" opacity={0.85}>
      <text x={60} y={310} fill="#F2F2EC" stroke="none" fontFamily="'Patrick Hand', cursive" fontSize={36}>
        2x + 5 = ???
      </text>
      <path d="M 60 340 q 30 -20 60 0 t 60 0" />
      <path d="M 220 360 l 40 40 M 260 360 l -40 40" />
      <path d="M 300 330 l 22 -40 l 22 40 Z" />
    </g>
    <rect x={40} y={440} width={320} height={10} fill="#C4B9A3" stroke={LINE} strokeWidth={3} />
    <Window x={402} y={270} w={110} h={150} f={f} />
    <g transform="translate(470 222)">
      <circle r={30} fill="#fff" stroke={LINE} strokeWidth={5} />
      <path d={`M 0 0 L 0 -20 M 0 0 L ${(Math.cos(f / 60) * 14).toFixed(1)} ${(Math.sin(f / 60) * 14).toFixed(1)}`} stroke={C.ink} strokeWidth={3.5} strokeLinecap="round" />
    </g>
    <Floor fill="#D3C5AC" boards />
    {/* desks at the sides */}
    {[-30, 430].map((x, i) => (
      <g key={i} transform={`translate(${x} ${GROUND - 150})`}>
        <rect width={140} height={20} fill="#C49A6C" stroke={LINE} strokeWidth={4} />
        <rect y={20} x={14} width={10} height={120} fill="#A37B52" stroke={LINE} strokeWidth={3} />
        <rect y={20} x={116} width={10} height={120} fill="#A37B52" stroke={LINE} strokeWidth={3} />
        <rect y={20} width={140} height={120} fill="url(#hatchLight)" />
      </g>
    ))}
  </g>
);

const Bedroom: React.FC<{ f: number }> = ({ f }) => (
  <g>
    <rect width={540} height={960} fill="#E6E0D6" />
    <rect width={540} height={960} fill="url(#hatchLight)" opacity={0.5} />
    <Window x={300} y={230} w={170} h={190} f={f} />
    <path d="M 290 220 Q 300 330 286 440 M 480 220 Q 470 330 484 440" stroke={LINE} strokeWidth={3} fill="none" />
    <path d="M 280 220 H 492" stroke={LINE} strokeWidth={6} strokeLinecap="round" />
    <g transform="translate(60 250) rotate(-4)">
      <rect width={120} height={150} fill="#F4EEE1" stroke={LINE} strokeWidth={4} />
      <path d="M 30 100 l 20 -40 l 20 25 l 15 -15 l 15 30 Z" fill="none" stroke={LINE} strokeWidth={3} strokeLinejoin="round" />
      <circle cx={88} cy={40} r={10} fill="none" stroke={LINE} strokeWidth={3} />
    </g>
    <Floor fill="#CBBEA6" boards />
    <g transform={`translate(-40 ${GROUND - 140})`}>
      <rect width={190} height={110} rx={10} fill="#9DB0C4" stroke={LINE} strokeWidth={4} />
      <rect y={-50} x={-6} width={30} height={160} fill="#A0805C" stroke={LINE} strokeWidth={4} />
      <rect x={40} y={-14} width={80} height={34} rx={14} fill="#F4F4F0" stroke={LINE} strokeWidth={3.5} />
      <rect y={50} width={190} height={60} fill="url(#hatch)" />
    </g>
    <g transform={`translate(430 ${GROUND - 160})`}>
      <rect width={140} height={16} fill="#C49A6C" stroke={LINE} strokeWidth={4} />
      <rect y={16} x={10} width={10} height={124} fill="#A37B52" stroke={LINE} strokeWidth={3} />
      <path d="M 40 0 L 46 -50 M 30 -50 H 66 L 58 -76 H 38 Z" fill="#F5D88A" stroke={LINE} strokeWidth={3.5} strokeLinejoin="round" />
    </g>
  </g>
);

const AWNINGS = ["#C98F7E", "#8EA9A0", "#D2B26F"];

const Street: React.FC<{ f: number }> = ({ f }) => (
  <g>
    <rect width={540} height={960} fill="#EEE9DD" />
    <path d="M 0 560 V 200 H 120 V 150 H 210 V 260 H 300 V 120 H 420 V 220 H 540 V 560 Z" fill="#DCD4C4" stroke={LINE} strokeWidth={4} strokeLinejoin="round" />
    {[
      [30, 240],
      [70, 240],
      [140, 190],
      [240, 300],
      [330, 160],
      [370, 160],
      [330, 220],
      [450, 260],
      [490, 260],
    ].map(([x, y], i) => (
      <rect key={i} x={x} y={y} width={24} height={30} fill="#BFCAD0" stroke={LINE} strokeWidth={3} />
    ))}
    <rect y={430} width={540} height={130} fill="url(#hatchLight)" />
    {/* market stalls */}
    {[0, 1, 2].map((i) => {
      const x = 10 + i * 180;
      return (
        <g key={i} transform={`translate(${x} 520)`}>
          <path d="M 0 0 H 160 L 150 -40 H 10 Z" fill={AWNINGS[i]} stroke={LINE} strokeWidth={4} strokeLinejoin="round" />
          {[1, 2, 3].map((k) => (
            <path key={k} d={`M ${k * 40} 0 L ${k * 40 + (k - 2) * 3} -40`} stroke={LINE} strokeWidth={2.5} />
          ))}
          <path d="M 0 0 q 20 18 40 0 q 20 18 40 0 q 20 18 40 0 q 20 18 40 0" fill={AWNINGS[i]} stroke={LINE} strokeWidth={3} />
          <path d="M 12 0 V 150 M 148 0 V 150" stroke={LINE} strokeWidth={5} />
          <rect x={4} y={110} width={152} height={40} fill="#D9C8A8" stroke={LINE} strokeWidth={3.5} />
          {[24, 52, 80, 108, 136].map((cx, k) => (
            <circle key={k} cx={cx} cy={104 + Math.sin(f / 30 + k) * 0.5} r={9} fill={["#E3A35A", "#C7D36B", "#E07A6A"][k % 3]} stroke={LINE} strokeWidth={2.5} />
          ))}
        </g>
      );
    })}
    <Floor fill="#C9C2B5" />
    <path d={`M 0 ${GROUND + 50} H 540`} stroke="#fff" strokeWidth={6} strokeDasharray="40 30" opacity={0.6} />
  </g>
);

const Kitchen: React.FC<{ f: number }> = ({ f }) => (
  <g>
    <rect width={540} height={960} fill="#E4E6DF" />
    {Array.from({ length: 9 }, (_, i) => (
      <path key={i} d={`M ${i * 60} 470 V 640`} stroke={LINE} strokeWidth={1.5} opacity={0.4} />
    ))}
    {[500, 545, 590].map((y) => (
      <path key={y} d={`M 0 ${y} H 540`} stroke={LINE} strokeWidth={1.5} opacity={0.4} />
    ))}
    <Window x={210} y={250} w={140} h={150} f={f} />
    <rect x={20} y={200} width={160} height={110} fill="#C9D6CF" stroke={LINE} strokeWidth={4} />
    <path d="M 100 200 V 310" stroke={LINE} strokeWidth={4} />
    <rect x={380} y={200} width={140} height={110} fill="#C9D6CF" stroke={LINE} strokeWidth={4} />
    {/* counter */}
    <rect x={0} y={640} width={540} height={18} fill="#B9AE9B" stroke={LINE} strokeWidth={4} />
    <rect x={0} y={658} width={540} height={GROUND - 698} fill="#C9D6CF" stroke={LINE} strokeWidth={4} />
    {[90, 270, 450].map((x) => (
      <path key={x} d={`M ${x} 670 V ${GROUND - 50}`} stroke={LINE} strokeWidth={3} />
    ))}
    <g transform="translate(400 590)">
      <rect x={-30} y={20} width={60} height={30} rx={6} fill="#8C8C8C" stroke={LINE} strokeWidth={3.5} />
      {[0, 1, 2].map((i) => (
        <path key={i} d={`M ${-14 + i * 14} 14 q -8 -14 0 -28 q 8 -14 0 -28`} fill="none" stroke={LINE} strokeWidth={2.5} opacity={0.4 + 0.3 * Math.sin(f / 10 + i)} />
      ))}
    </g>
    <g transform="translate(30 410)">
      <rect width={110} height={230} rx={8} fill="#F0F0EC" stroke={LINE} strokeWidth={4} />
      <path d="M 0 80 H 110 M 92 30 V 60 M 92 100 V 150" stroke={LINE} strokeWidth={4} strokeLinecap="round" />
    </g>
    <Floor fill="#D6CFC0" />
    <rect y={GROUND - 40} width={540} height={200} fill="url(#hatchLight)" />
  </g>
);

const Paper: React.FC<{ f: number }> = ({ f }) => (
  <g>
    <rect width={540} height={960} fill={C.paper} />
    <rect y={60} width={540} height={900} fill="url(#ruled)" />
    <path d="M 58 0 V 960" stroke="#E39AA6" strokeWidth={2} opacity={0.7} />
    {[
      [460, 330, 0],
      [90, 520, 1],
      [470, 640, 2],
      [110, 300, 3],
    ].map(([x, y, i]) => (
      <g key={i} transform={`translate(${x} ${y}) rotate(${(f * (i % 2 ? 0.5 : -0.4)).toFixed(1)})`} opacity={0.55}>
        <path d="M 0 -18 L 5 -5 L 18 -5 L 8 4 L 12 17 L 0 9 L -12 17 L -8 4 L -18 -5 L -5 -5 Z" fill="none" stroke={LINE} strokeWidth={2.5} strokeLinejoin="round" />
      </g>
    ))}
    <path d={`M 0 ${GROUND - 10} Q 135 ${GROUND - 20} 270 ${GROUND - 8} T 540 ${GROUND - 12}`} fill="none" stroke={LINE} strokeWidth={3} />
  </g>
);

export const SceneBackground: React.FC<{ scene: Scene; f: number }> = ({ scene, f }) => {
  switch (scene) {
    case "classroom":
      return <Classroom f={f} />;
    case "bedroom":
      return <Bedroom f={f} />;
    case "street":
      return <Street f={f} />;
    case "kitchen":
      return <Kitchen f={f} />;
    default:
      return <Paper f={f} />;
  }
};

/** Comic speed lines behind a character who is running or panicking. */
export const SpeedLines: React.FC<{ f: number; x: number }> = ({ f, x }) => (
  <g opacity={0.5}>
    {Array.from({ length: 7 }, (_, i) => {
      const y = 480 + i * 50;
      const off = (f * 18 + i * 37) % 120;
      return <path key={i} d={`M ${x - 200 - off} ${y} H ${x - 120 - off}`} stroke={C.ink} strokeWidth={3} strokeLinecap="round" />;
    })}
  </g>
);
