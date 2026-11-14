import { DISCOVERIES, EVENT_TUNING, type EventTuning } from '../config/eventConfig';
import { GAME_CONFIG } from '../config/gameConfig';
import { clamp100 } from '../core/math';
import type { Simulation } from '../sim/Simulation';

export type WorldEventId =
  | 'mosquitoAppears' | 'butterflyArrives' | 'flowerBlooms' | 'cloudsGather' | 'lightRain'
  | 'sunEmerges' | 'gardeningInjury' | 'gentleBreeze' | 'pleasantDiscovery';

interface WorldEventDef {
  id: WorldEventId;
  tuning: EventTuning;
  /** Extra eligibility (location, weather, time of day, character state). */
  eligible(sim: Simulation): boolean;
  /** Current number of running instances (for maxConcurrent). */
  concurrent(sim: Simulation): number;
  weightMod?(sim: Simulation): number;
  execute(sim: Simulation): void;
  /** Sim seconds the event remains "running" for the debug display. */
  duration?: number;
}

const EVENTS: WorldEventDef[] = [
  {
    id: 'mosquitoAppears',
    tuning: EVENT_TUNING.mosquitoAppears,
    eligible: (s) => s.weather.type !== 'rainy' && s.weather.rain < 0.1 && s.clock.daylight > 0.12 && s.clock.hour > 6.5 && s.clock.hour < 21,
    concurrent: (s) => s.mosquitoes.length,
    weightMod: (s) => (s.isOutdoors ? 1.5 : 0.8) * (s.clock.hour > 17 || s.clock.hour < 9 ? 1.4 : 1),
    execute: (s) => {
      const n = s.rng.int(1, 2);
      for (let i = 0; i < n; i++) s.spawnMosquito(s.rng.range(900, 1240), s.rng.range(220, 470));
    }
  },
  {
    id: 'butterflyArrives',
    tuning: EVENT_TUNING.butterflyArrives,
    eligible: (s) => s.weather.rain < 0.1 && s.clock.daylight > 0.45 && s.weather.type !== 'windy',
    concurrent: (s) => s.butterflies.length,
    execute: (s) => {
      const n = s.rng.int(1, 2);
      for (let i = 0; i < n; i++) s.spawnButterfly(1250, s.rng.range(200, 450), false);
    }
  },
  {
    id: 'flowerBlooms',
    tuning: EVENT_TUNING.flowerBlooms,
    eligible: (s) => s.plants.some((p) => !p.state.flowering && p.state.health >= 45 && p.state.moisture >= 20) && s.clock.daylight > 0.3,
    concurrent: () => 0,
    execute: (s) => {
      const cands = s.plants.filter((p) => !p.state.flowering && p.state.health >= 45);
      const p = s.rng.pick(cands);
      p.triggerBloom();
      s.announceBloom(p.index);
    }
  },
  {
    id: 'cloudsGather',
    tuning: EVENT_TUNING.cloudsGather,
    eligible: (s) => s.weather.type === 'sunny' || s.weather.type === 'windy',
    concurrent: () => 0,
    execute: (s) => s.weather.setWeather('cloudy', s.rng.range(90, 160))
  },
  {
    id: 'lightRain',
    tuning: EVENT_TUNING.lightRain,
    eligible: (s) => s.weather.type === 'cloudy',
    concurrent: () => 0,
    execute: (s) => s.weather.setWeather('rainy', s.rng.range(60, 110))
  },
  {
    id: 'sunEmerges',
    tuning: EVENT_TUNING.sunEmerges,
    eligible: (s) => (s.weather.type === 'cloudy' || s.weather.type === 'rainy') && s.clock.daylight > 0.3,
    concurrent: () => 0,
    execute: (s) => s.weather.setWeather('sunny', s.rng.range(120, 220))
  },
  {
    id: 'gardeningInjury',
    tuning: EVENT_TUNING.gardeningInjury,
    eligible: (s) => {
      const b = s.brain;
      return (
        b.state === 'PERFORM_ACTIVITY' && b.run?.activity.id === 'gardening' && s.character.needs.pain < 8 &&
        (s.agent.action === 'water' || s.agent.action === 'inspectFlower' || s.agent.action === 'kneel')
      );
    },
    concurrent: () => 0,
    execute: (s) => s.injure('thorn')
  },
  {
    id: 'gentleBreeze',
    tuning: EVENT_TUNING.gentleBreeze,
    eligible: (s) => (s.weather.type === 'sunny' || s.weather.type === 'cloudy') && s.weather.gust < 0.05,
    concurrent: () => 0,
    duration: 8,
    execute: (s) => s.weather.triggerGust(0.4)
  },
  {
    id: 'pleasantDiscovery',
    tuning: EVENT_TUNING.pleasantDiscovery,
    eligible: (s) => {
      const b = s.brain;
      return !b.isSleeping && b.state !== 'REACTING' && b.state !== 'NAVIGATE_TO_LOCATION' && s.character.needs.pain < 20;
    },
    concurrent: () => 0,
    execute: (s) => {
      const where = s.isOutdoors ? 'outdoor' : 'indoor';
      const d = s.rng.pick(DISCOVERIES.filter((x) => x.where === where));
      s.lastDiscovery = d.text;
      s.character.needs.boredom = clamp100(s.character.needs.boredom - 8);
      s.bus.emit('discovery', { what: d.text });
      s.brain.react('discovery');
    }
  }
];

