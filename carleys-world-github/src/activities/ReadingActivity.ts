import { clamp01, hourBump } from '../core/math';
import { getLocation } from '../config/worldLayout';
import type { Simulation } from '../sim/Simulation';
import type { Step } from '../systems/StepRunner';
import { Activity, gazeNear, propAt, type ActivityRun } from './Activity';

/** Curled up in the reading chair with a book. */
export class ReadingActivity extends Activity {
  readonly id = 'reading' as const;

  isAvailable(sim: Simulation): boolean {
    const n = sim.character.needs;
    return n.energy > 8 && n.pain < 90;
  }

  calculateUtility(sim: Simulation): number {
    const n = sim.character.needs;
    const p = sim.personality;
    const rainy = sim.weather.raining || sim.weather.type === 'cloudy' ? 1 : 0;
    let u = p.readingAffinity * 0.45 + 0.28 * (n.boredom / 100) + 0.16 * rainy + 0.22 * hourBump(sim.clock.hour, 19.5, 3);
    if (n.pain > 25) u += 0.1; // quiet pastimes when hurt
    if (n.energy < 25) u *= 0.7;
    u *= 1 + 0.15 * Math.min(1, sim.memory.influence('rainedOn'));
    return u * (0.6 + 0.4 * clamp01(1 - n.irritation / 100));
  }

  override buildPrepare(): Step[] {
    return [
      { action: 'sitDown', duration: 0.9, posture: 'sitting', faceDir: 1, label: 'sit in chair', face: { emotion: 'relaxed' } },
      { action: 'read', duration: 0.7, label: 'open book', face: { emotion: 'curious' }, onTick: propAt('book', 0.1) }
    ];
  }

  override buildResume(): Step[] {
    return [{ moveTo: { x: getLocation('readingChair').x } }, ...this.buildPrepare()];
  }

  override nextPerformSteps(sim: Simulation, run: ActivityRun): Step[] {
    const gaze = gazeNear(sim, 10, 26);
    const absorbed = { emotion: 'neutral' as const, gaze, override: { eyeOpen: 0.82 } };
    const steps: Step[] = [{ action: 'read', duration: sim.rng.range(5, 9), face: absorbed, label: 'reading' }];
    const r = sim.rng.next();
    if (r < 0.26) {
      steps.push({ action: 'readSurprised', duration: 1.1, face: { emotion: 'surprised' }, thought: 'book', label: 'surprising page!' });
    } else if (r < 0.55) {
      steps.push({ action: 'read', duration: 2.2, face: { emotion: 'happy', gaze }, label: 'smiling at the story' });
    } else if (r < 0.7) {
      steps.push({ action: 'read', duration: 1.8, face: { emotion: 'sad', gaze }, label: 'touching passage' });
    }
    steps.push({ action: 'turnPage', duration: 0.8, face: absorbed, sfx: 'page', label: 'turn page' });
    return steps;
  }

  override buildComplete(): Step[] {
    return [
      { action: 'sitIdle', duration: 0.7, face: { emotion: 'happy' }, label: 'close book', onEnd: (env) => { env.agent.prop = null; } },
      { action: 'standUp', duration: 0.95, posture: 'standing', label: 'stand up' }
    ];
  }

  override onFinished(sim: Simulation): void {
    sim.memory.add('cozyRead', 0.4, 0.4, 'readingChair');
  }
}
