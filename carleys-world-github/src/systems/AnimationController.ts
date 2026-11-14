import { FACE_PRESETS, NEUTRAL_FACE, POSTURE, type FaceParams, type PostureModifier } from '../config/emotionConfig';
import { GAME_CONFIG } from '../config/gameConfig';
import { approach, clamp, clamp01, lerp, smoothstep } from '../core/math';
import type { ActionId, EmotionType, Posture, Vec2 } from '../core/types';
import type { Carley, FaceDirective } from '../entities/Carley';

/**
 * Skeleton pose parameters. Angles in radians. Limb angles are measured from "hanging straight down";
 * positive = raised outward (arms) or swung toward the facing direction (legs).
 * Knee bend rotates the shin back; elbow bend raises the forearm.
 */
export interface Pose {
  ox: number; oy: number; rot: number; sx: number; sy: number;
  torso: number; headTilt: number; headX: number; headY: number;
  aLs: number; aLe: number; aRs: number; aRe: number;
  lLh: number; lLk: number; lRh: number; lRk: number;
  hairSplay: number; skirt: number; propRot: number; aux: number;
}

export const POSE_KEYS = [
  'ox', 'oy', 'rot', 'sx', 'sy', 'torso', 'headTilt', 'headX', 'headY',
  'aLs', 'aLe', 'aRs', 'aRe', 'lLh', 'lLk', 'lRh', 'lRk', 'hairSplay', 'skirt', 'propRot', 'aux'
] as const satisfies readonly (keyof Pose)[];

export const BASE_POSE: Pose = {
  ox: 0, oy: 0, rot: 0, sx: 1, sy: 1, torso: 0, headTilt: 0, headX: 0, headY: 0,
  aLs: 0.16, aLe: 0, aRs: 0.16, aRe: 0, lLh: 0, lLk: 0, lRh: 0, lRk: 0,
  hairSplay: 0, skirt: 0, propRot: 0, aux: 0
};

export const newPose = (): Pose => ({ ...BASE_POSE });

export interface ActionCtx {
  t: number;
  walk: number;
  speed: number;
  breath: number;
  vy: number;
  onGround: boolean;
  lieDir: 1 | -1;
  kneeling: boolean;
  mod: PostureModifier;
  /** per-action data (e.g. aim direction) */
  data: Record<string, number>;
}

type KeyFrames = [number, Partial<Pose>][];

/** Precompiled keyframe track with smooth easing; returns a shared scratch pose (copy before keeping). */
function makeKf(frames: KeyFrames): (t: number) => Pose {
  const full: [number, Pose][] = [];
  let prev: Pose = { ...BASE_POSE };
  for (const [ft, p] of frames) {
    prev = { ...prev, ...p };
    full.push([ft, prev]);
  }
  const scratch = newPose();
  return (t: number): Pose => {
    if (t <= full[0][0]) {
      Object.assign(scratch, full[0][1]);
      return scratch;
    }
    const last = full[full.length - 1];
    if (t >= last[0]) {
      Object.assign(scratch, last[1]);
      return scratch;
    }
    let i = 1;
    while (i < full.length && full[i][0] < t) i++;
    const [t0, a] = full[i - 1];
    const [t1, b] = full[i];
    const u = smoothstep(0, 1, (t - t0) / (t1 - t0));
    for (const k of POSE_KEYS) scratch[k] = a[k] + (b[k] - a[k]) * u;
    return scratch;
  };
}

const TAU = Math.PI * 2;
const sn = (t: number, f: number, a = 1, p = 0): number => Math.sin(t * f * TAU + p) * a;
const P = (p: Partial<Pose>): Pose => ({ ...BASE_POSE, ...p });

const SIT: Partial<Pose> = {
  oy: 5, lLh: 1.45, lLk: 1.4, lRh: 1.45, lRk: 1.4, aLs: 0.4, aLe: -0.9, aRs: 0.4, aRe: -0.9, torso: 0, skirt: 0.2
};
const KNEEL: Partial<Pose> = { oy: 15, lLh: 0.15, lLk: 1.5, lRh: 0.15, lRk: 1.5, torso: 0.18, skirt: 0.1 };

/** Lying pose generator (rot depends on which way the head points). */
const lyingBase = (d: number): Partial<Pose> => ({
  rot: d * 1.5, oy: 13, lLh: 0.08, lLk: 0.1, lRh: -0.04, lRk: 0.15, aLs: 0.3, aRs: 0.3, hairSplay: 1, skirt: 0.1
});

// ---------- keyframe-driven transitions ----------
const KF_SIT_DOWN = makeKf([
  [0, {}],
  [0.22, { torso: 0.16, oy: 2, lLk: 0.35, lRk: 0.35, lLh: 0.2, lRh: 0.2, aLs: 0.35, aRs: 0.35 }],
  [0.55, { ...SIT, torso: 0.08, oy: 6 }],
  [0.85, { ...SIT }]
]);
const KF_STAND_UP = makeKf([
  [0, { ...SIT }],
  [0.22, { ...SIT, torso: 0.25, oy: 4, aLs: 0.5, aRs: 0.5 }],
  [0.5, { torso: 0.2, oy: 3, lLh: 0.35, lRh: 0.35, lLk: 0.5, lRk: 0.5, aLs: 0.3, aRs: 0.3 }],
  [0.72, { sy: 1.035, torso: -0.04, oy: -1 }],
  [0.9, {}]
]);
const KF_KNEEL = makeKf([
  [0, {}],
  [0.25, { oy: 6, torso: 0.2, lLk: 0.9, lRk: 0.9, lLh: 0.25, lRh: 0.25 }],
  [0.7, { ...KNEEL }]
]);
const KF_KNEEL_UP = makeKf([
  [0, { ...KNEEL }],
  [0.3, { oy: 8, torso: 0.3, lLk: 0.9, lRk: 0.9, lLh: 0.2, lRh: 0.2 }],
  [0.7, {}]
]);
const kfLieDown = (d: number): ((t: number) => Pose) => makeKf([
  [0, {}],
  [0.4, { oy: 8, torso: 0.2, lLk: 1.2, lRk: 1.2, lLh: 0.3, lRh: 0.3 }],
  [0.85, { ...SIT, oy: 17, torso: 0.1, lLh: 1.3, lLk: 0.2, lRh: 1.3, lRk: 0.2, aLs: 0.2, aRs: 0.2 }],
  [1.4, { ...lyingBase(d), oy: 15 }],
  [1.8, { ...lyingBase(d) }]
]);
const KF_LIE_DOWN = [kfLieDown(-1), kfLieDown(1)];
const kfGetUp = (d: number): ((t: number) => Pose) => makeKf([
  [0, { ...lyingBase(d) }],
  [0.45, { rot: d * 0.5, oy: 15, torso: 0.15, lLh: 1.3, lLk: 0.2, lRh: 1.3, lRk: 0.2, aLs: 0.7, aRs: 0.7, hairSplay: 0.3 }],
  [0.9, { ...SIT, oy: 6, torso: 0.2 }],
  [1.3, { torso: 0.18, oy: 3, lLh: 0.35, lRh: 0.35, lLk: 0.5, lRk: 0.5 }],
  [1.6, { sy: 1.03 }]
]);
const KF_GET_UP = [kfGetUp(-1), kfGetUp(1)];
const kfSitUp = (d: number): ((t: number) => Pose) => makeKf([
  [0, { ...lyingBase(d) }],
  [0.5, { rot: d * 0.4, oy: 14, torso: 0.1, lLh: 1.4, lLk: 0.2, lRh: 1.4, lRk: 0.2, aLs: 0.8, aRs: 0.8, hairSplay: 0.3 }],
  [1.0, { ...SIT, oy: 14, torso: 0.1, lLh: 1.45, lLk: 0.4, lRh: 1.45, lRk: 0.4 }]
]);
const KF_SIT_UP = [kfSitUp(-1), kfSitUp(1)];

