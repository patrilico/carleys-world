import type { ActivityType, EmotionType } from '../core/types';

/** Continuous face description. The renderer blends between these so expressions never pop. */
export interface FaceParams {
  eyeOpen: number; // 0 closed .. 1 normal .. 1.2 wide
  eyeSmile: number; // 0..1  (happy "^ ^" closed eyes)
  pupil: number; // iris scale
  browRaise: number; // -1 low .. 1 high
  browAngle: number; // + inner ends raised (worried/sad), - inner ends lowered (angry)
  browAsym: number; // raises right brow only (curious / skeptical)
  mouthOpen: number; // 0..1
  mouthCurve: number; // -1 frown .. 1 big smile
  mouthWidth: number;
  mouthSkew: number; // smirk offset
  blush: number;
  tears: number;
  sweat: number;
  anger: number;
  sparkle: number;
}

export const NEUTRAL_FACE: FaceParams = {
  eyeOpen: 1, eyeSmile: 0, pupil: 1, browRaise: 0, browAngle: 0, browAsym: 0,
  mouthOpen: 0, mouthCurve: 0.25, mouthWidth: 0.9, mouthSkew: 0, blush: 0.25, tears: 0, sweat: 0, anger: 0, sparkle: 0.2
};

const f = (o: Partial<FaceParams>): FaceParams => ({ ...NEUTRAL_FACE, ...o });

export const FACE_PRESETS: Record<EmotionType, FaceParams> = {
  neutral: f({}),
  happy: f({ eyeOpen: 0.92, eyeSmile: 0.25, browRaise: 0.35, mouthOpen: 0.35, mouthCurve: 0.85, mouthWidth: 1.05, blush: 0.55, sparkle: 0.7 }),
  delighted: f({ eyeOpen: 0.4, eyeSmile: 0.9, browRaise: 0.7, mouthOpen: 0.8, mouthCurve: 1, mouthWidth: 1.2, blush: 0.85, sparkle: 1 }),
  sad: f({ eyeOpen: 0.85, pupil: 1.1, browRaise: 0.15, browAngle: 0.9, mouthCurve: -0.65, mouthWidth: 0.75, blush: 0.1, tears: 0.25, sparkle: 0.5 }),
  irritated: f({ eyeOpen: 0.72, pupil: 0.85, browRaise: -0.3, browAngle: -0.55, mouthCurve: -0.35, mouthWidth: 0.8, mouthSkew: 0.3, blush: 0.4, anger: 0.35, sparkle: 0 }),
  angry: f({ eyeOpen: 0.7, pupil: 0.75, browRaise: -0.45, browAngle: -1, mouthOpen: 0.3, mouthCurve: -0.7, mouthWidth: 1, blush: 0.65, anger: 1, sparkle: 0 }),
  hurt: f({ eyeOpen: 0.5, eyeSmile: 0, pupil: 1.15, browRaise: 0.3, browAngle: 1, mouthOpen: 0.25, mouthCurve: -0.8, mouthWidth: 0.7, blush: 0.15, tears: 0.7, sweat: 1, sparkle: 0.4 }),
  tired: f({ eyeOpen: 0.38, pupil: 0.9, browRaise: -0.1, browAngle: 0.3, mouthCurve: 0, mouthWidth: 0.7, blush: 0.2, sparkle: 0 }),
  curious: f({ eyeOpen: 1.1, pupil: 1.1, browRaise: 0.5, browAsym: 0.7, mouthOpen: 0.1, mouthCurve: 0.2, mouthWidth: 0.7, mouthSkew: -0.3, blush: 0.3, sparkle: 0.9 }),
  relaxed: f({ eyeOpen: 0.22, eyeSmile: 0.6, browRaise: 0.1, mouthCurve: 0.6, mouthWidth: 0.9, blush: 0.5, sparkle: 0 }),
  surprised: f({ eyeOpen: 1.25, pupil: 0.7, browRaise: 1, mouthOpen: 0.9, mouthCurve: 0, mouthWidth: 0.5, blush: 0.2, sparkle: 0.8 })
};

/** How each emotion shapes posture and movement. */
export interface PostureModifier {
  speed: number; // walk-speed multiplier
  slump: number; // torso lean forward (+) in radians
  headDown: number; // head pitch offset in px
  shoulderDrop: number; // px
  bounce: number; // idle bounce amplitude multiplier
  breath: number; // breathing speed multiplier
}

export const POSTURE: Record<EmotionType, PostureModifier> = {
  neutral: { speed: 1, slump: 0, headDown: 0, shoulderDrop: 0, bounce: 1, breath: 1 },
  happy: { speed: 1.08, slump: -0.03, headDown: -1, shoulderDrop: 0, bounce: 1.6, breath: 1.1 },
  delighted: { speed: 1.18, slump: -0.05, headDown: -2, shoulderDrop: 0, bounce: 2.4, breath: 1.2 },
  sad: { speed: 0.72, slump: 0.1, headDown: 4, shoulderDrop: 3, bounce: 0.4, breath: 0.8 },
  irritated: { speed: 1.1, slump: 0.02, headDown: 1, shoulderDrop: -1, bounce: 0.8, breath: 1.4 },
  angry: { speed: 1.25, slump: 0.05, headDown: 2, shoulderDrop: -2, bounce: 0.7, breath: 1.7 },
  hurt: { speed: 0.6, slump: 0.12, headDown: 3, shoulderDrop: 2, bounce: 0.3, breath: 1.3 },
  tired: { speed: 0.68, slump: 0.09, headDown: 4, shoulderDrop: 3, bounce: 0.3, breath: 0.7 },
  curious: { speed: 0.95, slump: -0.02, headDown: -1, shoulderDrop: 0, bounce: 1.2, breath: 1 },
  relaxed: { speed: 0.85, slump: 0.02, headDown: 1, shoulderDrop: 1, bounce: 0.6, breath: 0.75 },
  surprised: { speed: 1, slump: -0.06, headDown: -2, shoulderDrop: -2, bounce: 1, breath: 1.6 }
};

/** Mild utility nudges by emotion (Carley's activity preferences shift with how she feels). */
export const EMOTION_ACTIVITY_BIAS: Record<EmotionType, Partial<Record<ActivityType, number>>> = {
  neutral: {},
  happy: { gardening: 0.06, phone: 0.05, painting: 0.04 },
  delighted: { gardening: 0.08, painting: 0.08, phone: 0.08 },
  sad: { phone: 0.18, reading: 0.08, sunbathing: -0.08, gardening: -0.08 },
  irritated: { reading: -0.05, painting: -0.04 },
  angry: { sleeping: 0.05, reading: -0.1, phone: -0.08 },
  hurt: { reading: 0.12, sleeping: 0.1, gardening: -0.25, sunbathing: -0.05 },
  tired: { sleeping: 0.25, reading: 0.05, gardening: -0.12 },
  curious: { painting: 0.06, gardening: 0.04, windowWatching: 0.05 },
  relaxed: { sunbathing: 0.06, reading: 0.05 },
  surprised: {}
};

/** How long (real seconds) a derived emotion must hold before it may change (anti-flicker). */
export const EMOTION_MIN_DWELL = 2.5;
