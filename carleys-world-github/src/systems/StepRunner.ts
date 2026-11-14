import type { Carley, FaceDirective } from '../entities/Carley';
import type { ActionId, EmotionType, Posture, PropId } from '../core/types';
import type { SfxId } from '../core/EventBus';
import type { Simulation } from '../sim/Simulation';
import { ACTION_DURATION } from './AnimationController';

export interface StepEnv {
  sim: Simulation;
  agent: Carley;
}

/** One beat of a scripted behaviour (an activity stage or a reaction stage). */
export interface Step {
  /** Pose/animation to play (ignored for moveTo steps, which pick walk/run/sad-walk automatically). */
  action?: ActionId;
  /** Real seconds. For `until` steps this is a timeout. */
  duration?: number;
  moveTo?: { x: number; run?: boolean; tolerance?: number };
  until?: (env: StepEnv, t: number) => boolean;
  face?: FaceDirective;
  /** Prop held from now on (undefined = unchanged). */
  prop?: PropId;
  /** Posture after this step starts (undefined = unchanged). */
  posture?: Posture;
  faceDir?: 1 | -1;
  sfx?: SfxId;
  /** Briefly force an emotion: [emotion, intensity, seconds] */
  emotion?: [EmotionType, number, number];
  thought?: string;
  onStart?: (env: StepEnv) => void;
  onTick?: (env: StepEnv, t: number, dt: number) => void;
  onEnd?: (env: StepEnv) => void;
  label?: string;
}

const STAND_FROM: Record<Posture, { action: ActionId; posture: Posture }> = {
  standing: { action: 'idle', posture: 'standing' },
  sitting: { action: 'standUp', posture: 'standing' },
  lying: { action: 'getUp', posture: 'standing' },
  kneeling: { action: 'kneelUp', posture: 'standing' }
};

/** Executes a queue of steps; shared by activities and reactions. */
export class StepRunner {
  private queue: Step[] = [];
  private cur: Step | null = null;
  private t = 0;
  private moveTime = 0;
  /** Name of the step currently running (debug) */
  get label(): string {
    return this.cur?.label ?? this.cur?.action ?? (this.cur?.moveTo ? 'move' : '-');
  }
  get currentStep(): Step | null {
    return this.cur;
  }

  get idle(): boolean {
    return this.cur === null && this.queue.length === 0;
  }

  start(steps: Step[]): void {
    this.queue = [...steps];
    this.cur = null;
    this.t = 0;
  }

  append(steps: Step[]): void {
    this.queue.push(...steps);
  }

  clear(env?: StepEnv): void {
    if (this.cur && env) this.cur.onEnd?.(env);
    this.queue = [];
    this.cur = null;
  }

  /** Advance by real dt; returns true when everything has finished. */
  update(dt: number, env: StepEnv): boolean {
    for (let guard = 0; guard < 6; guard++) {
      if (!this.cur) {
        const next = this.queue.shift();
        if (!next) return true;
        this.begin(next, env);
      }
      const step = this.cur!;
      this.t += dt;
      step.onTick?.(env, this.t, dt);

      let done = false;
      if (step.moveTo) {
        this.moveTime += dt;
        const run = !!step.moveTo.run;
        const arrived = env.agent.moveToward(step.moveTo.x, run, step.moveTo.tolerance ?? 6);
        // movement animation follows speed/emotion
        env.agent.play(this.movementAction(env, run));
        if (arrived) done = true;
        else if (env.agent.stuck || this.moveTime > 30) {
          done = true; // give up; the brain notices agent.stuck
        }
      } else {
        const dur = step.duration ?? (step.action ? ACTION_DURATION[step.action] ?? 1 : 0.5);
        if (step.until) {
          if (step.until(env, this.t) || (step.duration !== undefined && this.t >= step.duration)) done = true;
        } else if (this.t >= dur) done = true;
      }
      if (!done) return false;
      step.onEnd?.(env);
      this.cur = null;
      this.t = 0;
      // loop to start the next step in the same frame (no dead frames)
      if (this.queue.length === 0) return true;
    }
    return false;
  }

  private movementAction(env: StepEnv, run: boolean): ActionId {
    const needs = env.sim.character.needs;
    if (needs.pain >= 25) return 'cautiousWalk';
    const e = env.sim.emotion.effective;
    if (!run && (e === 'sad' || e === 'tired' || e === 'hurt')) return 'sadWalk';
    return run ? 'run' : 'walk';
  }

  private begin(step: Step, env: StepEnv): void {
    const agent = env.agent;
    // Walking requires standing up first (auto-inserted stand-up beat).
    if (step.moveTo && agent.posture !== 'standing') {
      const from = STAND_FROM[agent.posture];
      this.queue.unshift(step);
      step = {
        action: from.action,
        posture: from.posture,
        face: step.face,
        label: 'stand up'
      };
    }
    this.cur = step;
    this.t = 0;
    this.moveTime = 0;
    if (step.moveTo) agent.clearStuck();
    if (step.posture) agent.posture = step.posture;
    if (step.prop !== undefined) {
      agent.prop = step.prop;
      env.sim.bus.emit('propChanged', { prop: step.prop });
    }
    if (step.faceDir) agent.facing = step.faceDir;
    if (step.face !== undefined) agent.face = step.face;
    if (step.action && !step.moveTo) agent.play(step.action, true);
    if (step.sfx) env.sim.bus.emit('sfx', { id: step.sfx, x: agent.x });
    if (step.emotion) env.sim.emotion.trigger(step.emotion[0], step.emotion[1], step.emotion[2]);
    if (step.thought) env.sim.say(step.thought, 6);
    if (!step.moveTo) agent.stop();
    step.onStart?.(env);
  }
}