const KF_JUMP = makeKf([
  [0, {}],
  [0.14, { oy: 8, sy: 0.92, torso: 0.12, lLk: 1, lRk: 1, lLh: 0.5, lRh: 0.5, aLs: -0.15, aRs: -0.15 }],
  [0.3, { oy: -12, sy: 1.1, aLs: 2.4, aRs: 2.4, lLk: 0.2, lRk: 0.2, lLh: 0.1, lRh: 0.1 }],
  [0.5, { oy: -8, sy: 1.02, aLs: 1.8, aRs: 1.8, lLk: 0.7, lRk: 0.7 }],
  [0.65, { oy: 6, sy: 0.93, lLk: 0.9, lRk: 0.9, lLh: 0.4, lRh: 0.4, aLs: 0.4, aRs: 0.4 }],
  [0.85, {}]
]);
const KF_CELEBRATE = makeKf([
  [0, {}],
  [0.16, { oy: 9, sy: 0.9, torso: 0.12, lLk: 1.1, lRk: 1.1, lLh: 0.5, lRh: 0.5, aLs: -0.2, aRs: -0.2 }],
  [0.38, { oy: -26, sy: 1.12, aLs: 2.7, aRs: 2.7, aLe: 0.3, aRe: 0.3, lLk: 0.2, lRk: 0.2, lLh: 0.2, lRh: -0.2, torso: -0.06 }],
  [0.62, { oy: -22, sy: 1.08, aLs: 2.5, aRs: 2.5, lLk: 0.7, lRk: 0.7 }],
  [0.85, { oy: 7, sy: 0.9, lLk: 1, lRk: 1, lLh: 0.45, lRh: 0.45, aLs: 0.5, aRs: 0.5 }],
  [1.1, {}]
]);
const KF_STARTLE = makeKf([
  [0, {}],
  [0.07, { sy: 0.92, oy: 4, aLs: 0.9, aRs: 0.9, torso: -0.14, headY: 3, lLk: 0.5, lRk: 0.5 }],
  [0.2, { oy: -16, sy: 1.1, aLs: 2.1, aRs: 2.1, aLe: 0.5, aRe: 0.5, torso: -0.1, lLk: 0.3, lRk: 0.3, headY: -2 }],
  [0.4, { oy: -4, sy: 1, aLs: 1.3, aRs: 1.3, lLk: 0.6, lRk: 0.6 }],
  [0.55, { oy: 4, sy: 0.94, aLs: 0.8, aRs: 0.8, lLk: 0.8, lRk: 0.8, lLh: 0.2, lRh: 0.2 }],
  [0.8, { aLs: 0.6, aRs: 0.6 }]
]);
const KF_STUMBLE = makeKf([
  [0, {}],
  [0.15, { torso: 0.3, oy: 3, aLs: 1.6, aRs: 1.9, lLh: 0.7, lLk: 0.2, lRh: -0.4 }],
  [0.4, { torso: 0.55, oy: 8, aLs: 2.2, aRs: 2.5, aLe: 0.4, aRe: 0.4, lLh: 1, lLk: 0.9, lRh: -0.6, lRk: 0.4, headY: 3 }],
  [0.65, { torso: 0.35, oy: 5, aLs: 2.0, aRs: 2.2, lLh: 0.5, lLk: 0.4, lRh: -0.3 }],
  [0.9, { torso: 0.1, oy: 1 }]
]);
const KF_SURPRISED = makeKf([
  [0, {}],
  [0.09, { sy: 0.94, oy: 3, torso: 0.05 }],
  [0.22, { oy: -6, sy: 1.08, aLs: 0.95, aRs: 0.95, torso: -0.08, headY: -2, lLk: 0.3, lRk: 0.3 }],
  [0.5, { oy: -1, sy: 1.02, aLs: 0.8, aRs: 0.8, torso: -0.05, headY: -1 }]
]);
const KF_FLINCH = makeKf([
  [0, {}],
  [0.06, { oy: 4, sy: 0.93, torso: -0.14, aLs: 1.1, aRs: 1.1, aLe: 1.1, aRe: 1.1, headY: 4, lLk: 0.5, lRk: 0.5, headTilt: -0.12 }],
  [0.3, { oy: 3, sy: 0.96, torso: -0.08, aLs: 0.9, aRs: 0.9, aLe: 1, aRe: 1, headY: 3 }],
  [0.6, { oy: 2, torso: 0.08, aLs: 0.6, aRs: 0.9, aLe: 0.9, aRe: 1.6, headY: 2 }]
]);
const KF_SIGH = makeKf([
  [0, {}],
  [0.45, { sy: 1.03, torso: -0.05, aLs: 0.35, aRs: 0.35, headY: -2, oy: -1 }],
  [0.75, { sy: 1.03, torso: -0.05, aLs: 0.35, aRs: 0.35, headY: -2, oy: -1 }],
  [1.25, { sy: 0.975, torso: 0.13, oy: 2, aLs: 0.04, aRs: 0.04, headY: 3, headTilt: 0.06 }],
  [1.6, { sy: 0.985, torso: 0.1, oy: 1.5, aLs: 0.08, aRs: 0.08, headY: 2.5, headTilt: 0.05 }]
]);
const KF_RELIEF = makeKf([
  [0, { torso: 0.04, aLs: 0.25, aRs: 0.25 }],
  [0.4, { sy: 1.035, torso: -0.05, aLs: 0.5, aRs: 0.5, aLe: 0.4, aRe: 0.4, headY: -2, oy: -1 }],
  [0.85, { sy: 1.035, torso: -0.05, aLs: 0.5, aRs: 0.5, aLe: 0.4, aRe: 0.4, headY: -2, oy: -1 }],
  [1.35, { sy: 0.975, torso: 0.1, oy: 2, aLs: 0.05, aRs: 0.05, headY: 2, headTilt: 0.07 }],
  [1.7, { sy: 1, torso: 0.02, oy: 0, aLs: 0.14, aRs: 0.14, headY: 0, headTilt: 0.08 }]
]);
const KF_STRETCH = makeKf([
  [0, {}],
  [0.35, { aLs: 1.2, aRs: 1.2, sy: 1.01 }],
  [0.9, { aLs: 2.9, aRs: 2.9, aLe: -0.2, aRe: -0.2, torso: -0.12, sy: 1.045, oy: -2, headY: -3, headTilt: -0.05 }],
  [1.8, { aLs: 2.9, aRs: 2.9, aLe: -0.2, aRe: -0.2, torso: -0.12, sy: 1.045, oy: -2, headY: -3, lLh: 0.05, lRh: -0.05 }],
  [2.3, { aLs: 1.3, aRs: 1.3, torso: 0.06, sy: 0.985, oy: 1 }],
  [2.7, { aLs: 0.3, aRs: 0.3, torso: 0.0 }]
]);
const KF_SIT_STRETCH = makeKf([
  [0, { ...SIT, oy: 14, torso: 0.1, lLh: 1.45, lLk: 0.4, lRh: 1.45, lRk: 0.4 }],
  [0.6, { ...SIT, oy: 14, torso: -0.1, lLh: 1.45, lLk: 0.4, lRh: 1.45, lRk: 0.4, aLs: 2.9, aRs: 2.9, aLe: -0.2, aRe: -0.2, headY: -3, sy: 1.03 }],
  [1.8, { ...SIT, oy: 14, torso: -0.12, lLh: 1.45, lLk: 0.4, lRh: 1.45, lRk: 0.4, aLs: 2.9, aRs: 2.9, aLe: -0.2, aRe: -0.2, headY: -3, sy: 1.04 }],
  [2.4, { ...SIT, oy: 14, torso: 0.15, lLh: 1.45, lLk: 0.4, lRh: 1.45, lRk: 0.4, aLs: 0.5, aRs: 0.5, headY: 2 }]
]);
const KF_YAWN = makeKf([
  [0, {}],
  [0.4, { headTilt: -0.15, headY: -3, aRs: 0.9, aRe: 2.0, torso: -0.06, sy: 1.02 }],
  [1.3, { headTilt: -0.2, headY: -3, aRs: 0.95, aRe: 2.1, aLs: 1.0, torso: -0.08, sy: 1.03 }],
  [1.8, { headTilt: 0.05, aRs: 0.3, aRe: 0, aLs: 0.2, torso: 0.05, sy: 0.99 }]
]);
const KF_PICK_UP = makeKf([
  [0, {}],
  [0.3, { torso: 0.4, oy: 6, lLk: 0.7, lRk: 0.7, lLh: 0.3, lRh: 0.3, aRs: 0.4, aRe: 0.2, headY: 2 }],
  [0.5, { torso: 0.5, oy: 8, lLk: 0.9, lRk: 0.9, lLh: 0.4, lRh: 0.4, aRs: 0.55, aRe: 0.2, headY: 3 }],
  [0.95, { torso: 0.05, oy: 0, aRs: 1.0, aRe: 0.6 }],
  [1.2, { aRs: 0.9, aRe: 0.6 }]
]);
const KF_PUT_AWAY = makeKf([
  [0, { aRs: 1.0, aRe: 0.6 }],
  [0.35, { torso: 0.45, oy: 7, lLk: 0.8, lRk: 0.8, lLh: 0.35, lRh: 0.35, aRs: 0.55, aRe: 0.2, headY: 3 }],
  [0.65, { torso: 0.5, oy: 8, lLk: 0.9, lRk: 0.9, lLh: 0.4, lRh: 0.4, aRs: 0.5, aRe: 0.2 }],
  [1.0, { torso: 0.02, oy: 0 }]
]);
const KF_SWAT = makeKf([
  [0, {}],
  [0.2, { aRs: 2.5, aRe: 0.5, torso: -0.1, oy: -1, headTilt: -0.05, aLs: 0.5 }],
  [0.32, { aRs: 0.9, aRe: -0.6, torso: 0.2, oy: 2, headTilt: 0.08, aLs: 0.35 }],
  [0.5, { aRs: 1.1, aRe: -0.3, torso: 0.1, aLs: 0.3 }],
  [0.8, { aRs: 0.3, aRe: 0, torso: 0, aLs: 0.2 }]
]);
const KF_SWAT_HARD = makeKf([
  [0, {}],
  [0.16, { aRs: 2.8, aRe: 0.4, aLs: 2.0, aLe: 0.3, torso: -0.18, oy: -3, sy: 1.03 }],
  [0.26, { aRs: 0.6, aRe: -0.8, aLs: 0.6, aLe: -0.6, torso: 0.34, oy: 4, sy: 0.96, ox: 4, lLh: 0.4, lLk: 0.5 }],
  [0.45, { aRs: 1.0, aRe: -0.3, aLs: 0.8, torso: 0.15, ox: 2 }],
  [0.7, { aRs: 0.3, aLs: 0.3, torso: 0.02, ox: 0, oy: 0 }]
]);
const KF_HEAD_TILT = makeKf([
  [0, {}],
  [0.3, { headTilt: 0.24, headX: 2, aRs: 0.9, aRe: 2.0, torso: 0.03 }],
  [1.4, { headTilt: 0.24, headX: 2, aRs: 0.9, aRe: 2.0, torso: 0.03 }]
]);
const KF_SURPRISE_READ = makeKf([
  [0, { ...SIT, aLs: 1.0, aLe: 1.6, aRs: 1.0, aRe: 1.6, headY: 2 }],
  [0.2, { ...SIT, aLs: 0.9, aLe: 1.2, aRs: 0.9, aRe: 1.2, headY: -2, torso: -0.08 }],
  [0.9, { ...SIT, aLs: 0.9, aLe: 1.2, aRs: 0.9, aRe: 1.2, headY: -2, torso: -0.08 }]
]);
const KF_PAINT_INSPECT = makeKf([
  [0, { aRs: 0.5, aRe: 0.8, aLs: 0.4, aLe: 1.2, torso: 0.1 }],
  [0.5, { ox: -7, torso: -0.04, headTilt: 0.14, aRs: 0.95, aRe: 2.2, aLs: 0.4, aLe: 1.0 }],
  [2.4, { ox: -7, torso: -0.04, headTilt: 0.14, aRs: 0.95, aRe: 2.2, aLs: 0.4, aLe: 1.0 }]
]);
const KF_PHONE_RETRIEVE = makeKf([
  [0, {}],
  [0.35, { torso: 0.12, aRs: 0.75, aRe: 0.2, headY: 1 }],
  [0.6, { torso: 0.1, aRs: 0.9, aRe: 0.5 }],
  [1.1, { torso: 0.02, aRs: 1.9, aRe: 2.3, headTilt: 0.1 }]
]);
const KF_PHONE_END = makeKf([
  [0, { aRs: 1.9, aRe: 2.3, headTilt: 0.1 }],
  [0.4, { aRs: 1.0, aRe: 0.6, headTilt: 0 }],
  [0.8, { aRs: 0.7, aRe: 0.2, torso: 0.1, headY: 1 }],
  [1.1, { aRs: 0.16, aRe: 0, torso: 0 }]
]);
const KF_HEALED = makeKf([
  [0, {}],
  [0.3, { oy: -5, sy: 1.04, aLs: 1.1, aRs: 1.1, aLe: 0.4, aRe: 0.4, headTilt: -0.12, headY: -2, torso: -0.06 }],
  [1.1, { oy: -7, sy: 1.05, aLs: 1.3, aRs: 1.3, aLe: 0.4, aRe: 0.4, headTilt: -0.15, headY: -3, torso: -0.08 }],
  [1.5, { oy: 0, aLs: 0.5, aRs: 0.5, headTilt: 0, headY: 0, torso: 0 }]
]);
const KF_WAKE = makeKf([
  [0, { ...SIT, oy: 14, torso: 0.1, lLh: 1.45, lLk: 0.4, lRh: 1.45, lRk: 0.4 }],
  [0.5, { ...SIT, oy: 14, torso: 0.15, lLh: 1.45, lLk: 0.4, lRh: 1.45, lRk: 0.4, aRs: 0.9, aRe: 2.1, headTilt: 0.05 }]
]);

