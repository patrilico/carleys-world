import { clamp01, hourBump } from '../core/math';
import { getLocation } from '../config/worldLayout';
import type { Simulation } from '../sim/Simulation';
import type { Step } from '../systems/StepRunner';
import { Activity, propAt, type ActivityRun } from './Activity';

/** Painting at the easel: the canvas visibly fills in over time. */
export class PaintingActivity extends Activity {
  readonly id = 'painting' as const;

  isAvailable(sim: Simulation): boolean {
    const n = sim.character.needs;
    const h = sim.clock.hour;
    return n.energy > 25 && n.pain < 70 && h >= 7 && h <= 22.5;
  }

  calculateUtility(sim: Simulation): number {
    const n = sim.character.needs;
    const p = sim.personality;
    let u = p.paintingAffinity * 0.48 + 0.3 * (n.boredom / 100) + 0.08 * p.curiosity + 0.2 * hourBump(sim.clock.hour, 15, 5);
    u += 0.1 * Math.min(1, sim.memory.influence('butterflyDelight') + sim.memory.influence('sunEnjoyed')); // inspiration
    u *= 1 - 0.3 * clamp01(n.irritation / 100);
    return u;
  }

  override buildPrepare(sim: Simulation): Step[] {
    return [
      { moveTo: { x: getLocation(this.locationId).x, tolerance: 3 }, label: 'to the easel' },
      {
        action: 'pickUp', duration: 1.1, faceDir: 1, label: 'pick up brush', face: { emotion: 'curious' },
        onStart: () => { if (sim.easel.progress >= 0.95) sim.easel.reset(sim.rng); },
        onTick: propAt('brush', 0.8)
      }
    ];
  }

  override buildResume(sim: Simulation): Step[] {
    return [{ moveTo: { x: getLocation(this.locationId).x, tolerance: 3 } }, { action: 'pickUp', duration: 1.1, faceDir: 1, onTick: propAt('brush', 0.8) }];
  }

  override nextPerformSteps(sim: Simulation, run: ActivityRun): Step[] {
    const easel = sim.easel;
    const painting = (dur: number, face: Step['face'], label: string): Step => ({
      action: 'paint', duration: dur, faceDir: 1, face, label,
      onTick: (_env, _t, dt) => { easel.progress = Math.min(1, easel.progress + dt / 42); easel.stroke += dt * 5; }
    });
    const steps: Step[] = [painting(sim.rng.range(5, 8), { emotion: 'curious' }, 'painting')];
    if (run.cycles % 2 === 1) {
      steps.push({ action: 'paintInspect', duration: 2.5, face: { emotion: 'curious' }, label: 'inspect artwork', thought: 'paint' });
      const r = sim.rng.next();
      if (r < 0.2) steps.push({ action: 'paintFrustrated', duration: 1.8, face: { emotion: 'irritated' }, label: 'frustrated', sfx: 'irritated' });
      else if (r < 0.6) steps.push({ action: 'smile', duration: 1.4, face: { emotion: 'happy' }, label: 'satisfied' });
    }
    return steps;
  }

  override buildComplete(sim: Simulation): Step[] {
    return [
      { action: 'paintAdmire', duration: 2.4, face: { emotion: 'delighted' }, label: 'admire painting', thought: 'paint', sfx: 'happy', onStart: () => { sim.easel.progress = Math.max(sim.easel.progress, 0.9); } },
      { action: 'putAway', duration: 1.1, label: 'put away brush', onEnd: (env) => { env.agent.prop = null; } }
    ];
  }

  override onFinished(sim: Simulation): void {
    sim.memory.add('paintedSomething', 0.6, 0.6, 'easel');
  }
}
