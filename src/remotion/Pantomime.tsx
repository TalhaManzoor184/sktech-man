import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import type { MouthShape } from "../shared/episode";
import { pantomimeFrames, type Effect, type PantomimeProps, type RenderedShot } from "../shared/pantomime";
import { Captions, HAND_FONT, PovBanner } from "./Captions";
import { blendedPose, idlePose } from "./pose";
import { GROUND, SceneBackground, SceneDefs, SpeedLines } from "./scenes/Scenes";
import { C, Candy, Character, CharacterDefs, INK } from "./sketch/SketchMan";

/**
 * Pantomime meme: a quick series of shots (wide, close-up, extreme close-up, peephole, silhouette)
 * with hard cuts, big faces and sound effects; almost no dialogue. Same 540×960 drawing space as
 * the regular episodes.
 */

/** Drawn in character space (head centre is 0,-440). */
const Fx: React.FC<{ effect: Effect; t: number }> = ({ effect, t }) => {
  switch (effect) {
    case "tears":
      return (
        <g>
          {[-1, 1].map((s) => (
            <g key={s}>
              <path
                d={`M ${s * 52} -418 q ${s * 30} 40 ${s * 70} ${50 + 10 * Math.sin(t * 20)}`}
                fill="none"
                stroke="#6FB7E8"
                strokeWidth={13}
                strokeLinecap="round"
                opacity={0.9}
              />
              {[0, 1, 2].map((k) => {
                const p = (t * 2.4 + k / 3) % 1;
                return <circle key={k} cx={s * (60 + p * 110)} cy={-400 + p * 80 + p * p * 120} r={9 - p * 4} fill="#6FB7E8" opacity={1 - p} />;
              })}
            </g>
          ))}
        </g>
      );
    case "sweat": {
      const p = (t * 1.3) % 1;
      return (
        <g>
          <path d={`M 92 ${-512 + p * 60} q 12 22 0 30 q -12 -8 0 -30 Z`} fill="#8CC8F0" stroke={INK} strokeWidth={3} opacity={1 - p * 0.5} />
          <path d={`M -96 ${-500 + ((p + 0.5) % 1) * 60} q 10 18 0 25 q -10 -7 0 -25 Z`} fill="#8CC8F0" stroke={INK} strokeWidth={3} />
        </g>
      );
    }
    case "shake":
      return (
        <g stroke={INK} strokeWidth={6} strokeLinecap="round" fill="none" opacity={0.75}>
          {[-1, 1].map((s) => (
            <g key={s}>
              <path d={`M ${s * 118} -500 q ${s * 14} 20 0 40`} />
              <path d={`M ${s * 138} -470 q ${s * 14} 20 0 40`} />
            </g>
          ))}
        </g>
      );
    case "zzz":
      return (
        <g fontFamily={HAND_FONT} fill={INK}>
          {[0, 1, 2].map((k) => {
            const p = (t * 0.7 + k / 3) % 1;
            return (
              <text key={k} x={90 + p * 60} y={-520 - p * 110} fontSize={40 + p * 30} opacity={1 - p}>
                Z
              </text>
            );
          })}
        </g>
      );
    case "steam":
      return (
        <g fill="#F4F4F4" stroke={INK} strokeWidth={4}>
          {[-1, 1].map((s) =>
            [0, 1].map((k) => {
              const p = (t * 1.6 + k / 2) % 1;
              return <circle key={`${s}${k}`} cx={s * (70 + p * 50)} cy={-560 - p * 90} r={18 + p * 22} opacity={1 - p} />;
            }),
          )}
        </g>
      );
    case "sparkle":
      return (
        <g fill={C.yellow} stroke={INK} strokeWidth={3}>
          {[
            [-130, -560],
            [140, -520],
            [120, -380],
          ].map(([x, y], k) => {
            const s = 0.7 + 0.4 * Math.abs(Math.sin(t * 6 + k));
            return <path key={k} transform={`translate(${x} ${y}) scale(${s})`} d="M 0 -26 L 7 -7 L 26 0 L 7 7 L 0 26 L -7 7 L -26 0 L -7 -7 Z" />;
          })}
        </g>
      );
    case "candy": {
      // a stool with a red velvet cushion and the glowing candy, to the character's right
      const pulse = 1 + 0.06 * Math.sin(t * 6);
      return (
        <g transform="translate(240 0)">
          <ellipse cx={0} cy={10} rx={70} ry={10} fill={INK} opacity={0.12} />
          <path d="M -46 0 L -38 -118 M 46 0 L 38 -118 M -42 -50 H 42" stroke={INK} strokeWidth={8} strokeLinecap="round" />
          <rect x={-58} y={-136} width={116} height={20} rx={6} fill="#A37B52" stroke={INK} strokeWidth={4} />
          <ellipse cx={0} cy={-142} rx={58} ry={16} fill="#9E2230" stroke={INK} strokeWidth={4} />
          <g transform={`translate(0 -172) scale(${pulse.toFixed(3)})`}>
            <Candy glow />
          </g>
        </g>
      );
    }
    case "hearts":
      return (
        <g fill="#E8556B" stroke={INK} strokeWidth={3}>
          {[0, 1, 2].map((k) => {
            const p = (t * 0.8 + k / 3) % 1;
            return <path key={k} transform={`translate(${-80 + k * 80} ${-560 - p * 120}) scale(${0.8 + p * 0.4})`} opacity={1 - p} d="M 0 10 C -30 -12 -14 -32 0 -16 C 14 -32 30 -12 0 10 Z" />;
          })}
        </g>
      );
    default:
      return null;
  }
};