export const ACTION_DURATION: Partial<Record<ActionId, number>> & Record<string, number | undefined> = {
  turn: 0.3, sitDown: 0.9, standUp: 0.95, lieDown: 1.8, getUp: 1.7, sitUp: 1.1, jump: 0.85, stumble: 0.95, recoverBalance: 0.9,
  land: 0.3, celebrateJump: 1.1, startledJump: 0.8, flinch: 0.7, sigh: 1.6, relief: 1.7, surprised: 0.7, headTilt: 1.4,
  pickUp: 1.25, putAway: 1.1, kneel: 0.75, kneelUp: 0.75, stretch: 2.8, yawn: 1.9, swat: 0.8, swatHard: 0.7,
  turnPage: 0.8, phoneRetrieve: 1.2, phoneEnd: 1.2, paintInspect: 2.5, healed: 1.6, wakeStretch: 2.5, readSurprised: 1.0,
  hairAdjust: 1.4, shakeOff: 1.1, wipeBrow: 1.2, wave: 1.7, excitedBounce: 1.6, laugh: 1.6, tinyDance: 2, dance: 3,
  lookAround: 2.4, examine: 2.2, point: 1.2, comfort: 1.4, sitStretch: 2.6, hum: 3, stomp: 1.2, crossArms: 1.6, cry: 2.5,
  holdHand: 2.5, takeGlass: 1, drinkMilk: 2.8, smile: 1.5, smileToSelf: 2, contentClose: 2, frown: 1.2, paintAdmire: 2.2, paintFrustrated: 1.8,
  watchSky: 2.5, lookUp: 1.2, inspectFlower: 2.2, sunAdjust: 1.8, phoneLaugh: 2, idle: 1, stand: 1
};

