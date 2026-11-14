import { hourBump } from '../core/math';
import type { Simulation } from '../sim/Simulation';
import type { Step } from '../systems/StepRunner';
import { getLocation } from '../config/worldLayout';
import { Activity, propAt, type ActivityRun } from './Activity';

/** Calling her sister: retrieve phone, chat and gesture, laugh, hang up. */
export class PhoneActivity extends Activity {
  readonly id = 'phone' as const;

  isAvailable(sim: Simulation): boolean {
    const n = sim.character.needs;
    const h = sim.clock.hour;
    return h >= 8 && h <= 22.3 && n.energy > 15 && n.pain < 70;
  }

  calculateUtility(sim: Simulation): number {
    const n = sim.character.needs;
    const p = sim.personality;
    let u = p.socialAffinity * 0.3 + 0.85 * Math.pow(1 - n.social / 100, 1.5) + 0.15 * hourBump(sim.clock.hour, 18, 4);
    if (sim.emotion.mood.value < 40) u += 0.12; // wants comfort from Sis
    u += 0.1 * Math.min(1, sim.memory.influence('rainedOn'));
    return u;
  }

  override buildPrepare(): Step[] {
    return [
      { action: 'phoneRetrieve', duration: 1.3, label: 'get phone', face: { emotion: 'happy' }, thought: 'social', onTick: propAt('phone', 0.35), sfx: 'phone' }
    ];
  }

  override buildResume(sim: Simulation): Step[] {
    return [{ moveTo: { x: getLocation(this.locationId).x } }, ...this.buildPrepare()];
  }

  override nextPerformSteps(sim: Simulation, run: ActivityRun): Step[] {
    const steps: Step[] = [
      { action: 'phoneTalk', duration: sim.rng.range(4.5, 8), face: { emotion: 'happy', talking: true }, label: 'chatting' }
    ];
    if (sim.rng.chance(0.55)) {
      steps.push({ action: 'phoneLaugh', duration: 2.2, face: { emotion: 'delighted', talking: true }, sfx: 'giggle', thought: run.cycles % 2 === 0 ? 'phoneChat' : undefined, label: 'laughing' });
    }
    if (sim.rng.chance(0.25)) {
      steps.push({ action: 'phoneTalk', duration: 2.5, face: { emotion: 'curious', talking: true }, label: 'listening' });
    }
    return steps;
  }

  override buildComplete(): Step[] {
    return [
      { action: 'phoneEnd', duration: 1.25, face: { emotion: 'happy' }, label: 'hang up', onEnd: (env) => { env.agent.prop = null; } },
      { action: 'wave', duration: 1.4, face: { emotion: 'delighted' }, label: 'blow a kiss', sfx: 'happy' }
    ];
  }

  override onFinished(sim: Simulation): void {
    sim.memory.add('phoneChat', 0.6, 0.6, 'windowTable');
  }
}
