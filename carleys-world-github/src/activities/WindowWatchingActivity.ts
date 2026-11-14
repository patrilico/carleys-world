import { hourBump } from '../core/math';
import { WINDOW_RECT } from '../config/worldLayout';
import type { Simulation } from '../sim/Simulation';
import type { Step } from '../systems/StepRunner';
import { Activity, type ActivityRun } from './Activity';

/** Standing at the window watching the weather (especially rain) or the sunset. */
export class WindowWatchingActivity extends Activity {
  readonly id = 'windowWatching' as const;

  isAvailable(sim: Simulation): boolean {
    return sim.character.needs.energy > 12;
  }

  calculateUtility(sim: Simulation): number {
    const p = sim.personality;
    const rain = sim.weather.raining ? 0.55 : 0;
    const sunset = 0.25 * hourBump(sim.clock.hour, 18.8, 1);
    const recentRain = 0.25 * Math.min(1, sim.memory.influence('rainedOn'));
    return 0.1 + rain + sunset + recentRain + p.curiosity * 0.1;
  }

  override navigateX(): number {
    return 288;
  }

  override buildPrepare(): Step[] {
    return [{ moveTo: { x: 288, tolerance: 4 }, label: 'to window' }, { action: 'turn', duration: 0.3, faceDir: 1 }];
  }

  override buildResume(): Step[] {
    return this.buildPrepare();
  }

  override nextPerformSteps(sim: Simulation, run: ActivityRun): Step[] {
    const gaze = { x: WINDOW_RECT.x + WINDOW_RECT.w / 2, y: WINDOW_RECT.y + WINDOW_RECT.h / 2 };
    const raining = sim.weather.raining;
    const emotion = raining ? ('relaxed' as const) : sim.clock.hour > 17 ? ('happy' as const) : ('curious' as const);
    const steps: Step[] = [{ action: 'windowWatch', duration: sim.rng.range(5, 9), face: { emotion, gaze }, label: 'watching outside' }];
    if (run.cycles === 0) steps[0].thought = raining ? 'cozy' : sim.clock.daylight < 0.3 ? 'moon' : 'lovelyDay';
    return steps;
  }

  override buildComplete(): Step[] {
    return [{ action: 'smile', duration: 1, face: { emotion: 'relaxed' } }];
  }
}
