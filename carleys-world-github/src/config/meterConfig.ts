import type { CharacterNeeds } from '../core/types';

export type MeterKey = 'rest' | 'fun' | 'social' | 'relax' | 'nature' | 'tummy';

export interface MeterDef {
  key: MeterKey;
  label: string;
  /** Which underlying need holds the value */
  need: keyof CharacterNeeds;
  /** Fun is stored as boredom, so it is displayed inverted */
  invert: boolean;
  icon: string;
  color: number;
  /** Contribution to overall happiness (weights sum to 1) */
  weight: number;
  /** Per simulated hour the meter drains when nothing is filling it */
  drain: number;
  /** Thought key spoken when it gets low */
  lowThought: string;
}

export const METERS: MeterDef[] = [
  { key: 'rest', label: 'Rest', need: 'energy', invert: false, icon: 'zzz', color: 0xabc5e7, weight: 0.2, drain: 4.5, lowThought: 'sleepy' },
  { key: 'fun', label: 'Fun', need: 'boredom', invert: true, icon: 'star', color: 0xefb95d, weight: 0.2, drain: 9, lowThought: 'bored' },
  { key: 'social', label: 'Social', need: 'social', invert: false, icon: 'chat', color: 0xeba997, weight: 0.17, drain: 7, lowThought: 'social' },
  { key: 'relax', label: 'Relax', need: 'comfort', invert: false, icon: 'leaf', color: 0x8bcac0, weight: 0.17, drain: 6, lowThought: 'stressed' },
  { key: 'nature', label: 'Garden', need: 'nature', invert: false, icon: 'flower', color: 0x9cc291, weight: 0.12, drain: 5, lowThought: 'missGarden' },
  { key: 'tummy', label: 'Tummy', need: 'tummy', invert: false, icon: 'milk', color: 0xc8e2f6, weight: 0.14, drain: 8, lowThought: 'hungry' }
];

export const METER_BY_KEY: Record<MeterKey, MeterDef> = Object.fromEntries(METERS.map((m) => [m.key, m])) as Record<MeterKey, MeterDef>;

/** Value 0..100 of a meter (higher = better) given the needs. */
export function meterValue(needs: CharacterNeeds, key: MeterKey): number {
  const d = METER_BY_KEY[key];
  const v = needs[d.need];
  return d.invert ? 100 - v : v;
}

/** Below this a meter is considered "low" (warnings, thoughts, extra unhappiness). */
export const LOW_METER = 25;
