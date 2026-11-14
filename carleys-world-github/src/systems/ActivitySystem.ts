import { BRAIN_TUNING } from '../config/activityConfig';
import { EMOTION_ACTIVITY_BIAS } from '../config/emotionConfig';
import { getLocation } from '../config/worldLayout';
import type { ActivityType } from '../core/types';
import { Activity } from '../activities/Activity';
import { GardeningActivity } from '../activities/GardeningActivity';
import { IdleActivity } from '../activities/IdleActivity';
import { PaintingActivity } from '../activities/PaintingActivity';
import { PhoneActivity } from '../activities/PhoneActivity';
import { ReadingActivity } from '../activities/ReadingActivity';
import { SleepingActivity } from '../activities/SleepingActivity';
import { SunbathingActivity } from '../activities/SunbathingActivity';
import { WindowWatchingActivity } from '../activities/WindowWatchingActivity';
import type { Simulation } from '../sim/Simulation';

export interface UtilityScore {
  id: ActivityType;
  available: boolean;
  /** why not available / selectable */
  blocked?: string;
  cooldownLeft: number;
  /** final utility used for ranking */
  utility: number;
  /** raw utility from the activity itself */
  base: number;
}

/**
 * Registry of activities + utility scoring. Each activity's own calculateUtility captures needs, weather, time of
 * day, personality and memories; this layer adds cooldowns, emotion bias, resume bonuses and controlled noise.
 */
export class ActivitySystem {
  readonly activities = new Map<ActivityType, Activity>();
  /** sim time the activity last finished */
  private lastEnded = new Map<ActivityType, number>();
  /** temporary bonus to resume an interrupted activity */
  resumeBonus = new Map<ActivityType, { bonus: number; until: number }>();

  constructor() {
    for (const a of [
      new IdleActivity(), new GardeningActivity(), new SunbathingActivity(), new ReadingActivity(),
      new PhoneActivity(), new PaintingActivity(), new SleepingActivity(), new WindowWatchingActivity()
    ]) this.activities.set(a.id, a);
  }

  get(id: ActivityType): Activity {
    const a = this.activities.get(id);
    if (!a) throw new Error(`Unknown activity ${id}`);
    return a;
  }

  get idle(): IdleActivity {
    return this.get('idle') as IdleActivity;
  }

  markEnded(id: ActivityType, now: number): void {
    this.lastEnded.set(id, now);
  }

  cooldownLeft(id: ActivityType, now: number): number {
    const ended = this.lastEnded.get(id);
    if (ended === undefined) return 0;
    return Math.max(0, this.get(id).cooldown - (now - ended));
  }

  setResumeBonus(id: ActivityType, bonus: number, until: number): void {
    this.resumeBonus.set(id, { bonus, until });
  }

  serialize(): { lastEnded: [string, number][] } {
    return { lastEnded: [...this.lastEnded.entries()] };
  }

  restore(data: { lastEnded?: [string, number][] } | undefined, nowSim: number): void {
    this.lastEnded.clear();
    // saved timestamps are relative to a previous clock; keep remaining cooldown by rebasing to 'now'
    for (const [k, v] of data?.lastEnded ?? []) this.lastEnded.set(k as ActivityType, Math.min(nowSim, v));
  }

  /**
   * Score every activity. With `noise` > 0, seeded random jitter is added (used only when actually selecting so
   * the debug display stays steady).
   */
  evaluate(sim: Simulation, noise = 0): UtilityScore[] {
    const out: UtilityScore[] = [];
    const now = sim.time;
    const emotionBias = EMOTION_ACTIVITY_BIAS[sim.emotion.effective];
    for (const act of this.activities.values()) {
      const cd = this.cooldownLeft(act.id, now);
      const loc = getLocation(act.locationId);
      let blocked: string | undefined;
      let available = true;
      if (!sim.zones.isLocationUsable(loc, sim.weather.raining)) {
        available = false;
        blocked = 'location unusable';
      } else if (!act.isAvailable(sim)) {
        available = false;
        blocked = 'unavailable now';
      } else if (cd > 0) {
        available = false;
        blocked = 'cooldown';
      }
      let base = 0;
      let utility = 0;
      if (available || blocked === 'cooldown') {
        base = Math.max(0, act.calculateUtility(sim));
        base += emotionBias[act.id] ?? 0;
        const rb = this.resumeBonus.get(act.id);
        if (rb && rb.until > now) base += rb.bonus;
        if (noise > 0 && act.id !== 'idle') base *= 1 + (sim.rng.next() - 0.5) * 2 * noise;
        base = Math.max(0, base);
        utility = available ? base : 0;
      }
      out.push({ id: act.id, available, blocked, cooldownLeft: cd, utility, base });
    }
    return out.sort((a, b) => b.utility - a.utility);
  }

  /**
   * Choose from eligible activities using relative utility (not a fixed sequence):
   * candidates close to the best are drawn with probability ~ utility^3.
   */
  select(sim: Simulation): ActivityType {
    const scores = this.evaluate(sim, BRAIN_TUNING.utilityNoise).filter((s) => s.available && s.utility > 0);
    if (scores.length === 0) return 'idle';
    const best = scores[0];
    if (best.utility < BRAIN_TUNING.startThreshold) return 'idle';
    const pool = scores.filter((s) => s.utility >= best.utility * 0.55 && (s.id !== 'idle' || best.id === 'idle' || s.utility > BRAIN_TUNING.startThreshold));
    return sim.rng.weighted(pool, (s) => Math.pow(s.utility, 3)).id;
  }
}
