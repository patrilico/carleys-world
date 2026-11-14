import { hourBump } from '../core/math';
import { getLocation } from '../config/worldLayout';
import type { Simulation } from '../sim/Simulation';
import type { Step } from '../systems/StepRunner';
import { Activity, type ActivityRun } from './Activity';

const ASLEEP = { emotion: 'relaxed' as const, eyesClosed: true };

/** Sleeping in the bed: hop up, lie down, breathe, wake, stretch, stand. */
export class SleepingActivity extends Activity {
  readonly id = 'sleeping' as const;

  override get isSleep(): boolean {
    return true;
  }

  isAvailable(sim: Simulation): boolean {
    const n = sim.character.needs;
    const h = sim.clock.hour;
    // Once asleep she stays available until the natural wake-up rules in shouldEnd() apply.
    if (sim.brain.run?.activity.id === 'sleeping') return true;
    const night = h >= 20 || h < 7;
    // She sleeps at night when not fully rested, or naps when exhausted.
    return (night && n.energy < 88) || n.energy < 32;
  }

  calculateUtility(sim: Simulation): number {
    const n = sim.character.needs;
    const need = 1 - n.energy / 100;
    const night = hourBump(sim.clock.hour, 1.5, 4.5);
    let u = Math.pow(need, 1.5) * 1.1 + night * 0.55 * (n.energy < 75 ? 1 : 0.35);
    if (n.pain > 30) u += 0.08;
    return u;
  }

  override navigateX(): number {
    return getLocation('bedside').x;
  }

  override buildPrepare(): Step[] {
    return [
      { moveTo: { x: getLocation('bed').x, tolerance: 4 }, label: 'hop onto bed' },
      { action: 'sitDown', duration: 0.9, posture: 'sitting', faceDir: 1, face: { emotion: 'tired' }, label: 'sit on bed', thought: 'sleepy' },
      { action: 'lieDown', duration: 1.8, posture: 'lying', face: { emotion: 'tired' }, label: 'lie down', onStart: (env) => { env.agent.lieDir = -1; } },
      { action: 'sleep', duration: 1.2, face: ASLEEP, label: 'close eyes', onStart: (env) => env.sim.bus.emit('sleepStarted') }
    ];
  }

  override buildResume(sim: Simulation): Step[] {
    return this.buildPrepare().filter((s) => !(s.moveTo && Math.abs(sim.agent.x - s.moveTo.x) < 12));
  }

  override nextPerformSteps(sim: Simulation, run: ActivityRun): Step[] {
    const steps: Step[] = [{ action: 'sleep', duration: sim.rng.range(6, 10), face: ASLEEP, label: 'sleeping' }];
    if (run.cycles % 3 === 2) steps.push({ action: 'sunAdjust', duration: 1.8, face: ASLEEP, label: 'roll over' });
    return steps;
  }

  override shouldEnd(sim: Simulation): boolean {
    const n = sim.character.needs;
    const h = sim.clock.hour;
    const night = h >= 21 || h < 5.5;
    if (night) return false; // sleeps through the night (the energy cap simply holds at full)
    return n.energy >= (h >= 5.5 && h < 12 ? 85 : 96);
  }

  override buildComplete(): Step[] {
    return [
      { action: 'sitUp', duration: 1.1, posture: 'sitting', face: { emotion: 'tired', override: { eyeOpen: 0.25 } }, label: 'wake up', onStart: (env) => env.sim.bus.emit('sleepEnded') },
      { action: 'sitStretch', duration: 2.5, face: { emotion: 'tired', override: { mouthOpen: 0.85, eyeOpen: 0.1, mouthCurve: 0 } }, sfx: 'yawn', label: 'yawn and stretch' },
      { action: 'standUp', duration: 0.95, posture: 'standing', face: { emotion: 'happy' }, label: 'stand' }
    ];
  }
}