type ActionFn = (c: ActionCtx) => Pose;

/** Idle-style breathing layered onto a pose (scratch mutated). */
function breathe(p: Pose, c: ActionCtx, amp = 1): Pose {
  const b = Math.sin(c.breath) * c.mod.bounce;
  p.oy += b * 0.9 * amp;
  p.sy *= 1 + Math.sin(c.breath) * 0.008 * amp;
  p.aLs += Math.sin(c.breath * 0.5) * 0.02;
  p.aRs += Math.sin(c.breath * 0.5 + 1) * 0.02;
  return p;
}

const scratch = newPose();
function build(p: Partial<Pose>): Pose {
  Object.assign(scratch, BASE_POSE, p);
  return scratch;
}

const walkCycle = (c: ActionCtx, amp: number, kneeAmp: number, bob: number, armAmp: number, lean: number): Pose => {
  const ph = c.walk;
  const s = Math.sin(ph);
  const co = Math.cos(ph);
  const sR = Math.sin(ph + Math.PI);
  const coR = Math.cos(ph + Math.PI);
  return build({
    oy: -Math.abs(s) * bob,
    torso: lean + s * 0.025,
    headTilt: s * 0.035,
    headY: -Math.abs(co) * 0.4,
    lLh: s * amp, lLk: Math.max(0, co) * kneeAmp,
    lRh: sR * amp, lRk: Math.max(0, coR) * kneeAmp,
    aLs: 0.16 + 0.1 - s * armAmp * 0.55, aRs: 0.16 + 0.1 + s * armAmp * 0.55,
    aLe: 0.15 + Math.max(0, -s) * 0.3, aRe: 0.15 + Math.max(0, s) * 0.3,
    skirt: Math.abs(s) * 0.4,
    sy: 1 + Math.abs(s) * 0.012
  });
};

