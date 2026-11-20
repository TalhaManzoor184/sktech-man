import type { Action } from "../shared/episode";
import type { ArmPose, CharacterPose } from "./sketch/SketchMan";

/** Full pose: the rig pose plus whole-body movement. */
export type BodyPose = CharacterPose & {
  y: number; // vertical offset, negative = up
  x: number; // horizontal shake
  tilt: number; // whole-body lean, degrees
};

// Arm targets are in "outward" coordinates (see SketchMan.tsx): +x away from the body.
const hang = (t: number, phase = 0): ArmPose => ({ x: 56, y: -184 + Math.sin(t * Math.PI + phase) * 3, hand: "fist" });

const IDLE = (t: number): BodyPose => ({
  y: Math.sin(t * Math.PI) * 2.5,
  x: 0,
  tilt: Math.sin(t * Math.PI * 0.5) * 1,
  headTilt: Math.sin(t * Math.PI * 0.7) * 2,
  shoulders: 0,
  armL: hang(t),
  armR: hang(t, 1),
  legL: 0,
  legR: 0,
});

export function poseFor(action: Action, t: number): BodyPose {
  const base = IDLE(t);
  switch (action) {
    case "thumbsUp":
      return { ...base, armR: { x: 74, y: -330 + Math.sin(t * 6) * 3, hand: "thumb" }, headTilt: 5 };
    case "point":
      return { ...base, armR: { x: 150, y: -330, hand: "point" }, tilt: 2 };
    case "wave": {
      const w = Math.sin(t * Math.PI * 4);
      return { ...base, armR: { x: 92 + w * 22, y: -420 + Math.abs(w) * 6, hand: "open" } };
    }
    case "shrug": {
      const k = Math.min(1, t / 0.25);
      return {
        ...base,
        shoulders: 12 * k,
        headTilt: -8 * k,
        armL: { x: 92, y: -276 - 12 * k, hand: "open" },
        armR: { x: 92, y: -276 - 12 * k, hand: "open" },
      };
    }
    case "facepalm":
      return { ...base, armR: { x: 14, y: -446, hand: "open" }, headTilt: 9, tilt: 2 };
    case "think":
      return {
        ...base,
        armR: { x: 10, y: -350, hand: "fist" },
        armL: { x: -6, y: -262, hand: "fist" },
        headTilt: -6 + Math.sin(t * 2) * 2,
      };
    case "panic": {
      const s = Math.sin(t * Math.PI * 14);
      return {
        ...base,
        x: s * 5,
        y: -Math.abs(Math.sin(t * Math.PI * 7)) * 8,
        headTilt: s * 4,
        armL: { x: 64, y: -470, hand: "open" },
        armR: { x: 64, y: -470, hand: "open" },
        legL: Math.max(0, Math.sin(t * Math.PI * 7)) * 0.4,
        legR: Math.max(0, -Math.sin(t * Math.PI * 7)) * 0.4,
      };
    }
    case "run": {
      const s = Math.sin(t * Math.PI * 6);
      return {
        ...base,
        y: -Math.abs(s) * 14,
        tilt: 4,
        headTilt: 4,
        legL: Math.max(0, s),
        legR: Math.max(0, -s),
        armL: { x: 70, y: -250 - s * 60, hand: "fist" },
        armR: { x: 70, y: -250 + s * 60, hand: "fist" },
      };
    }
    case "jump": {
      const p = (t % 0.9) / 0.9;
      const h = Math.sin(p * Math.PI);
      return {
        ...base,
        y: -h * 70,
        legL: h * 0.7,
        legR: h * 0.7,
        armL: { x: 80, y: -400 - h * 40, hand: "open" },
        armR: { x: 80, y: -400 - h * 40, hand: "open" },
      };
    }
    case "sleepwalk": {
      // arms out in front, slow sway
      const s = Math.sin(t * Math.PI * 1.2);
      return { ...base, x: s * 6, tilt: s * 3, headTilt: 10 + s * 4, armL: { x: 104, y: -322, hand: "open" }, armR: { x: 104, y: -322, hand: "open" }, legL: Math.max(0, s) * 0.25, legR: Math.max(0, -s) * 0.25 };
    }
    case "stretch": {
      // rubber-hose reach far to the right; grows over the first second
      const k = Math.min(1, t / 0.9);
      const wob = Math.sin(t * 14) * 10 * (1 - k * 0.5);
      return { ...base, tilt: -4, headTilt: -6, armR: { x: 56 + 175 * k, y: -290 + 120 * k + wob, hand: "open", stretch: true } };
    }
    case "tremble": {
      const s = Math.sin(t * Math.PI * 22);
      return { ...base, x: s * 3.5, headTilt: s * 2, shoulders: 6, armL: { x: 40, y: -250, hand: "fist" }, armR: { x: 40, y: -250, hand: "fist" } };
    }
    case "idle":
    default:
      return base;
  }
}

const mixArm = (a: ArmPose, b: ArmPose, k: number): ArmPose => ({
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
  hand: k < 0.5 ? a.hand : b.hand,
  stretch: b.stretch,
});

/** Blend from idle into the action over the first 0.18 s so beat changes don't pop. */
export function blendedPose(action: Action, t: number): BodyPose {
  const target = poseFor(action, t);
  const k = Math.min(1, t / 0.18);
  if (k >= 1) return target;
  const base = IDLE(t);
  const m = (a: number, b: number) => a + (b - a) * k;
  return {
    y: m(base.y, target.y),
    x: m(base.x, target.x),
    tilt: m(base.tilt, target.tilt),
    headTilt: m(base.headTilt, target.headTilt),
    shoulders: m(base.shoulders, target.shoulders),
    armL: mixArm(base.armL, target.armL, k),
    armR: mixArm(base.armR, target.armR, k),
    legL: m(base.legL, target.legL),
    legR: m(base.legR, target.legR),
  };
}

export const idlePose = IDLE;
