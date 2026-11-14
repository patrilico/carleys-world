import { Simulation, type SimulationOptions } from '../src/sim/Simulation';
import type { ActivityType } from '../src/core/types';

/** Headless simulation with a kinematic body and (by default) no random events for determinism. */
export function makeSim(opts: SimulationOptions = {}): Simulation {
  return new Simulation({ seed: 42, noEvents: true, noNaturalWeather: true, ...opts });
}

/** Step the sim until `cond` is true or `maxSeconds` of real time elapse. Returns true if the condition held. */
export function runUntil(sim: Simulation, cond: () => boolean, maxSeconds = 120, step = 1 / 30): boolean {
  let t = 0;
  while (t < maxSeconds) {
    if (cond()) return true;
    sim.update(step);
    t += step;
  }
  return cond();
}

/** Force Carley to begin a specific activity immediately (bypassing utility selection). */
export function startActivity(sim: Simulation, id: ActivityType): void {
  sim.brain.startActivity(id);
}