export const ACTIONS: Record<ActionId, ActionFn> = {
  // ---------------- movement ----------------
  idle: (c) => breathe(build({ headTilt: sn(c.t, 0.18, 0.025), headX: sn(c.t, 0.11, 0.5) }), c),
  stand: (c) => breathe(build({}), c),
  walk: (c) => walkCycle(c, 0.52, 0.75, 2.6, 0.45, 0.04),
  run: (c) => {
    const p = walkCycle(c, 0.95, 1.35, 5.5, 1.1, 0.2);
    p.aLe = 1.1; p.aRe = 1.1; p.aLs = 0.4 - Math.sin(c.walk) * 0.9; p.aRs = 0.4 + Math.sin(c.walk) * 0.9;
    p.hairSplay = 0.15;
    return p;
  },
  sadWalk: (c) => {
    const p = walkCycle(c, 0.34, 0.45, 1.2, 0.15, 0.13);
    p.headY = 3; p.aLs = 0.06; p.aRs = 0.06; p.headTilt = 0.05;
    return p;
  },
  cautiousWalk: (c) => {
    const p = walkCycle(c, 0.3, 0.5, 1.2, 0.1, 0.1);
    p.aRs = 0.75; p.aRe = 1.3; p.aLs = 0.55; p.aLe = 1.4; p.headY = 2; p.oy += 1.5; p.lLk += 0.15; p.lRk += 0.15;
    return p;
  },
  turn: (c) => { const u = clamp01(c.t / 0.3); return build({ sx: 1 - Math.sin(u * Math.PI) * 0.35, headTilt: Math.sin(u * Math.PI) * 0.1 }); },
  sitDown: (c) => KF_SIT_DOWN(c.t),
  sitIdle: (c) => {
    const p = build({ ...SIT, headTilt: sn(c.t, 0.17, 0.03), headX: sn(c.t, 0.1, 0.6), lLk: 1.4 + sn(c.t, 0.35, 0.1), lRk: 1.4 - sn(c.t, 0.35, 0.1) });
    p.oy += Math.sin(c.breath) * 0.7;
    return p;
  },
  standUp: (c) => KF_STAND_UP(c.t),
  lieDown: (c) => KF_LIE_DOWN[c.lieDir < 0 ? 0 : 1](c.t),
  lieIdle: (c) => {
    const p = build({ ...lyingBase(c.lieDir) });
    p.oy += Math.sin(c.breath * 0.7) * 0.8;
    p.sy *= 1 + Math.sin(c.breath * 0.7) * 0.01;
    return p;
  },
  getUp: (c) => KF_GET_UP[c.lieDir < 0 ? 0 : 1](c.t),
  sitUp: (c) => KF_SIT_UP[c.lieDir < 0 ? 0 : 1](c.t),
  jump: (c) => KF_JUMP(c.t),
  hop: (c) => {
    const rising = c.vy < 0;
    return build({
      oy: rising ? -3 : 0, sy: rising ? 1.07 : 0.97, aLs: rising ? 1.8 : 1.1, aRs: rising ? 1.8 : 1.1,
      lLk: rising ? 0.3 : 0.9, lRk: rising ? 0.3 : 0.9, lLh: 0.3, lRh: 0.2, torso: 0.05
    });
  },
  stumble: (c) => KF_STUMBLE(c.t),
  recoverBalance: (c) => {
    const w = Math.sin(c.t * 14) * Math.max(0, 1 - c.t / 0.85);
    return build({ torso: 0.1 + w * 0.15, aLs: 1.8 + w * 0.7, aRs: 1.8 - w * 0.7, aLe: 0.3, aRe: 0.3, lLh: w * 0.3, lRh: -w * 0.3, oy: 1, ox: w * 2, headTilt: w * 0.06 });
  },
  land: (c) => { const u = clamp01(c.t / 0.3); return build({ oy: Math.sin(u * Math.PI) * 5, sy: 1 - Math.sin(u * Math.PI) * 0.08, lLk: Math.sin(u * Math.PI) * 0.8, lRk: Math.sin(u * Math.PI) * 0.8 }); },

  // ---------------- positive ----------------
  smile: (c) => breathe(build({ headTilt: 0.07 + sn(c.t, 0.2, 0.02) }), c),
  laugh: (c) => {
    const s = Math.sin(c.t * 15);
    return build({ oy: -Math.abs(s) * 2.2, torso: -0.05 + s * 0.04, headTilt: -0.14, headY: -2, aLs: 0.5, aLe: -1.2, aRs: 0.5, aRe: -1.2, sy: 1 + Math.abs(s) * 0.012 });
  },
  excitedBounce: (c) => {
    const s = Math.sin(c.t * 9.5);
    const b = Math.abs(s);
    return build({ oy: -b * 10, sy: 1 + b * 0.05 - (b < 0.15 ? 0.06 : 0), lLk: (1 - b) * 0.7, lRk: (1 - b) * 0.7, lLh: (1 - b) * 0.2, lRh: (1 - b) * 0.2, aLs: 1.0 + s * 0.4, aRs: 1.0 - s * 0.4, aLe: 0.9, aRe: 0.9, headTilt: s * 0.06 });
  },
  celebrateJump: (c) => KF_CELEBRATE(c.t),
  contentClose: (c) => breathe(build({ headTilt: 0.06 + sn(c.t, 0.15, 0.03), headY: 1, torso: 0.02, aLs: 0.22, aRs: 0.22 }), c, 0.8),
  dance: (c) => {
    const s = Math.sin(c.t * 5.5);
    const b = Math.abs(Math.sin(c.t * 5.5));
    return build({ ox: s * 5, oy: -b * 4, torso: s * 0.1, headTilt: s * 0.1, aLs: 1.8 + s * 0.8, aRs: 1.8 - s * 0.8, aLe: 0.6, aRe: 0.6, lLh: s * 0.3, lRh: -s * 0.3, lLk: Math.max(0, s) * 0.8, lRk: Math.max(0, -s) * 0.8, skirt: 0.6, hairSplay: 0.1 });
  },
  tinyDance: (c) => {
    const s = Math.sin(c.t * 5);
    const b = Math.abs(s);
    return build({ ox: s * 2.5, oy: -b * 2.5, torso: s * 0.06, headTilt: s * 0.1, aLs: 0.6 + s * 0.25, aRs: 0.6 - s * 0.25, aLe: 0.8, aRe: 0.8, lLk: Math.max(0, s) * 0.5, lRk: Math.max(0, -s) * 0.5, skirt: 0.4 });
  },
  headTilt: (c) => KF_HEAD_TILT(c.t),
  wave: (c) => breathe(build({ aRs: 2.55, aRe: 0.2 + Math.sin(c.t * 11) * 0.55, aLs: 0.2, headTilt: 0.1, torso: -0.03, oy: -Math.abs(Math.sin(c.t * 5)) * 1.5 }), c),
  hum: (c) => breathe(build({ ox: sn(c.t, 0.9, 2), headTilt: sn(c.t, 0.9, 0.08), torso: sn(c.t, 0.9, 0.04), aLs: 0.25 + sn(c.t, 0.9, 0.1), aRs: 0.25 - sn(c.t, 0.9, 0.1) }), c),
  smileToSelf: (c) => breathe(build({ headTilt: 0.12, headY: 1, aLs: 0.45, aLe: -1.3, aRs: 0.45, aRe: -1.3, ox: sn(c.t, 0.5, 1.2) }), c),
  relief: (c) => KF_RELIEF(c.t),

  // ---------------- negative ----------------
  frown: (c) => breathe(build({ headY: 2, torso: 0.04 }), c),
  cry: (c) => {
    const s = Math.sin(c.t * 12);
    return build({ oy: Math.abs(s) * 0.8, torso: 0.1, headY: 3, headTilt: 0.04, aLs: 1.3 + s * 0.04, aLe: 1.9, aRs: 1.3 - s * 0.04, aRe: 1.9, ox: s * 0.5 });
  },
  stomp: (c) => {
    const ph = c.t * 7;
    const s = Math.sin(ph);
    const hit = Math.max(0, -Math.sin(ph + 0.6));
    return build({ torso: 0.1, aLs: 0.35, aLe: 0.2, aRs: 0.35, aRe: 0.2, lLh: Math.max(0, s) * 0.3, lLk: Math.max(0, s) * 1.1, lRh: Math.max(0, -s) * 0.3, lRk: Math.max(0, -s) * 1.1, oy: hit * 3, headTilt: s * 0.04, ox: s * 1.5 });
  },
  crossArms: (c) => breathe(build({ aLs: 0.65, aLe: -2.1, aRs: 0.65, aRe: -2.1, headTilt: -0.07, headX: 1, torso: 0.02, headY: 1 }), c),
  swat: (c) => KF_SWAT(c.t),
  swatHard: (c) => KF_SWAT_HARD(c.t),
  flinch: (c) => KF_FLINCH(c.t),
  holdHand: (c) => {
    const p = build({ aRs: 0.75, aRe: 1.2, aLs: 0.55, aLe: 1.5, torso: 0.1, headY: 3, headTilt: 0.08, oy: 1.5 });
    p.torso += sn(c.t, 0.3, 0.02); p.oy += Math.sin(c.t * 6) * 0.4;
    return p;
  },
  startledJump: (c) => KF_STARTLE(c.t),
  sigh: (c) => KF_SIGH(c.t),
  shakeOff: (c) => {
    const k = Math.max(0, 1 - c.t / 1.1);
    const s = Math.sin(c.t * 34);
    return build({ ox: s * 2.2 * k, torso: s * 0.05 * k, aLs: 0.9 * k + 0.2, aRs: 0.9 * k + 0.2, aLe: 0.4, aRe: 0.4, headTilt: s * 0.08 * k, hairSplay: 0.2 * k, skirt: k * 0.5 });
  },
  wipeBrow: (c) => build({ aRs: 2.2, aRe: 1.5 + sn(c.t, 1.4, 0.3), torso: 0.04, headY: 1, headTilt: 0.03 }),

  // ---------------- attention ----------------
  lookAround: (c) => breathe(build({ headX: sn(c.t, 0.45, 3.5), headTilt: sn(c.t, 0.45, 0.07, 1), torso: sn(c.t, 0.45, 0.03) }), c),
  lookUp: (c) => breathe(build({ headY: -3, headTilt: -0.1, torso: -0.04 }), c),
  watchSky: (c) => breathe(build({ headY: -3, headTilt: -0.12, torso: -0.05, aRs: 2.2, aRe: 1.2, ox: sn(c.t, 0.3, 1) }), c),
  surprised: (c) => KF_SURPRISED(c.t),
  examine: (c) => { const p = build({ torso: 0.17, headTilt: 0.14, headY: 2, aRs: 0.85, aRe: 2.0, aLs: 0.3, ox: 3 }); p.torso += sn(c.t, 0.6, 0.03); return p; },
  point: (c) => breathe(build({ aRs: 1.3, aRe: 0, torso: 0.05, headTilt: 0.08 }), c),
  hairAdjust: (c) => { const s = Math.sin(c.t * 7) * 0.12; return breathe(build({ aRs: 2.4 + s, aRe: 1.5, headTilt: 0.1, torso: -0.02 }), c); },

  // ---------------- activities ----------------
  pickUp: (c) => KF_PICK_UP(c.t),
  putAway: (c) => KF_PUT_AWAY(c.t),
  water: (c) => {
    const pour = 0.8 + Math.sin(c.t * 1.3) * 0.12;
    const p = build({ ...(c.kneeling ? KNEEL : {}), aRs: 1.05, aRe: 0.45, aLs: 0.35, torso: c.kneeling ? 0.3 : 0.15, headTilt: 0.06, headY: 1, propRot: pour, ox: 2 });
    p.oy += Math.sin(c.breath) * 0.5;
    return p;
  },
  kneel: (c) => KF_KNEEL(c.t),
  kneelUp: (c) => KF_KNEEL_UP(c.t),
  inspectFlower: (c) => {
    if (!c.kneeling) {
      return build({ torso: 0.45 + sn(c.t, 0.5, 0.04), oy: 6, lLk: 0.6, lRk: 0.6, lLh: 0.3, lRh: 0.3, headTilt: 0.15, headY: 3, aLs: 0.5, aLe: 0.9, aRs: 0.4, aRe: 0.3, ox: 4 });
    }
    return build({ ...KNEEL, torso: 0.36 + sn(c.t, 0.5, 0.04), headTilt: 0.15, headY: 3, aLs: 0.5, aLe: 0.9, aRs: 0.4, aRe: 0.3, ox: 4 });
  },
  sunRelax: (c) => {
    const p = build({ ...lyingBase(c.lieDir), aLs: 2.7, aLe: -2.3, aRs: 2.7, aRe: -2.3, lRh: 0.28, lRk: 0.1 });
    p.oy += Math.sin(c.breath * 0.7) * 0.9;
    p.lLk += Math.max(0, Math.sin(c.t * 1.1)) * 0.07;
    return p;
  },
  sunAdjust: (c) => {
    const u = clamp01(c.t / 1.8);
    const w = Math.sin(u * Math.PI);
    return build({ ...lyingBase(c.lieDir), rot: c.lieDir * (1.5 - w * 0.18), aLs: 2.7, aLe: -2.3, aRs: 2.7 - w * 1.5, aRe: -2.3 + w * 1.3, lLk: w * 0.5, lLh: w * 0.3, oy: 13 - w * 2 });
  },
  stretch: (c) => KF_STRETCH(c.t),
  yawn: (c) => KF_YAWN(c.t),
  read: (c) => {
    const p = build({ ...SIT, aLs: 0.9, aLe: 1.1, aRs: 0.9, aRe: 1.1, headY: 2.2, headTilt: sn(c.t, 0.14, 0.035), torso: 0.03 });
    p.oy += Math.sin(c.breath) * 0.6;
    return p;
  },
  turnPage: (c) => {
    const u = clamp01(c.t / 0.8);
    const p = build({ ...SIT, aLs: 0.9, aLe: 1.1, aRs: 0.9 + Math.sin(u * Math.PI) * 0.4, aRe: 1.1 - Math.sin(u * Math.PI) * 0.7, headY: 2.2, aux: u, torso: 0.03 });
    return p;
  },
  readSurprised: (c) => KF_SURPRISE_READ(c.t),
  phoneRetrieve: (c) => KF_PHONE_RETRIEVE(c.t),
  phoneTalk: (c) => {
    const g = Math.sin(c.t * 2.6);
    const p = build({ aRs: 1.95, aRe: 2.3, aLs: 0.75 + g * 0.35, aLe: 0.4 + Math.sin(c.t * 3.4) * 0.5, headTilt: 0.12, torso: sn(c.t, 0.4, 0.03), ox: sn(c.t, 0.3, 1.5) });
    p.oy += Math.sin(c.breath) * 0.6 - Math.abs(g) * 0.5;
    return p;
  },
  phoneLaugh: (c) => {
    const s = Math.sin(c.t * 14);
    return build({ aRs: 1.95, aRe: 2.3, aLs: 0.6, aLe: -1.2, headTilt: 0.08, oy: -Math.abs(s) * 2, torso: -0.05 + s * 0.04 });
  },
  phoneEnd: (c) => KF_PHONE_END(c.t),
  paint: (c) => {
    const s = Math.sin(c.t * 5.2);
    const p = build({ aRs: 1.45 + s * 0.22, aRe: 0.7 + Math.sin(c.t * 5.2 + 1.2) * 0.35, aLs: 0.5, aLe: 1.3, torso: 0.07, headTilt: sn(c.t, 0.2, 0.04), headY: 1, ox: 2 });
    p.oy += Math.sin(c.breath) * 0.5;
    return p;
  },
  paintInspect: (c) => KF_PAINT_INSPECT(c.t),
  paintAdmire: (c) => {
    const p = build({ aLs: 0.55, aLe: -1.5, aRs: 0.55, aRe: -1.5, headTilt: 0.14, headY: -1, ox: -4 });
    const b = Math.sin(c.t * 3.5);
    p.oy += -Math.max(0, b) * 2.5;
    p.sy *= 1 + Math.max(0, b) * 0.02;
    return p;
  },
  paintFrustrated: (c) => {
    const s = Math.sin(c.t * 9);
    return build({ aLs: 1.5, aLe: 2.2, aRs: 1.5, aRe: 2.2, headTilt: s * 0.1, headX: s * 2, torso: 0.1, oy: 1, ox: -3 });
  },
  sleep: (c) => {
    const p = build({ ...lyingBase(c.lieDir), aLs: 0.4, aLe: -0.4, aRs: 0.5, aRe: -1.4 });
    p.oy += Math.sin(c.breath * 0.55) * 1.1;
    p.sy *= 1 + Math.sin(c.breath * 0.55) * 0.012;
    return p;
  },
  wakeStretch: (c) => KF_SIT_STRETCH(c.t),
  windowWatch: (c) => breathe(build({ torso: 0.1, aLs: 0.5, aLe: 0.2, aRs: 0.5, aRe: 0.2, headTilt: 0.07 + sn(c.t, 0.12, 0.03), headY: -1, ox: 3 }), c),
  healed: (c) => KF_HEALED(c.t),
  comfort: (c) => breathe(build({ torso: -0.02, headTilt: 0.08, aLs: 0.3, aRs: 0.3 }), c),
  sitStretch: (c) => KF_SIT_STRETCH(c.t),
  takeGlass: (c) => {
    const u = clamp01(c.t / 0.9);
    return build({ aRs: 0.4 + u * 0.8, aRe: 0.3 + u * 1.1, aLs: 0.25, torso: 0.04, headTilt: 0.06, headY: 1, propRot: 0 });
  },
  drinkMilk: (c) => {
    const lift = clamp01(c.t / 0.5);
    const gulp = Math.max(0, Math.sin(c.t * 7)) * (c.t > 0.7 ? 1 : 0);
    return build({
      aRs: 1.2 + lift * 0.75, aRe: 1.4 + lift * 0.9, aLs: 0.3, torso: -0.04 - lift * 0.04, headTilt: -0.05 - lift * 0.2, headY: -lift * 2.5,
      propRot: -(0.1 + lift * 0.75), aux: clamp01((c.t - 0.6) / 2), oy: -gulp * 0.8
    });
  }
} as Record<ActionId, ActionFn>;

