import { clamp01 } from '../core/math';
import type { Simulation } from '../sim/Simulation';
import type { Step } from '../systems/StepRunner';
import { Activity, type ActivityRun } from './Activity';

interface Micro {
  id: string;
  weight: (sim: Simulation) => number;
  build: (sim: Simulation) => Step[];
}

/** Region Carley may wander in for a given zone (floor positions that are never on furniture). */
const REGION = { indoor: [226, 482] as const, outdoor: [570, 1220] as const };

/**
 * Wandering and spontaneous small behaviours - stretching, yawning, humming, tiny dances, looking around...
 * These keep her feeling alive between big activities. Chosen by weights from needs, personality and mood.
 */
export class IdleActivity extends Activity {
  readonly id = 'idle' as const;

  isAvailable(): boolean {
    return true;
  }

  calculateUtility(sim: Simulation): number {
    // fallback desire: stronger when nothing else is attractive; playful personalities idle more
    return 0.2 + sim.personality.playfulness * 0.08;
  }

  override navigateX(sim: Simulation): number {
    return sim.agent.x;
  }

  private readonly micros: Micro[] = [
    { id: 'lookAround', weight: (s) => 1 + s.personality.curiosity, build: () => [{ action: 'lookAround', duration: 2.6, face: { emotion: 'curious' }, label: 'look around' }] },
    { id: 'stretch', weight: (s) => 0.6 + (100 - s.character.needs.energy) / 120, build: () => [{ action: 'stretch', duration: 2.8, face: { emotion: 'relaxed' }, sfx: 'yawn', label: 'stretch' }] },
    { id: 'yawn', weight: (s) => Math.max(0, (60 - s.character.needs.energy) / 25), build: () => [{ action: 'yawn', duration: 1.9, face: { emotion: 'tired', override: { mouthOpen: 0.85, eyeOpen: 0.2, mouthCurve: 0 } }, sfx: 'yawn', label: 'yawn' }] },
    { id: 'hum', weight: (s) => s.personality.playfulness * (s.emotion.mood.value > 50 ? 1.2 : 0.3), build: () => [{ action: 'hum', duration: 3.4, face: { emotion: 'happy', override: { mouthOpen: 0.3, mouthWidth: 0.6 } }, sfx: 'hum', label: 'humming' }] },
    { id: 'tinyDance', weight: (s) => s.personality.playfulness * (s.emotion.mood.value > 58 ? 1 : 0.1), build: () => [{ action: 'tinyDance', duration: 2.6, face: { emotion: 'delighted' }, sfx: 'hum', label: 'tiny dance' }] },
    { id: 'headTilt', weight: (s) => s.personality.curiosity * 0.9, build: () => [{ action: 'headTilt', duration: 1.6, face: { emotion: 'curious' }, label: 'head tilt' }] },
    { id: 'hair', weight: () => 0.7, build: () => [{ action: 'hairAdjust', duration: 1.6, face: { emotion: 'neutral' }, label: 'adjust hair' }] },
    { id: 'examine', weight: (s) => s.personality.curiosity * 0.7, build: () => [{ action: 'examine', duration: 2.4, face: { emotion: 'curious' }, label: 'examine something' }] },
    { id: 'smile', weight: (s) => (s.emotion.mood.value > 55 ? 0.9 : 0.15), build: () => [{ action: 'smileToSelf', duration: 2.2, face: { emotion: 'happy', override: { blush: 0.8 } }, label: 'smile to herself' }] },
    { id: 'sigh', weight: (s) => (s.character.needs.boredom > 55 ? 0.8 : 0.15), build: () => [{ action: 'sigh', duration: 1.6, face: { emotion: 'neutral' }, thought: 'bored', label: 'sigh' }] },
    {
      id: 'sit',
      weight: (s) => (s.character.needs.energy < 60 ? 0.9 : 0.35),
      build: () => [
        { action: 'sitDown', posture: 'sitting', duration: 0.9, face: { emotion: 'relaxed' }, label: 'sit down' },
        { action: 'sitIdle', duration: 3.2, face: { emotion: 'relaxed' }, label: 'sit briefly' },
        { action: 'standUp', posture: 'standing', duration: 0.95, label: 'stand up' }
      ]
    },
    {
      id: 'sky',
      weight: (s) => (s.isOutdoors ? 1.2 : 0),
      build: (s) => [{ action: 'watchSky', duration: 2.8, face: { emotion: 'relaxed', gaze: { x: s.agent.x + 80, y: 120 } }, thought: s.clock.daylight < 0.3 ? 'moon' : s.weather.type === 'sunny' ? 'lovelyDay' : undefined, label: 'watch the sky' }]
    },
    {
      id: 'wander',
      weight: () => 2.2,
      build: (s) => {
        const target = this.pickWanderTarget(s);
        const steps: Step[] = [{ moveTo: { x: target, tolerance: 8 }, label: 'wander', face: { emotion: s.emotion.effective === 'neutral' ? 'happy' : undefined } }];
        if (s.rng.chance(0.5)) steps.push({ action: 'lookAround', duration: 2, face: { emotion: 'curious' }, label: 'look around' });
        return steps;
      }
    }
  ];

  pickWanderTarget(sim: Simulation): number {
    const wantsIndoor = sim.weather.raining || sim.clock.daylight < 0.25 || sim.character.needs.pain > 30 || sim.mosquitoPressure() > 0.3;
    let zone = sim.agent.x < 512 ? 'indoor' : 'outdoor';
    if (wantsIndoor) zone = 'indoor';
    else if (sim.rng.chance(0.2)) zone = zone === 'indoor' ? 'outdoor' : 'indoor';
    const [lo, hi] = REGION[zone as 'indoor' | 'outdoor'];
    return sim.zones.nearestFloorStandX(sim.rng.range(lo, hi));
  }

  override nextPerformSteps(sim: Simulation, run: ActivityRun): Step[] {
    const last = run.data.last as string | undefined;
    const choices = this.micros.filter((m) => m.id !== last);
    const m = sim.rng.weighted(choices, (c) => c.weight(sim));
    run.data.last = m.id;
    return m.build(sim);
  }

  /** Short beat between activities - small, mood-appropriate gestures. */
  transitionSteps(sim: Simulation): Step[] {
    const n = sim.character.needs;
    const mood = sim.emotion.mood.value;
    if (n.pain > 30) return [{ action: 'sigh', duration: 1.4, face: { emotion: 'hurt' }, label: 'wince' }];
    if (mood > 65 && sim.rng.chance(0.5)) return [{ action: 'smile', duration: 1.3, face: { emotion: 'happy' }, label: 'content smile' }];
    if (n.energy < 40) return [{ action: 'sigh', duration: 1.5, face: { emotion: 'tired' }, label: 'tired sigh' }];
    if (sim.rng.chance(0.4)) return [{ action: 'stretch', duration: 2.4, face: { emotion: 'relaxed' }, label: 'stretch' }];
    return [{ action: 'lookAround', duration: 1.8, face: { emotion: 'curious' }, label: 'what next?' }];
  }

  utilityHint(sim: Simulation): number {
    return clamp01(this.calculateUtility(sim));
  }
}
