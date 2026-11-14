import { clamp, clamp01, hourBump } from '../core/math';
import type { Simulation } from '../sim/Simulation';
import { getLocation } from '../config/worldLayout';
import type { Step } from '../systems/StepRunner';
import { Activity, propAt, type ActivityRun } from './Activity';
import type { ActivityNeedsEffect } from '../config/activityConfig';
import { ACTIVITY_TUNING } from '../config/activityConfig';

/** Watering the flowerbed: fetch the can, tend plants one by one, put the can away. */
export class GardeningActivity extends Activity {
  readonly id = 'gardening' as const;

  isAvailable(sim: Simulation): boolean {
    const n = sim.character.needs;
    if (!sim.zones.isLocationUsable(getLocation(this.locationId), sim.weather.raining)) return false;
    if (sim.weather.rain > 0.1) return false;
    if (sim.clock.daylight < 0.35) return false;
    if (sim.weather.windStrength > 0.85) return false;
    return n.pain < 55 && n.energy > 25;
  }

  calculateUtility(sim: Simulation): number {
    const n = sim.character.needs;
    const p = sim.personality;
    const avgMoisture = sim.plants.reduce((s, pl) => s + pl.state.moisture, 0) / Math.max(1, sim.plants.length);
    let u = p.gardeningAffinity * 0.5 + 0.3 * (n.boredom / 100) + 0.2 * ((100 - avgMoisture) / 100);
    u *= 0.45 + 0.55 * hourBump(sim.clock.hour, 13, 4.2);
    const w = sim.weather.type;
    u *= w === 'sunny' ? 1.1 : w === 'cloudy' ? 0.95 : w === 'windy' ? 0.7 : 0;
    u *= clamp(n.energy / 70, 0.3, 1);
    u *= 1 - 0.55 * Math.min(1, sim.memory.influence('gardeningInjury'));
    u *= 1 - 0.5 * clamp01(sim.mosquitoPressure() + sim.memory.influence('mosquitoAnnoyed') * 0.5);
    u *= 1 - n.pain / 120;
    return u;
  }

  override needsEffect(sim: Simulation): ActivityNeedsEffect | null {
    const e = ACTIVITY_TUNING.gardening.effects;
    const favourable = sim.directSun > 0.3 && !sim.weather.raining ? 1 : 0.7;
    return { ...e, nature: (e.nature ?? 0) * favourable };
  }

  override buildPrepare(): Step[] {
    return [
      {
        action: 'pickUp', duration: 1.25, label: 'pick up watering can', face: { emotion: 'happy' },
        faceDir: 1, onTick: propAt('wateringCan', 0.85)
      }
    ];
  }

  override buildResume(sim: Simulation): Step[] {
    if (sim.agent.prop === 'wateringCan') return [];
    return [
      { moveTo: { x: getLocation(this.locationId).x }, label: 'back to the can' },
      ...this.buildPrepare()
    ];
  }

  override nextPerformSteps(sim: Simulation, run: ActivityRun): Step[] {
    // choose a thirsty plant, with some randomness
    const sorted = [...sim.plants].sort((a, b) => a.state.moisture - b.state.moisture);
    const pick = sim.rng.pick(sorted.slice(0, 3));
    const kneel = sim.rng.chance(0.4);
    const standX = pick.x - 24;
    run.data.plant = pick.index;
    const steps: Step[] = [
      { moveTo: { x: standX, tolerance: 4 }, label: `walk to plant ${pick.index}`, face: { emotion: 'happy' } }
    ];
    if (kneel) steps.push({ action: 'kneel', posture: 'kneeling', label: 'kneel', faceDir: 1 });
    const dur = sim.rng.range(3.4, 5);
    steps.push({
      action: 'water', duration: dur, label: 'water flowers', faceDir: 1, sfx: 'water',
      face: { emotion: 'happy', gaze: () => ({ x: pick.x, y: sim.agent.y - 20 }) },
      onTick: (env, t, dt) => {
        if (t > 0.5) pick.water(0); // keep pulse alive
        if (t > 0.5) pick.state.moisture = Math.min(100, pick.state.moisture + 9 * dt);
      },
      onEnd: () => sim.bus.emit('plantWatered', { index: pick.index })
    });
    if (sim.rng.chance(0.55)) {
      steps.push({
        action: 'inspectFlower', duration: 2.4, label: 'inspect flower',
        face: { emotion: pick.state.flowering ? 'delighted' : 'curious', gaze: () => ({ x: pick.x, y: sim.agent.y - 40 }) },
        thought: pick.state.flowering ? 'flowers' : undefined
      });
    }
    if (kneel || sim.agent.posture === 'kneeling') steps.push({ action: 'kneelUp', posture: 'standing', label: 'get up' });
    // success: smile when the plant is well watered
    steps.push({ action: 'smile', duration: 1.3, face: { emotion: pick.state.moisture > 70 ? 'delighted' : 'happy' }, label: 'smile' });
    return steps;
  }

  override buildComplete(): Step[] {
    return [
      { moveTo: { x: getLocation(this.locationId).x }, label: 'return can' },
      { action: 'putAway', duration: 1.1, faceDir: -1, label: 'put away can', onEnd: (env) => { env.agent.prop = null; } },
      { action: 'smile', duration: 1.2, face: { emotion: 'happy' }, thought: 'flowers' }
    ];
  }

  override onFinished(sim: Simulation): void {
    sim.memory.add('gardenedHappily', 0.4, 0.4, 'flowerbed');
  }
}