/** Smooth blend rate (1/sec) per action - quick reactions snap faster than languid ones. */
const BLEND_RATE: Partial<Record<ActionId, number>> = {
  swat: 26, swatHard: 28, flinch: 30, startledJump: 24, surprised: 22, jump: 20, celebrateJump: 20, stumble: 22,
  recoverBalance: 18, shakeOff: 20, excitedBounce: 18, laugh: 18, cry: 16, stomp: 18, hop: 20, run: 14, walk: 14,
  sadWalk: 12, cautiousWalk: 12, sleep: 6, sunRelax: 7, lieIdle: 8, contentClose: 8, relief: 12, sigh: 12
};

/**
 * Pose blending + procedural animation. The action functions describe target poses over time; the controller
 * blends toward them each frame so transitions between ANY two actions are smooth, never a pop.
 */
export class AnimationController {
  readonly pose: Pose = newPose();
  private t = 0;
  private serial = -1;
  walkPhase = 0;
  private breathPhase = 0;
  private ctx: ActionCtx = {
    t: 0, walk: 0, speed: 0, breath: 0, vy: 0, onGround: true, lieDir: -1, kneeling: false,
    mod: POSTURE.neutral, data: {}
  };
  /** current action (mirrors the agent) for debugging */
  action: ActionId = 'idle';

