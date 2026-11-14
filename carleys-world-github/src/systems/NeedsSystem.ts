import { INITIAL_NEEDS, MOSQUITO } from '../config/characterConfig';
import type { ActivityNeedsEffect } from '../config/activityConfig';
import { METERS } from '../config/meterConfig';
import { clamp100 } from '../core/math';
import type { ActivityType, CharacterNeeds, PersonalityProfile, WeatherType, Zone } from '../core/types';
import { computeHappiness } from './EmotionSystem';

export interface NeedsEnvironment {
  zone: Zone;
  weather: WeatherType;
  raining: boolean;
  rainAmount: number;
  directSun: number;
  daylight: number;
  wind: number;
  activity: ActivityType;
  performing: boolean;
  sleeping: boolean;
  movement: 'none' | 'walk' | 'run';
  /** Fill effects of the activity currently being performed (per hour). */
  effect: ActivityNeedsEffect | null;
  memoryMood: number;
  personality: PersonalityProfile;
}

export function createInitialNeeds(): CharacterNeeds {
  return { ...INITIAL_NEEDS };
}

const DRAIN = Object.fromEntries(METERS.map((m) => [m.key, m.drain])) as Record<string, number>;

/**
 * Meters (rest, fun, social, relax, garden, tummy) slowly drain over time and only rise while Carley is doing
 * something that feeds them. Happiness is not its own dial - it is the weighted sum of the meters (minus pain
 * and irritation). `dt` is simulated seconds.
 */
export function updateNeeds(needs: CharacterNeeds, env: NeedsEnvironment, dt: number, secondsPerHour: number): void {
  const dh = dt / secondsPerHour;
  const eff = env.effect;
  const asleep = env.sleeping;

  // Rest: drains while awake, walking and running cost a little extra
  let rest = asleep ? 0 : -DRAIN.rest;
  if (env.movement === 'walk') rest -= 1.2;
  if (env.movement === 'run') rest -= 4;
  needs.energy = clamp100(needs.energy + (rest + (eff?.energy ?? 0)) * dh);

  // Fun (stored as boredom: rising boredom = draining fun)
  needs.boredom = clamp100(needs.boredom + ((asleep ? 2 : DRAIN.fun) + (eff?.boredom ?? 0)) * dh);

  needs.social = clamp100(needs.social + ((asleep ? -1 : -DRAIN.social) + (eff?.social ?? 0)) * dh);

  // Relax: being rained on or in pain wears it down faster
  let relax = asleep ? -1 : -DRAIN.relax;
  if (env.raining) relax -= 18 * env.rainAmount * (1.3 - env.personality.rainTolerance);
  relax -= needs.pain * 0.05;
  needs.comfort = clamp100(needs.comfort + (relax + (eff?.relax ?? 0)) * dh);

  needs.nature = clamp100(needs.nature + ((asleep ? -1 : -DRAIN.nature) + (eff?.nature ?? 0)) * dh);
  needs.tummy = clamp100(needs.tummy + ((asleep ? -3 : -DRAIN.tummy) + (eff?.tummy ?? 0)) * dh);

  // Pain fades slowly (faster in bed); irritation calms down
  const painDecay = asleep ? 12 : 4.5;
  needs.pain = clamp100(needs.pain - (painDecay + (eff?.pain ? -eff.pain : 0)) * dh);
  let irr = -(asleep ? 28 : 9) - (eff?.irritation ? -eff.irritation : 0);
  if (needs.comfort < 25) irr += (25 - needs.comfort) * 0.3;
  if (env.raining) irr += 5 * (1.3 - env.personality.rainTolerance) * env.rainAmount;
  needs.irritation = clamp100(needs.irritation + irr * dh);

  needs.happiness = computeHappiness(needs, env.memoryMood * 0.5);
}

/** Immediate (real-time) mosquito annoyance, scaled by proximity (0..1 per mosquito) and tolerance. */
export function applyMosquitoAnnoyance(needs: CharacterNeeds, proximitySum: number, tolerance: number, realDt: number): void {
  if (proximitySum <= 0) return;
  const f = Math.min(2.2, proximitySum);
  const s = 1.35 - tolerance;
  needs.irritation = clamp100(needs.irritation + MOSQUITO.irritationPerSec * f * s * realDt);
  needs.comfort = clamp100(needs.comfort - MOSQUITO.comfortPerSec * f * realDt);
}