function autoEffect(shot: RenderedShot): Effect {
  if (shot.effect !== "none") return shot.effect;
  if (shot.expression === "cryLaugh") return "tears";
  if (shot.expression === "terrified") return "sweat";
  if (shot.expression === "furious") return "steam";
  if (shot.expression === "overloaded") return "shake";
  return "none";
}

/** Camera per shot type: zoom and how much to aim at the face. */
const CAM: Record<RenderedShot["shot"], { zoom: number; face: boolean }> = {
  wide: { zoom: 1, face: false },
  medium: { zoom: 1.55, face: true },
  closeup: { zoom: 2.5, face: true },
  extreme: { zoom: 3.3, face: true },
  peek: { zoom: 2.0, face: true },
  silhouette: { zoom: 1.15, face: false },
};

export const Pantomime: React.FC<PantomimeProps> = (p) => {
  const frame = useCurrentFrame();
  const { starts, total } = pantomimeFrames(p);
  let idx = 0;
  for (let i = 0; i < starts.length; i++) if (frame >= starts[i]) idx = i;
  const shot = p.shots[idx];
  const lf = frame - starts[idx];
  const t = lf / p.fps;
  const scene = shot.scene ?? p.scene;
  const both = shot.who === "both";
  const focus = both ? shot.focus : shot.who === "both" ? "sketch" : shot.who;

  const slots = both
    ? { sketch: { x: 150, s: 0.84, flip: false }, bro: { x: 392, s: 0.84, flip: true } }
    : shot.effect === "candy"
      ? { sketch: { x: 150, s: 0.95, flip: false }, bro: { x: 150, s: 0.95, flip: false } }
      : { sketch: { x: 270, s: 0.95, flip: false }, bro: { x: 270, s: 0.95, flip: true } };
  const cam = CAM[shot.shot];
  const fs = slots[focus];
  // Aim at the face for close shots, at the middle of the body for wide ones.
  const fx = cam.face ? fs.x : both || shot.effect === "candy" ? 270 : fs.x;
  const fy = cam.face ? GROUND - 440 * fs.s : 560;
  // Punch-in on every cut, and a shake on extreme close-ups.
  const punch = interpolate(lf, [0, 5], [1.08, 1], { extrapolateRight: "clamp" });
  const zoom = cam.zoom * punch;
  const shake = shot.shot === "extreme" || shot.sfx === "boom" ? Math.sin(frame * 2.1) * Math.max(0, 7 - lf * 0.6) : 0;
  const stretch = shot.shot === "extreme" ? 1 + 0.05 * Math.sin(t * 9) : 1;
  // Centre of the frame for the focus point (keep the face in the upper-middle, clear of the banner).
  const cx = 270;
  const cy = cam.face ? 540 : 520;

  const renderOne = (who: "sketch" | "bro") => {
    const slot = slots[who];
    const isFocus = who === focus;
    const speaking = isFocus && !!shot.audioFile && t <= shot.duration;
    const cue = speaking ? shot.mouthCues.find((c) => t >= c.start && t < c.end) : undefined;
    const mouth: MouthShape | null = speaking ? (cue?.value ?? "X") : null;
    const expression = isFocus ? shot.expression : (shot.otherExpression ?? "happy");
    const pose = isFocus ? blendedPose(shot.action, t) : idlePose(frame / p.fps + 0.7);
    const blink = (frame + (who === "bro" ? 41 : 0)) % 104 < 4 && ["happy", "thinking", "sad", "angry", "surprised"].includes(expression);
    const s = slot.s;
    const fx2 = autoEffect(shot);
    return (
      <g key={who}>
        {isFocus && (shot.action === "run" || shot.action === "panic") && <SpeedLines f={frame} x={slot.x} />}
        <g
          transform={`translate(${(slot.x + pose.x).toFixed(1)} ${(GROUND + pose.y * s).toFixed(1)}) rotate(${pose.tilt.toFixed(2)}) scale(${(slot.flip ? -s : s).toFixed(3)} ${s.toFixed(3)})`}
        >
          <Character id={who} variant={who} expression={expression} mouth={mouth} blink={blink} pose={pose} prop={isFocus ? shot.prop : "none"} look={[slot.flip ? 5 : -5, 0]} />
          {isFocus && fx2 !== "none" && shot.shot !== "silhouette" && (
            <g transform={slot.flip ? "scale(-1 1)" : undefined}>
              <Fx effect={fx2} t={t} />
            </g>
          )}
        </g>
      </g>
    );
  };

  const cast: ("sketch" | "bro")[] = both ? ["bro", "sketch"] : [focus];
  const sil = shot.shot === "silhouette";

  return (
    <AbsoluteFill style={{ backgroundColor: C.paper }}>
      <svg viewBox="0 0 540 960" width="100%" height="100%">
        <defs>
          <filter id="boilP" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={Math.floor(frame / 3) % 7} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={3.2} xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <filter id="toBlack" colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values="0 0 0 0 0.06  0 0 0 0 0.06  0 0 0 0 0.07  0 0 0 1 0" />
          </filter>
          <radialGradient id="peekHole" cx="50%" cy="46%" r="42%">
            <stop offset="0.72" stopColor="#000" stopOpacity={0} />
            <stop offset="1" stopColor="#000" stopOpacity={1} />
          </radialGradient>
          <radialGradient id="backlight" cx="50%" cy="45%" r="55%">
            <stop offset="0" stopColor="#FFF1C9" stopOpacity={0.9} />
            <stop offset="0.45" stopColor="#6B6252" stopOpacity={0.96} />
            <stop offset="1" stopColor="#0E0E0E" stopOpacity={1} />
          </radialGradient>
        </defs>
        <SceneDefs />
        <CharacterDefs id="sketch" variant="sketch" />
        <CharacterDefs id="bro" variant="bro" />
        <g filter="url(#boilP)">
          <g
            transform={`translate(${(cx + shake).toFixed(1)} ${cy}) scale(${(zoom * stretch).toFixed(3)} ${(zoom / stretch).toFixed(3)}) translate(${-fx} ${-fy})`}
          >
            <SceneBackground scene={scene} f={frame} />
            {sil && <rect x={-200} y={-200} width={940} height={1360} fill="url(#backlight)" />}
            <g filter={sil ? "url(#toBlack)" : undefined}>{cast.map(renderOne)}</g>
            {sil &&
              cast.map((who) => {
                const slot = slots[who];
                return (
                  <g key={`eyes-${who}`} fill="#FFFFFF">
                    <circle cx={slot.x - 34 * slot.s} cy={GROUND - 436 * slot.s} r={7} />
                    <circle cx={slot.x + 34 * slot.s} cy={GROUND - 436 * slot.s} r={7} />
                  </g>
                );
              })}
          </g>
        </g>
        {shot.shot === "peek" && <rect width={540} height={960} fill="url(#peekHole)" opacity={0.92} />}
        <PovBanner text={p.pov} frame={frame} />
        {shot.audioFile && t <= shot.duration + 0.2 && <Captions words={shot.words} t={t} appear={interpolate(lf, [0, 4], [0, 1], { extrapolateRight: "clamp" })} />}
        {p.followText && idx === p.shots.length - 1 && t > 0.4 && (
          <g transform={`translate(270 182) rotate(-3) scale(${interpolate(t, [0.4, 0.55], [0.6, 1], { extrapolateRight: "clamp" }).toFixed(3)})`}>
            <rect x={-150} y={-30} width={300} height={54} rx={12} fill={INK} transform="translate(5 5)" />
            <rect x={-150} y={-30} width={300} height={54} rx={12} fill={C.yellow} stroke={INK} strokeWidth={3.5} />
            <text x={0} y={7} textAnchor="middle" fontFamily={HAND_FONT} fontSize={27} fill={INK}>
              {p.followText}
            </text>
          </g>
        )}
        {p.watermark && (
          <text x={516} y={40} textAnchor="end" fontFamily={HAND_FONT} fontSize={20} fill={sil ? "#FFFFFF" : INK} opacity={0.45}>
            {p.watermark}
          </text>
        )}
      </svg>

      {p.shots.map((s, i) => (
        <React.Fragment key={i}>
          {s.audioFile && (
            <Sequence from={starts[i]} durationInFrames={Math.ceil((s.duration + 0.2) * p.fps)}>
              <Audio src={staticFile(s.audioFile)} />
            </Sequence>
          )}
          {s.sfxFile && (
            <Sequence from={starts[i]} durationInFrames={Math.ceil(2.5 * p.fps)}>
              <Audio src={staticFile(s.sfxFile)} volume={0.6} />
            </Sequence>
          )}
        </React.Fragment>
      ))}
      {p.musicFile && <Audio src={staticFile(p.musicFile)} volume={p.musicVolume} loop endAt={total} />}
    </AbsoluteFill>
  );
};