  update(dt: number, agent: Carley, emotion: EmotionType, intensity: number): void {
    if (agent.actionSerial !== this.serial) {
      this.serial = agent.actionSerial;
      this.t = 0;
    }
    this.t += dt;
    this.action = agent.action;
    const mod = POSTURE[emotion];
    this.breathPhase += dt * TAU * 0.28 * lerp(1, mod.breath, intensity);

    const vx = Math.abs(agent.body.vx);
    const moving = agent.moving !== 'none' && vx > 4;
    if (moving) {
      const cycle = agent.moving === 'run' ? 110 : 80;
      this.walkPhase += (vx * TAU * dt) / cycle;
    } else {
      // settle the phase to the nearest neutral stance so stepping stops cleanly
      this.walkPhase = approach(this.walkPhase, Math.round(this.walkPhase / Math.PI) * Math.PI, 12, dt);
    }

    const c = this.ctx;
    c.t = this.t;
    c.walk = this.walkPhase;
    c.speed = clamp01(vx / GAME_CONFIG.physics.runSpeed);
    c.breath = this.breathPhase;
    c.vy = agent.body.vy;
    c.onGround = agent.body.onGround;
    c.lieDir = agent.lieDir;
    c.kneeling = agent.posture === 'kneeling';
    c.mod = mod;
    c.data = agent.actionData;

    // airborne override while hopping obstacles / beds
    let action = agent.action;
    if (!agent.body.onGround && (action === 'walk' || action === 'run' || action === 'sadWalk' || action === 'cautiousWalk')) action = 'hop';

    const fn = ACTIONS[action] ?? ACTIONS.idle;
    const target = fn(c);
    const upright = agent.posture === 'standing' || agent.posture === 'sitting';
    const rate = BLEND_RATE[action] ?? 11;
    const p = this.pose;
    for (const k of POSE_KEYS) p[k] = approach(p[k], target[k], rate, dt);

    if (upright) {
      // emotional posture layer (slump, drooping head, hunched shoulders)
      const w = clamp01(intensity) * 0.9;
      p.torso += mod.slump * w;
      p.headY += mod.headDown * w;
      p.aLs -= mod.shoulderDrop * 0.012 * w;
      p.aRs -= mod.shoulderDrop * 0.012 * w;
    }
  }