/** Periodically evaluates possible world events with weights, cooldowns and concurrency limits (seeded RNG). */
export class WorldEventSystem {
  private lastAt = new Map<WorldEventId, number>();
  private timer: number;
  active: { id: WorldEventId; endsAt: number }[] = [];
  /** Last events that fired (for the debug panel). */
  history: { id: WorldEventId; at: number }[] = [];

  constructor(private sim: Simulation) {
    this.timer = sim.rng.range(...EVENT_TUNING.evaluateEvery);
  }

  update(simDt: number): void {
    const sim = this.sim;
    this.active = this.active.filter((a) => a.endsAt > sim.time);
    this.timer -= simDt;
    if (this.timer > 0) return;
    this.timer = sim.rng.range(...EVENT_TUNING.evaluateEvery);
    // not every evaluation produces an event - keeps the world from feeling scripted
    if (!sim.rng.chance(0.62)) return;
    const eligible = EVENTS.filter((e) => this.canFire(e));
    if (eligible.length === 0) return;
    const e = sim.rng.weighted(eligible, (x) => x.tuning.weight * (x.weightMod?.(sim) ?? 1));
    this.fire(e);
  }

  private canFire(e: WorldEventDef): boolean {
    const sim = this.sim;
    const last = this.lastAt.get(e.id);
    if (last !== undefined && sim.time - last < e.tuning.minInterval) return false;
    const limit = e.id === 'mosquitoAppears' ? Math.min(e.tuning.maxConcurrent, GAME_CONFIG.limits.maxMosquitoes) : e.tuning.maxConcurrent;
    if (e.concurrent(sim) >= limit && e.concurrent(sim) > 0) return false;
    return e.eligible(sim);
  }

  private fire(e: WorldEventDef): void {
    const sim = this.sim;
    this.lastAt.set(e.id, sim.time);
    this.history.push({ id: e.id, at: sim.time });
    if (this.history.length > 12) this.history.shift();
    if (e.duration) this.active.push({ id: e.id, endsAt: sim.time + e.duration });
    e.execute(sim);
  }

  /** Debug: force an event regardless of eligibility/cooldown. Returns false for unknown ids. */
  force(id: WorldEventId): boolean {
    const e = EVENTS.find((x) => x.id === id);
    if (!e) return false;
    this.fire(e);
    return true;
  }

  get ids(): WorldEventId[] {
    return EVENTS.map((e) => e.id);
  }

  serialize(): [string, number][] {
    return [...this.lastAt.entries()];
  }

  restore(list: [string, number][] | undefined, nowSim: number): void {
    this.lastAt.clear();
    for (const [k, v] of list ?? []) this.lastAt.set(k as WorldEventId, Math.min(v, nowSim));
  }
}
