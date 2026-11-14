import { clamp01, hourBump } from '../core/math';
import { ACTIVITY_TUNING, type ActivityNeedsEffect } from '../config/activityConfig';
import { getLocation } from '../config/worldLayout';
import type { Simulation } from '../sim/Simulation';
import type { Step } from '../systems/StepRunner';
import { Activity, type ActivityRun } from './Activity';

const SUN_FACE = { emotion: 'relaxed' as const, eyesClosed: true };

/** Lying on the blanket in the sunshine. */
export class SunbathingActivity extends Activity {
  readonly id = 'sunbathing' as const;

  isAvailable(sim: Simulation): boolean {
    const n = sim.character.needs;
    const h = sim.clock.hour;
    if (!sim.zones.isLocationUsable(getLocation(this.locationId), sim.weather.raining)) return false;
    if (sim.weather.rain > 0.1) return false;
    if (sim.directSun < 0.4) return false;
    if (h < 8.5 || h > 18.2) return false;
    if (sim.weather.windStrength > 0.75) return false;
    if (n.pain >= 60) return false;
    // a mosquito close to the blanket makes it unappealing
    if (sim.mosquitoNear(getLocation(this.locationId).x, 220)) return false;
    return true;
  }

  calculateUtility(sim: Simulation): number {
    const n = sim.character.needs;
    const p = sim.personality;
    let u = p.sunbathingAffinity * 0.55 * sim.directSun + 0.18 * (1 - n.comfort / 100) + 0.14 * ((100 - n.energy) / 100) + 0.08 * (n.comfort < 60 ? 1 : 0);
    u *= 0.35 + 0.65 * hourBump(sim.clock.hour, 14, 3.2);
    u *= 1 - 0.55 * clamp01(sim.mosquitoPressure() + sim.memory.influence('mosquitoAnnoyed') * 0.5);
    u *= 1 - 0.45 * Math.min(1, sim.memory.influence('rainedOn'));
    u += 0.12 * Math.min(1, sim.memory.influence('sunEnjoyed'));
    if (sim.weather.type === 'windy') u *= 0.75;
    return u;
  }

  override needsEffect(sim: Simulation): ActivityNeedsEffect | null {
    const e = ACTIVITY_TUNING.sunbathing.effects;
    const s = clamp01(sim.directSun);
    return { ...e, relax: (e.relax ?? 0) * (0.5 + 0.5 * s) };
  }

  override buildPrepare(sim: Simulation): Step[] {
    return [
      { action: 'lieDown', duration: 1.8, posture: 'lying', face: { emotion: 'happy' }, label: 'lie down', onStart: (env) => { env.agent.lieDir = 1; } },
      { action: 'sunAdjust', duration: 1.8, face: { emotion: 'relaxed' }, sfx: 'yawn', label: 'stretch comfortably' }
    ];
  }

  override buildResume(sim: Simulation): Step[] {
    return [{ moveTo: { x: getLocation(this.locationId).x, tolerance: 10 } }, ...this.buildPrepare(sim)];
  }

  override nextPerformSteps(sim: Simulation, run: ActivityRun): Step[] {
    const steps: Step[] = [
      { action: 'sunRelax', duration: sim.rng.range(6, 11), face: SUN_FACE, label: 'soak up the sun' }
    ];
    if (run.cycles > 0 && sim.rng.chance(0.55)) {
      steps.push({ action: 'sunAdjust', duration: 1.8, face: { emotion: 'relaxed' }, label: 'adjust position' });
    }
    if (sim.rng.chance(0.28)) steps.push({ action: 'sunRelax', duration: 0.1, face: SUN_FACE, thought: 'lovelyDay' });
    return steps;
  }

  override shouldEnd(sim: Simulation, run: ActivityRun): boolean {
    if (run.performed < 12) return false;
    return sim.directSun < 0.22 || sim.weather.windStrength > 0.85 || sim.clock.hour > 18.8;
  }

  override buildComplete(): Step[] {
    return [
      { action: 'sitUp', duration: 1.1, posture: 'sitting', face: { emotion: 'tired' }, label: 'sit up' },
      { action: 'sitStretch', duration: 2.5, face: { emotion: 'happy' }, sfx: 'yawn', label: 'stretch' },
      { action: 'standUp', duration: 0.95, posture: 'standing', face: { emotion: 'happy' }, label: 'stand' }
    ];
  }

  override onFinished(sim: Simulation, run: ActivityRun): void {
    if (run.performed > 25) sim.memory.add('sunEnjoyed', 0.7, 0.7, 'blanket');
  }
}