  /** Hand-posture helpers for prop placement are in the renderer; this exposes the active action. */
  get isLying(): boolean {
    return Math.abs(this.pose.rot) > 0.9;
  }
}

/** Which action the idle-ish posture should hold while nothing else is scripted. */
export function restingAction(posture: Posture): ActionId {
  switch (posture) {
    case 'sitting': return 'sitIdle';
    case 'lying': return 'lieIdle';
    case 'kneeling': return 'kneel';
    default: return 'idle';
  }
}

// --------------------------------------------------------------------------------------------
//  Face
// --------------------------------------------------------------------------------------------

export interface FaceOutput extends FaceParams {
  blink: number; // 0 open .. 1 closed (applied on top of eyeOpen)
  gazeX: number; // -1..1
  gazeY: number;
}

const FACE_KEYS = Object.keys(NEUTRAL_FACE) as (keyof FaceParams)[];

/**
 * Expression is independent of body animation: emotion + step directive -> target face, blended smoothly,
 * with blinking, eye following and mouth movement while talking.
 */
export class FaceController {
  readonly out: FaceOutput = { ...NEUTRAL_FACE, blink: 0, gazeX: 0, gazeY: 0 };
  private blinkTimer = 2.5;
  private blinkT = -1;
  private gazeTimer = 1;
  private idleGaze = { x: 0, y: 0 };
  private talkPhase = 0;
  private lastEmotion: EmotionType = 'neutral';
  private seed = 12345;

  private rand(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  update(dt: number, emotion: EmotionType, intensity: number, d: FaceDirective, head: Vec2, facing: number): void {
    const e = d.emotion ?? emotion;
    const preset = FACE_PRESETS[e];
    const mix = e === 'neutral' ? 0 : 0.6 + 0.4 * clamp01(intensity);
    const target: FaceParams = { ...NEUTRAL_FACE };
    for (const k of FACE_KEYS) target[k] = lerp(NEUTRAL_FACE[k], preset[k], mix);
    if (d.override) Object.assign(target, d.override);

    this.talkPhase += dt * 11;
    if (d.talking) {
      const talk = (0.5 + 0.5 * Math.sin(this.talkPhase) * Math.sin(this.talkPhase * 0.37 + 1)) * 0.55;
      target.mouthOpen = Math.max(target.mouthOpen, talk);
    }
    if (d.eyesClosed) {
      target.eyeOpen = 0;
      target.eyeSmile = Math.max(target.eyeSmile, 0);
    }

    const fast = e === 'surprised' || e === 'hurt' || e === 'angry' || this.lastEmotion !== e;
    const rate = e === 'surprised' || e === 'hurt' ? 18 : fast ? 10 : 8;
    this.lastEmotion = e;
    const o = this.out;
    for (const k of FACE_KEYS) o[k] = approach(o[k], target[k], rate, dt);

    // blinking
    if (!d.eyesClosed) {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0 && this.blinkT < 0) {
        this.blinkT = 0;
        this.blinkTimer = this.rand() < 0.18 ? 0.25 : 2.2 + this.rand() * 3.8;
      }
    }
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const bt = this.blinkT / 0.16;
      o.blink = bt < 0.45 ? bt / 0.45 : bt < 1 ? 1 - (bt - 0.45) / 0.55 : 0;
      if (bt >= 1) {
        this.blinkT = -1;
        o.blink = 0;
      }
    }

    // gaze: follow target if given, otherwise wander idly
    const g = typeof d.gaze === 'function' ? d.gaze() : d.gaze;
    let gx: number;
    let gy: number;
    if (g) {
      gx = clamp((g.x - head.x) / 110, -1, 1);
      gy = clamp((g.y - head.y) / 90, -1, 1);
    } else {
      this.gazeTimer -= dt;
      if (this.gazeTimer <= 0) {
        this.gazeTimer = 1.2 + this.rand() * 3;
        this.idleGaze = { x: (this.rand() - 0.5) * 0.7 + facing * 0.25, y: (this.rand() - 0.5) * 0.4 };
      }
      gx = this.idleGaze.x;
      gy = this.idleGaze.y;
    }
    o.gazeX = approach(o.gazeX, gx, g ? 14 : 6, dt);
    o.gazeY = approach(o.gazeY, gy, g ? 14 : 6, dt);
  }
}
