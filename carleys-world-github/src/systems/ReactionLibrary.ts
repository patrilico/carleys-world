import { GARDEN_POT, getLocation } from '../config/worldLayout';
import type { Carley } from '../entities/Carley';
import type { Mosquito } from '../entities/Insect';
import type { Vec2 } from '../core/types';
import type { Simulation } from '../sim/Simulation';
import { restingAction } from './AnimationController';
import { StepRunner, type Step, type StepEnv } from './StepRunner';

/** Interrupt hierarchy: higher number wins. Activity-specific animations sit at 30. */
export const Priority = {
  critical: 100,
  injury: 90,
  heal: 85,
  surprise: 70,
  irritation: 50,
  event: 35,
  activity: 30,
  ambient: 20,
  idle: 10
} as const;

export type ReactionId =
  | 'rainSurprise' | 'mosquito' | 'injury' | 'love' | 'milk' | 'windGust' | 'stumble' | 'startled'
  | 'butterfly' | 'bloom' | 'discovery' | 'sunEmerged' | 'noticeRain' | 'relief';

export interface ReactionRun {
  def: ReactionDef;
  runner: StepRunner;
  /** If true, the interrupted activity is abandoned when the reaction ends. */
  abandon: boolean;
  startedAt: number;
  data: Record<string, number | boolean>;
}

export interface ReactionDef {
  id: ReactionId;
  priority: number;
  /** Sim seconds before it can trigger again. */
  cooldown: number;
  /** Default for `ReactionRun.abandon`. */
  abandons: boolean;
  start(env: StepEnv, run: ReactionRun): Step[];
  /** More steps when the queue empties (return null to finish). */
  next?(env: StepEnv, run: ReactionRun): Step[] | null;
}

const standSteps = (agent: Carley, face?: Step['face']): Step[] => {
  switch (agent.posture) {
    case 'lying': return [{ action: 'getUp', posture: 'standing', face, label: 'get up' }];
    case 'sitting': return [{ action: 'standUp', posture: 'standing', face, label: 'stand up' }];
    case 'kneeling': return [{ action: 'kneelUp', posture: 'standing', face, label: 'get up' }];
    default: return [];
  }
};

const mosquitoGaze = (sim: Simulation) => (): Vec2 | null => {
  const m = sim.nearestMosquito(260);
  return m ? { x: m.x, y: m.y } : null;
};

/** One swat attempt: may kill the targeted mosquito. */
function attemptSwat(env: StepEnv, hard: boolean): void {
  const sim = env.sim;
  const m: Mosquito | null = sim.nearestMosquito(170);
  sim.bus.emit('sfx', { id: 'swat', x: env.agent.x });
  if (!m) return;
  env.agent.faceToward(m.x);
  const d = m.distanceTo(env.agent.x, env.agent.y - 70);
  let p = hard ? 0.42 : 0.24;
  if (d < 85) p *= 1.35;
  if (sim.rng.chance(p)) {
    sim.killMosquito(m);
    sim.bus.emit('effect', { kind: 'puff', x: m.x, y: m.y });
  } else {
    sim.bus.emit('effect', { kind: 'puff', x: m.x + (sim.rng.next() - 0.5) * 20, y: m.y + 10 });
  }
}

function mosquitoCycle(env: StepEnv, hard: boolean, first: boolean): Step[] {
  const sim = env.sim;
  const gaze = mosquitoGaze(sim);
  const steps: Step[] = [
    {
      action: 'frown', duration: first ? 0.85 : 0.5, label: 'frown at mosquito', sfx: first ? undefined : 'irritated',
      face: { emotion: hard ? 'angry' : 'irritated', gaze }, thought: first ? 'shoo' : undefined
    },
    {
      action: hard ? 'swatHard' : 'swat', duration: hard ? 0.7 : 0.8, label: hard ? 'swat angrily' : 'swat', face: { emotion: hard ? 'angry' : 'irritated', gaze },
      onStart: (e) => { delete e.agent.actionData.hit; },
      onTick: (e, t) => {
        if (t >= (hard ? 0.26 : 0.32) && !e.agent.actionData.hit) {
          e.agent.actionData.hit = 1;
          attemptSwat(e, hard);
        }
      }
    }
  ];
  return steps;
}

