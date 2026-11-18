import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { EpisodeProps, Expression, MouthShape, RenderedBeat, Speaker } from "../shared/episode";
import { computeTimeline } from "../shared/timeline";
import { Captions, PovBanner, HAND_FONT } from "./Captions";
import { blendedPose, idlePose } from "./pose";
import { GROUND, SceneBackground, SceneDefs, SpeedLines } from "./scenes/Scenes";
import { C, Character, CharacterDefs, INK } from "./sketch/SketchMan";

function mouthAt(beat: RenderedBeat, t: number): MouthShape | null {
  if (!beat.audioFile || t < 0 || t > beat.duration) return null;
  const cue = beat.mouthCues.find((c) => t >= c.start && t < c.end);
  return cue ? cue.value : "X";
}

/** Hand-drawn "boil": the wobble pattern changes every few frames, like redrawn animation. */
const SketchFilter: React.FC<{ frame: number }> = ({ frame }) => (
  <filter id="sketchy" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={Math.floor(frame / 3) % 7} result="n" />
    <feDisplacementMap in="SourceGraphic" in2="n" scale={3.2} xChannelSelector="R" yChannelSelector="G" />
  </filter>
);

type Slot = { x: number; scale: number; flip: boolean };

export const Episode: React.FC<EpisodeProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const tl = computeTimeline(props);

  let idx = 0;
  for (let i = 0; i < tl.beatStarts.length; i++) if (sec >= tl.beatStarts[i]) idx = i;
  const beat = props.beats[idx];
  const local = sec - tl.beatStarts[idx];
  const inOutro = sec >= tl.outroStart;
  const scene = beat.scene ?? props.scene;
  const beatFrame = Math.round(local * fps);

  const duo = props.beats.some((b) => b.speaker === "bro");
  const slots: Record<Speaker, Slot> = duo
    ? { sketch: { x: 146, scale: 0.84, flip: false }, bro: { x: 396, scale: 0.84, flip: true } }
    : { sketch: { x: 270, scale: 0.92, flip: false }, bro: { x: 700, scale: 0, flip: true } };

  /** Last face this character had before the current beat (listeners keep their reaction). */
  const lastFace = (who: Speaker): Expression => {
    for (let i = idx; i >= 0; i--) {
      const b = props.beats[i];
      if (b.speaker === who) return b.expression;
      if (b.otherExpression && i === idx) return b.otherExpression;
    }
    return "happy";
  };

  const renderCharacter = (who: Speaker) => {
    const slot = slots[who];
    if (!slot.scale) return null;
    const speaking = beat.speaker === who;
    const expression: Expression = speaking ? beat.expression : beat.otherExpression ?? lastFace(who);
    const pose = speaking ? blendedPose(beat.action, local) : idlePose(sec + (who === "bro" ? 0.7 : 0));
    const mouth = speaking && !inOutro ? mouthAt(beat, local) : null;
    const blink = (frame + (who === "bro" ? 41 : 0)) % 104 < 4;
    const pop = speaking ? interpolate(beatFrame, [0, 6], [1.06, 1.02], { extrapolateRight: "clamp" }) : 1;
    const s = slot.scale * pop;
    const running = speaking && (beat.action === "run" || beat.action === "panic");
    return (
      <g key={who}>
        {running && <SpeedLines f={frame} x={slot.x} />}
        <g transform={`translate(${(slot.x + pose.x).toFixed(1)} ${(GROUND + pose.y * slot.scale).toFixed(1)}) rotate(${pose.tilt.toFixed(2)}) scale(${(slot.flip ? -s : s).toFixed(3)} ${s.toFixed(3)})`}>
          <Character
            id={who}
            variant={who}
            expression={expression}
            mouth={mouth}
            blink={blink && !["laughing", "wink", "cool"].includes(expression)}
            pose={pose}
            prop={speaking ? beat.prop : "none"}
            look={speaking ? [Math.sin(frame / 40) * 2, 0] : [slot.flip ? 5 : -5, 0]}
          />
        </g>
      </g>
    );
  };

  // Camera: a small punch-in at every beat, a big zoom + shake on "boom" (the meme reaction shot).
  const speakerSlot = slots[beat.speaker];
  const boom = beat.sfx === "boom" && !inOutro;
  const zoom = boom ? interpolate(beatFrame, [0, 3], [1, 1.45], { extrapolateRight: "clamp" }) : interpolate(beatFrame, [0, 7], [1.035, 1], { extrapolateRight: "clamp" });
  const focusX = boom ? speakerSlot.x : 270;
  const focusY = boom ? GROUND - 440 * speakerSlot.scale : 480;
  const shake = boom ? Math.sin(frame * 2.3) * Math.max(0, 6 - beatFrame * 0.5) : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: C.paper }}>
      <svg viewBox="0 0 540 960" width="100%" height="100%">
        <defs>
          <SketchFilter frame={frame} />
        </defs>
        <SceneDefs />
        <CharacterDefs id="sketch" variant="sketch" />
        <CharacterDefs id="bro" variant="bro" />
        <g filter="url(#sketchy)">
          <g transform={`translate(${(focusX + shake).toFixed(1)} ${focusY.toFixed(1)}) scale(${zoom.toFixed(3)}) translate(${-focusX} ${-focusY})`}>
            <SceneBackground scene={scene} f={frame} />
            {renderCharacter("bro")}
            {renderCharacter("sketch")}
          </g>
        </g>
        <PovBanner text={props.pov} frame={frame} />
        {!inOutro && beat.audioFile && local <= beat.duration + 0.25 && (
          <Captions words={beat.words} t={local} appear={interpolate(beatFrame, [0, 4], [0, 1], { extrapolateRight: "clamp" })} />
        )}
        {/* Follow sticker on the punchline reaction: no extra seconds, so the loop stays tight. */}
        {props.followText && idx === props.beats.length - 1 && local > 0.35 && (
          <g
            transform={`translate(270 ${(686).toFixed(0)}) rotate(-4) scale(${interpolate(local, [0.35, 0.5], [0.6, 1], { extrapolateRight: "clamp" }).toFixed(3)})`}
          >
            <rect x={-150} y={-30} width={300} height={54} rx={12} fill={INK} transform="translate(5 5)" />
            <rect x={-150} y={-30} width={300} height={54} rx={12} fill={C.yellow} stroke={INK} strokeWidth={3.5} />
            <text x={0} y={7} textAnchor="middle" fontFamily={HAND_FONT} fontSize={27} fill={INK}>
              {props.followText}
            </text>
          </g>
        )}
        {props.watermark && (
          <text x={516} y={40} textAnchor="end" fontFamily={HAND_FONT} fontSize={20} fill={INK} opacity={0.45}>
            {props.watermark}
          </text>
        )}
      </svg>

      {props.beats.map((b, i) => (
        <React.Fragment key={i}>
          {b.audioFile && (
            <Sequence from={Math.round(tl.beatStarts[i] * fps)} durationInFrames={Math.ceil((b.duration + 0.1) * fps)}>
              <Audio src={staticFile(b.audioFile)} />
            </Sequence>
          )}
          {b.sfxFile && (
            <Sequence from={Math.round(tl.beatStarts[i] * fps)} durationInFrames={Math.ceil(2.5 * fps)}>
              <Audio src={staticFile(b.sfxFile)} volume={0.55} />
            </Sequence>
          )}
        </React.Fragment>
      ))}
      {props.musicFile && <Audio src={staticFile(props.musicFile)} volume={0.08} loop />}
    </AbsoluteFill>
  );
};
