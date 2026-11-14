import type { ActivityType } from '../core/types';

/** Per simulated hour effects while the activity is being *performed*. `comfortTarget` overrides the drift target. */
export interface ActivityNeedsEffect {
  /** rest meter (energy) */
  energy?: number;
  social?: number;
  /** negative = fun goes UP (stored as boredom) */
  boredom?: number;
  relax?: number;
  nature?: number;
  tummy?: number;
  irritation?: number;
  pain?: number;
}

export interface ActivityTuning {
  /** Sim seconds the activity is performed (before completing). */
  minDuration: number;
  maxDuration: number;
  /** Sim seconds before it may be chosen again after finishing. */
  cooldown: number;
  /** Utility multiplier needed for another activity to pre-empt after the min duration. */
  switchRatio: number;
  effects: ActivityNeedsEffect;
}

export const ACTIVITY_TUNING: Record<ActivityType, ActivityTuning> = {
  idle: { minDuration: 4, maxDuration: 9, cooldown: 0, switchRatio: 1.1, effects: {} },
  gardening: {
    minDuration: 35, maxDuration: 62, cooldown: 0, switchRatio: 1.6,
    effects: { nature: 40, boredom: -8, energy: -2 }
  },
  sunbathing: {
    minDuration: 38, maxDuration: 70, cooldown: 0, switchRatio: 1.7,
    effects: { relax: 42, nature: 8, energy: 2 }
  },
  reading: {
    minDuration: 30, maxDuration: 58, cooldown: 0, switchRatio: 1.6,
    effects: { boredom: -34, relax: 10, energy: -0.5 }
  },
  phone: {
    minDuration: 22, maxDuration: 38, cooldown: 0, switchRatio: 2,
    effects: { social: 55, boredom: -8 }
  },
  painting: {
    minDuration: 38, maxDuration: 66, cooldown: 0, switchRatio: 1.7,
    effects: { boredom: -45, energy: -0.5 }
  },
  sleeping: {
    minDuration: 50, maxDuration: 900, cooldown: 0, switchRatio: 4,
    effects: { energy: 28, irritation: -10, pain: -6, relax: 6 }
  },
  windowWatching: {
    minDuration: 9, maxDuration: 18, cooldown: 0, switchRatio: 1.5,
    effects: { relax: 22, boredom: -4 }
  }
};

export const ACTIVITY_LOCATION: Record<ActivityType, string> = {
  idle: 'shelter',
  gardening: 'wateringCan',
  sunbathing: 'blanket',
  reading: 'readingChair',
  phone: 'windowTable',
  painting: 'easel',
  sleeping: 'bedside',
  windowWatching: 'windowTable'
};

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  idle: 'Wandering',
  gardening: 'Gardening',
  sunbathing: 'Sunbathing',
  reading: 'Reading',
  phone: 'Calling her sister',
  painting: 'Painting',
  sleeping: 'Sleeping',
  windowWatching: 'Watching the window'
};

export const BRAIN_TUNING = {
  /** Seconds between utility re-evaluations while performing. */
  reevaluateEvery: 4,
  /** Minimum calm time after a reaction before switching (resistance). */
  postReactionResistance: 6,
  /** Interruption gap (sim s) within which Carley will resume what she was doing. */
  resumeWindow: 40,
  /** Activities below this utility are not worth starting - she idles instead. */
  startThreshold: 0.28,
  utilityNoise: 0.12
};