export const REACTIONS: Record<ReactionId, ReactionDef> = {
  rainSurprise: {
    id: 'rainSurprise', priority: Priority.surprise, cooldown: 20, abandons: true,
    start: (env) => {
      const lying = env.agent.posture === 'lying';
      const shelter = getLocation('shelter').x;
      return [
        {
          action: lying ? 'lieIdle' : 'lookUp', duration: 0.95, prop: null, label: 'notice raindrops', sfx: 'surprise', thought: 'rain',
          face: { emotion: 'surprised', gaze: { x: env.agent.x, y: 30 } }, emotion: ['surprised', 0.9, 1.3]
        },
        { action: lying ? 'lieIdle' : 'sigh', duration: 1.2, label: 'disappointed', face: { emotion: 'sad' }, sfx: 'sad', emotion: ['sad', 0.8, 2] },
        { moveTo: { x: shelter, run: true, tolerance: 12 }, label: 'run for the house', face: { emotion: 'surprised' } },
        { action: 'shakeOff', duration: 1.15, label: 'shake off drops', face: { emotion: 'irritated' }, sfx: 'surprise' },
        { action: 'relief', duration: 1.7, label: 'safe and dry', face: { emotion: 'relaxed' }, thought: 'cozy' }
      ] as Step[];
    }
  },

  mosquito: {
    id: 'mosquito', priority: Priority.irritation, cooldown: 5, abandons: false,
    start: (env, run) => {
      const sim = env.sim;
      run.data.cycles = 0;
      run.data.waited = 0;
      sim.memory.add('mosquitoAnnoyed', -0.6, 0.6, 'outdoors');
      const gaze = mosquitoGaze(sim);
      const steps: Step[] = [
        {
          action: env.agent.posture === 'lying' ? 'lieIdle' : 'idle', duration: 0.9, label: 'eyes follow mosquito',
          face: { emotion: 'curious', gaze }, sfx: 'surprise', emotion: ['curious', 0.7, 1]
        },
        ...standSteps(env.agent, { emotion: 'irritated', gaze }),
        ...mosquitoCycle(env, false, true)
      ];
      return steps;
    },
    next: (env, run) => {
      const sim = env.sim;
      if (run.data.done) return null;
      const near = sim.nearestMosquito(170);
      if (run.data.retreating) {
        run.data.done = true;
        return null;
      }
      if (!near) {
        if (!run.data.waited) {
          run.data.waited = 1;
          return [{
            action: 'lookAround', duration: 1.6, label: 'is it gone?', face: { emotion: 'irritated', gaze: mosquitoGaze(sim) },
            until: (e) => sim.nearestMosquito(170) !== null
          }];
        }
        run.data.done = true;
        sim.memory.add('mosquitoRelief', 0.5, 0.6, 'outdoors');
        sim.activities.setResumeBonus(sim.brain.interruptedActivityId() ?? 'gardening', 0.35, sim.time + 90);
        return [{ action: 'relief', duration: 1.75, label: 'visible relief', face: { emotion: 'relaxed' }, thought: 'relief', emotion: ['relaxed', 0.9, 3] }];
      }
      run.data.waited = 0;
      const cycles = ((run.data.cycles as number) || 0) + 1;
      run.data.cycles = cycles;
      const irritation = sim.character.needs.irritation;
      if (irritation > 78 && cycles >= 3) {
        run.data.retreating = true;
        run.abandon = true;
        return [
          { action: 'stomp', duration: 1.1, label: 'stomp in frustration', face: { emotion: 'angry' }, sfx: 'irritated', thought: 'shoo' },
          { moveTo: { x: getLocation('shelter').x, run: true, tolerance: 12 }, label: 'retreat indoors', face: { emotion: 'angry' } },
          { action: 'crossArms', duration: 2, label: 'sulk indoors', face: { emotion: 'irritated' } }
        ];
      }
      return mosquitoCycle(env, irritation > 52, false);
    }
  },

  injury: {
    id: 'injury', priority: Priority.injury, cooldown: 30, abandons: true,
    start: (env) => {
      env.sim.memory.add('gardeningInjury', -0.75, 0.8, 'flowerbed');
      return [
        { action: 'flinch', duration: 0.75, posture: 'standing', prop: null, label: 'flinch', face: { emotion: 'hurt' }, sfx: 'ouch', thought: 'ouch', emotion: ['hurt', 1, 4] },
        { action: 'holdHand', duration: 2.8, label: 'hold injured hand', face: { emotion: 'hurt' }, sfx: 'sad' },
        { action: 'sigh', duration: 1.6, label: 'wince', face: { emotion: 'sad' } }
      ];
    }
  },

  love: {
    id: 'love', priority: Priority.heal, cooldown: 2, abandons: false,
    start: (env) => [
      ...standSteps(env.agent, { emotion: 'surprised' }),
      { action: 'surprised', duration: 0.7, label: 'what a feeling!', face: { emotion: 'surprised', gaze: { x: env.agent.x, y: 40 } }, sfx: 'heal', onStart: (e) => { e.agent.glow = 1; } },
      { action: 'smileToSelf', duration: 2, label: 'hugs herself', face: { emotion: 'delighted', override: { blush: 1 } }, thought: 'loved', sfx: 'giggle', emotion: ['delighted', 1, 4] },
      { action: 'excitedBounce', duration: 1.5, label: 'happy bounce', face: { emotion: 'delighted' } },
      { action: 'wave', duration: 1.7, label: 'waves upward', face: { emotion: 'delighted', gaze: { x: env.agent.x + 20, y: 30 } }, sfx: 'happy' }
    ]
  },

  milk: {
    id: 'milk', priority: Priority.heal, cooldown: 2, abandons: false,
    start: (env) => [
      ...standSteps(env.agent, { emotion: 'surprised' }),
      { action: 'surprised', duration: 0.8, label: 'a glass appears!', face: { emotion: 'surprised' }, sfx: 'surprise', thought: 'milk', prop: null, onStart: (e) => e.sim.bus.emit('effect', { kind: 'sparkles', x: e.agent.x + 20, y: e.agent.y - 60 }) },
      { action: 'takeGlass', duration: 1, label: 'takes the glass', face: { emotion: 'delighted' }, prop: 'milk', sfx: 'pop' },
      {
        action: 'drinkMilk', duration: 2.8, label: 'gulp gulp gulp', face: { emotion: 'relaxed', eyesClosed: true }, sfx: 'gulp',
        onEnd: (e) => { e.agent.stache = 1; }
      },
      {
        action: 'relief', duration: 1.8, label: 'ahhh!', face: { emotion: 'delighted' }, prop: null, sfx: 'happy', thought: 'milkDone',
        onStart: (e) => {
          const s = e.sim;
          s.character.needs.tummy = Math.min(100, s.character.needs.tummy + 70);
          s.character.needs.irritation = Math.max(0, s.character.needs.irritation - 10);
          s.memory.add('milk', 0.8, 0.8);
          s.bus.emit('effect', { kind: 'heal', x: e.agent.x, y: e.agent.y - 55 });
          e.agent.glow = 1;
        }
      },
      { action: 'excitedBounce', duration: 1.8, label: 'happy dance', face: { emotion: 'delighted', override: { blush: 1 } }, sfx: 'giggle' }
    ]
  },

  windGust: {
    id: 'windGust', priority: 60, cooldown: 12, abandons: false,
    start: (env) => {
      const sim = env.sim;
      const annoyed = sim.rng.chance(0.4);
      if (env.agent.posture === 'lying') {
        return [{ action: 'sunAdjust', duration: 1.8, label: 'gust ruffles hair', face: { emotion: 'surprised' }, thought: 'windy' }];
      }
      const steps: Step[] = [
        { action: 'surprised', duration: 0.7, label: 'startled by gust', face: { emotion: 'surprised' }, sfx: 'surprise', emotion: ['surprised', 0.7, 1] },
        { action: 'hairAdjust', duration: 1.7, label: 'fix windblown hair', face: { emotion: annoyed ? 'irritated' : 'curious' }, thought: 'windy' }
      ];
      return steps;
    }
  },

  stumble: {
    id: 'stumble', priority: Priority.critical, cooldown: 25, abandons: false,
    start: () => [
      { action: 'stumble', duration: 0.95, label: 'lose balance', face: { emotion: 'surprised' }, sfx: 'surprise', emotion: ['surprised', 1, 1.5] },
      { action: 'recoverBalance', duration: 0.9, label: 'recover balance', face: { emotion: 'surprised' } },
      { action: 'smile', duration: 1.3, label: 'embarrassed giggle', face: { emotion: 'happy', override: { blush: 1 } }, sfx: 'giggle', thought: 'startled' }
    ]
  },

  startled: {
    id: 'startled', priority: Priority.surprise, cooldown: 15, abandons: false,
    start: (env) => {
      const sim = env.sim;
      const potX = GARDEN_POT.x + GARDEN_POT.w / 2;
      const outdoors = sim.isOutdoors;
      const look = outdoors ? { x: potX, y: sim.agent.y - 20 } : null;
      return [
        ...standSteps(env.agent, { emotion: 'surprised' }),
        { action: 'startledJump', duration: 0.85, label: 'startled jump', face: { emotion: 'surprised' }, sfx: 'surprise', thought: 'startled', emotion: ['surprised', 1, 1.5] },
        { action: 'lookAround', duration: 1.8, label: 'what was that?', face: { emotion: 'curious', gaze: look } },
        { action: 'relief', duration: 1.7, label: 'phew', face: { emotion: 'relaxed' } }
      ];
    }
  },

  butterfly: {
    id: 'butterfly', priority: Priority.event, cooldown: 45, abandons: false,
    start: (env) => {
      const sim = env.sim;
      const gaze = (): Vec2 | null => {
        const b = sim.nearestButterfly(300);
        return b ? { x: b.x, y: b.y } : null;
      };
      sim.memory.add('butterflyDelight', 0.7, 0.6, 'outdoors');
      if (env.agent.posture !== 'standing') {
        return [{ action: restingAction(env.agent.posture) === 'lieIdle' ? 'lieIdle' : restingAction(env.agent.posture), duration: 2, label: 'watch butterfly', face: { emotion: 'delighted', gaze }, thought: 'butterfly', sfx: 'giggle' }];
      }
      return [
        { action: 'headTilt', duration: 1.3, label: 'notice butterfly', face: { emotion: 'curious', gaze }, thought: 'butterfly' },
        { action: 'point', duration: 1.2, label: 'point at butterfly', face: { emotion: 'delighted', gaze }, sfx: 'giggle' },
        { action: 'excitedBounce', duration: 1.4, label: 'delighted bounce', face: { emotion: 'delighted', gaze } }
      ];
    }
  },

  bloom: {
    id: 'bloom', priority: Priority.event, cooldown: 25, abandons: false,
    start: (env) => {
      const sim = env.sim;
      sim.memory.add('flowerBloomed', 0.6, 0.6, 'flowerbed');
      const gaze = sim.lastBloomPos ?? undefined;
      if (env.agent.posture !== 'standing') {
        return [{ action: restingAction(env.agent.posture), duration: 1.8, label: 'admire bloom', face: { emotion: 'delighted', gaze }, thought: 'bloom' }];
      }
      return [
        { action: 'headTilt', duration: 1.2, label: 'notice bloom', face: { emotion: 'curious', gaze }, thought: 'bloom' },
        { action: 'excitedBounce', duration: 1.4, label: 'happy bounce', face: { emotion: 'delighted', gaze }, sfx: 'giggle' }
      ];
    }
  },

  discovery: {
    id: 'discovery', priority: Priority.event, cooldown: 30, abandons: false,
    start: (env) => {
      const sim = env.sim;
      sim.memory.add('discovery', 0.7, 0.6);
      return [
        ...standSteps(env.agent, { emotion: 'surprised' }),
        { action: 'surprised', duration: 0.7, label: 'what is that?', face: { emotion: 'surprised' }, sfx: 'surprise' },
        { action: 'examine', duration: 2, label: 'examine discovery', face: { emotion: 'curious' }, thought: sim.lastDiscovery },
        { action: 'celebrateJump', duration: 1.1, label: 'celebrate', face: { emotion: 'delighted' }, sfx: 'giggle' }
      ];
    }
  },

  sunEmerged: {
    id: 'sunEmerged', priority: Priority.ambient + 5, cooldown: 60, abandons: false,
    start: () => [
      { action: 'lookUp', duration: 1.3, label: 'sun comes out', face: { emotion: 'happy', gaze: { x: 900, y: 60 } }, thought: 'sun' },
      { action: 'smile', duration: 1.4, label: 'warm smile', face: { emotion: 'relaxed' } }
    ]
  },

  relief: {
    id: 'relief', priority: Priority.event, cooldown: 10, abandons: false,
    start: (env) => {
      const sim = env.sim;
      sim.memory.add('mosquitoRelief', 0.5, 0.6, 'outdoors');
      const ia = sim.brain.interruptedActivityId();
      if (ia) sim.activities.setResumeBonus(ia, 0.35, sim.time + 90);
      return [
        ...standSteps(env.agent, { emotion: 'relaxed' }),
        { action: 'relief', duration: 1.75, label: 'visible relief', face: { emotion: 'relaxed' }, thought: 'relief', emotion: ['relaxed', 0.9, 3] }
      ];
    }
  },

  noticeRain: {
    id: 'noticeRain', priority: Priority.ambient, cooldown: 60, abandons: false,
    start: () => [
      { action: 'lookAround', duration: 1.6, label: 'rain outside', face: { emotion: 'curious', gaze: { x: 280, y: 270 } }, thought: 'cozy' }
    ]
  }
};
