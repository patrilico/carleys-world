import { BRAIN_TUNING } from '../config/activityConfig';
import { meterValue } from '../config/meterConfig';
import { ACTIVITY_GOAL } from './CommandSystem';
import { POSTURE } from '../config/emotionConfig';
import type { ActivityRun } from '../activities/Activity';
import type { ActivityType, BrainState } from '../core/types';
import type { Simulation } from '../sim/Simulation';
import type { UtilityScore } from './ActivitySystem';
import { Priority, REACTIONS, type ReactionId, type ReactionRun } from './ReactionLibrary';
import { StepRunner, type StepEnv } from './StepRunner';

interface Suspended {
  run: ActivityRun;
  state: BrainState;
  at: number;
}

const ACTIVITY_STATES: BrainState[] = ['NAVIGATE_TO_LOCATION', 'PREPARE_ACTIVITY', 'PERFORM_ACTIVITY', 'COMPLETE_ACTIVITY'];

/**
 * Autonomous decision making: utility-based activity selection feeding a finite-state machine that executes
 * the lifecycle SELECT -> NAVIGATE -> PREPARE -> PERFORM -> COMPLETE -> TRANSITION, with interrupts that move
 * into REACTING and afterwards either resume the interrupted activity or reassess.
 */
export class CharacterBrain {
  state: BrainState = 'SELECT_ACTIVITY';
  run: ActivityRun | null = null;
  reaction: ReactionRun | null = null;
  lastInterrupted: { id: ActivityType; at: number } | null = null;
  lastScores: UtilityScore[] = [];
  /** Count of times navigation got stuck and was recovered (should stay ~0). */
  stuckRecoveries = 0;

  private suspended: Suspended | null = null;
  private runner = new StepRunner();
  private resistance = 0;
  private reevalTimer = 0;
  private endReason: string | null = null;
  private lastReactionAt = new Map<ReactionId, number>();
  private idleSelectDelay = 0;
  /** Activity the player asked for; starts as soon as the current one wraps up. */
  pending: ActivityType | null = null;

  constructor(private sim: Simulation) {}

  private get env(): StepEnv {
    return { sim: this.sim, agent: this.sim.agent };
  }

  /** True while Carley is actually asleep in bed (energy recovers, drain stops). */
  get isSleeping(): boolean {
    return (
      !!this.run && this.state === 'PERFORM_ACTIVITY' && this.run.activity.isSleep && this.sim.agent.posture === 'lying'
    );
  }

  get isPerforming(): boolean {
    return this.state === 'PERFORM_ACTIVITY' && !!this.run;
  }

  get currentStepLabel(): string {
    return this.reaction ? this.reaction.runner.label : this.runner.label;
  }

  interruptedActivityId(): ActivityType | null {
    if (this.suspended) return this.suspended.run.activity.id;
    if (this.lastInterrupted && this.sim.time - this.lastInterrupted.at < 150) return this.lastInterrupted.id;
    return null;
  }

  /** Called every frame. `dt` is real seconds (movement/animation), `simDt` is scaled simulation time. */
  update(dt: number, simDt: number): void {
    const sim = this.sim;
    const agent = sim.agent;
    const env = this.env;
    this.resistance = Math.max(0, this.resistance - simDt);

    // movement speed follows emotion, pain and exhaustion
    const n = sim.character.needs;
    agent.speedMultiplier = POSTURE[sim.emotion.effective].speed * (n.pain > 25 ? 0.75 : 1) * (n.energy < 20 ? 0.85 : 1);

    if (agent.stuck) this.recoverFromStuck();

    if (this.state === 'REACTING') {
      this.updateReaction(dt, env);
      return;
    }

    switch (this.state) {
      case 'SELECT_ACTIVITY': {
        this.idleSelectDelay -= dt;
        if (this.idleSelectDelay <= 0) this.selectActivity();
        break;
      }
      case 'NAVIGATE_TO_LOCATION': {
        if (this.runner.update(dt, env)) this.enterPrepare();
        break;
      }
      case 'PREPARE_ACTIVITY': {
        if (this.runner.update(dt, env)) {
          this.run!.prepared = true;
          this.enterPerform();
        }
        break;
      }
      case 'PERFORM_ACTIVITY': {
        const run = this.run!;
        run.performed += simDt;
        sim.character.activityElapsed = run.performed;
        this.checkEnd(simDt);
        if (this.runner.update(dt, env)) {
          if (this.endReason) this.enterComplete();
          else {
            const steps = run.activity.nextPerformSteps(sim, run);
            run.cycles++;
            this.runner.start(steps);
          }
        }
        break;
      }
      case 'COMPLETE_ACTIVITY': {
        if (this.runner.update(dt, env)) this.finishActivity(this.endReason ?? 'completed');
        break;
      }
      case 'PLAY_TRANSITION': {
        if (this.runner.update(dt, env)) {
          this.state = 'SELECT_ACTIVITY';
          this.idleSelectDelay = 0;
        }
        break;
      }
    }
  }

  // ------------------------------------------------------------------ activity lifecycle

  private selectActivity(): void {
    const sim = this.sim;
    if (this.pending) {
      const id = this.pending;
      this.pending = null;
      this.startActivity(id, true);
      return;
    }
    // Without autopilot Carley only potters about (idle gestures) until the player tells her what to do.
    if (!sim.autopilot) {
      this.startActivity('idle');
      return;
    }
    this.lastScores = sim.activities.evaluate(sim);
    const id = sim.activities.select(sim);
    this.startActivity(id);
  }

  /** The player asks for an activity. Returns false if she can't be interrupted right now. */
  command(id: ActivityType): boolean {
    if (this.reaction) return false;
    this.pending = id;
    const busy = this.run && this.run.activity.id !== 'idle';
    if (busy && this.state === 'PERFORM_ACTIVITY') {
      this.endReason = 'new command';
    } else if (busy && this.state === 'COMPLETE_ACTIVITY') {
      /* finishes tidying up, then the pending activity starts */
    } else if (this.run) {
      this.abandonActivity('commanded');
      this.idleSelectDelay = 0;
    } else {
      this.runner.clear(this.env);
      this.state = 'SELECT_ACTIVITY';
      this.idleSelectDelay = 0;
    }
    return true;
  }

  /** The player tells her to stop what she's doing. */
  stopActivity(): void {
    this.pending = null;
    if (!this.run || this.run.activity.id === 'idle') return;
    if (this.state === 'PERFORM_ACTIVITY') this.endReason = 'stopped';
    else if (this.state === 'NAVIGATE_TO_LOCATION' || this.state === 'PREPARE_ACTIVITY') this.abandonActivity('stopped');
  }

  startActivity(id: ActivityType, commanded = false): void {
    const sim = this.sim;
    const act = sim.activities.get(id);
    const run: ActivityRun = {
      activity: act, phase: 'navigate', performed: 0, target: 0, prepared: false, startedAt: sim.time, cycles: 0, data: { commanded }
    };
    this.run = run;
    this.endReason = null;
    this.reevalTimer = 0;
    sim.character.currentActivity = id;
    sim.character.activityElapsed = 0;
    sim.character.currentLocationId = id === 'idle' ? undefined : act.locationId;
    sim.bus.emit('activityStarted', { activity: id });
    if (id === 'idle') {
      this.enterPerform();
      return;
    }
    const x = act.navigateX(sim, run);
    this.state = 'NAVIGATE_TO_LOCATION';
    this.runner.start([{ moveTo: { x, tolerance: 6 }, label: `go to ${act.locationId}` }]);
  }

  private enterPrepare(): void {
    const sim = this.sim;
    const run = this.run!;
    if (sim.agent.stuck) return;
    run.phase = 'prepare';
    this.state = 'PREPARE_ACTIVITY';
    this.runner.start(run.activity.buildPrepare(sim, run));
  }

  private enterPerform(): void {
    const run = this.run!;
    run.phase = 'perform';
    if (run.target <= 0) {
      const a = run.activity;
      run.target = run.data.commanded ? 36000 : this.sim.rng.range(a.minDuration, a.maxDuration);
    }
    this.state = 'PERFORM_ACTIVITY';
    this.runner.start([]);
  }

  /** Re-evaluate whether to stop performing: natural end, lost availability, or a clearly better option. */
  private checkEnd(simDt: number): void {
    if (this.endReason) return;
    const sim = this.sim;
    const run = this.run!;
    const a = run.activity;
    if (run.performed >= run.target) {
      this.endReason = 'duration complete';
      return;
    }
    if (a.id === 'idle') return;
    const commanded = run.data.commanded === true;
    if (commanded) {
      // commanded activities run until the meter they feed is full (or the player says stop)
      const goal = ACTIVITY_GOAL[a.id];
      if (goal && run.performed > 3 && meterValue(sim.character.needs, goal) >= 99) {
        this.endReason = 'meter full';
        return;
      }
    }
    if (run.performed >= Math.min(8, a.minDuration)) {
      if (!(commanded && a.id === 'sleeping') && a.shouldEnd(sim, run)) {
        this.endReason = 'goal satisfied';
        return;
      }
      if (!commanded && !a.isAvailable(sim)) {
        this.endReason = 'no longer available';
        return;
      }
    }
    if (commanded || !sim.autopilot) return;
    if (run.performed < a.minDuration || this.resistance > 0) return;
    this.reevalTimer += simDt;
    if (this.reevalTimer < BRAIN_TUNING.reevaluateEvery) return;
    this.reevalTimer = 0;
    const scores = sim.activities.evaluate(sim);
    this.lastScores = scores;
    const cur = Math.max(0.05, a.calculateUtility(sim));
    const best = scores.find((s) => s.available && s.id !== a.id && s.id !== 'idle');
    if (best && best.utility > 0.5 && best.utility > cur * a.switchRatio) this.endReason = `better option: ${best.id}`;
  }

  private enterComplete(): void {
    const run = this.run!;
    run.phase = 'complete';
    this.state = 'COMPLETE_ACTIVITY';
    this.runner.start(run.activity.buildComplete(this.sim, run));
  }

  private finishActivity(reason: string): void {
    const sim = this.sim;
    const run = this.run;
    if (run) {
      run.activity.onFinished(sim, run);
      run.activity.onAbandon(sim, run); // ensure no prop is left in hand
      sim.activities.markEnded(run.activity.id, sim.time);
      sim.bus.emit('activityEnded', { activity: run.activity.id, reason });
    }
    this.run = null;
    this.endReason = null;
    sim.character.currentActivity = 'idle';
    sim.character.currentLocationId = undefined;
    sim.agent.prop = null;
    sim.agent.face = {};
    if (this.pending) {
      this.state = 'SELECT_ACTIVITY';
      this.idleSelectDelay = 0;
      this.runner.clear();
      return;
    }
    this.state = 'PLAY_TRANSITION';
    this.runner.start(sim.activities.idle.transitionSteps(sim));
  }

  /** Abandon the activity (interruption). Allows it again sooner than a normal cooldown. */
  private abandonActivity(reason: string): void {
    const sim = this.sim;
    const run = this.run;
    if (run) {
      run.activity.onAbandon(sim, run);
      sim.activities.markEnded(run.activity.id, sim.time - run.activity.cooldown * 0.5);
      sim.bus.emit('activityEnded', { activity: run.activity.id, reason });
      this.lastInterrupted = { id: run.activity.id, at: sim.time };
    }
    this.run = null;
    this.endReason = null;
    sim.character.currentActivity = 'idle';
    sim.character.currentLocationId = undefined;
    sim.agent.prop = null;
    this.state = 'SELECT_ACTIVITY';
    this.idleSelectDelay = 0.4;
    this.runner.clear();
  }

  // ------------------------------------------------------------------ reactions

  /** Request a reaction. Returns whether it started (priority / cooldown / commitment rules apply). */
  react(id: ReactionId, force = false): boolean {
    const sim = this.sim;
    const def = REACTIONS[id];
    const now = sim.time;
    if (!force && now - (this.lastReactionAt.get(id) ?? -1e9) < def.cooldown) return false;

    const activityState = ACTIVITY_STATES.includes(this.state);
    if (this.reaction) {
      if (!force && def.priority <= this.reaction.def.priority) return false;
    } else if (activityState && this.run && this.run.activity.id !== 'idle' && def.priority <= Priority.activity && !force) {
      return false; // ambient reactions never override a committed activity
    }

    const carried = this.reaction?.abandon ?? false;
    if (this.reaction) {
      this.reaction.runner.clear(this.env);
    } else if (activityState && this.run) {
      this.suspended = { run: this.run, state: this.state, at: now };
      this.runner.clear(this.env);
    } else {
      this.suspended = null;
      this.runner.clear(this.env);
    }

    const run: ReactionRun = { def, runner: new StepRunner(), abandon: def.abandons || carried, startedAt: now, data: {} };
    this.reaction = run;
    this.lastReactionAt.set(id, now);
    this.state = 'REACTING';
    sim.agent.stop();
    sim.agent.actionData = {};
    run.runner.start(def.start(this.env, run));
    return true;
  }

  private updateReaction(dt: number, env: StepEnv): void {
    const r = this.reaction!;
    if (r.runner.update(dt, env)) {
      const more = r.def.next?.(env, r);
      if (more && more.length > 0) r.runner.start(more);
      else this.finishReaction();
    }
  }

  private finishReaction(): void {
    const sim = this.sim;
    const r = this.reaction!;
    this.reaction = null;
    sim.agent.face = {};
    sim.agent.actionData = {};
    this.resistance = BRAIN_TUNING.postReactionResistance;
    const sus = this.suspended;
    this.suspended = null;
    if (!sus) {
      this.state = 'SELECT_ACTIVITY';
      this.idleSelectDelay = 0.3;
      return;
    }
    this.run = sus.run;
    const act = sus.run.activity;
    if (sus.state === 'COMPLETE_ACTIVITY') {
      this.finishActivity('completed');
      return;
    }
    const gap = sim.time - sus.at;
    const canResume = !r.abandon && gap <= BRAIN_TUNING.resumeWindow && (act.id === 'idle' || act.isAvailable(sim));
    if (!canResume) {
      this.abandonActivity(r.abandon ? `interrupted by ${r.def.id}` : 'could not resume');
      return;
    }
    // quick interruption: resume where she left off
    if (!sus.run.prepared) {
      this.state = 'NAVIGATE_TO_LOCATION';
      this.runner.start([{ moveTo: { x: act.navigateX(sim, sus.run), tolerance: 6 }, label: 'resume: go to location' }]);
    } else {
      this.state = 'PREPARE_ACTIVITY';
      this.runner.start(act.buildResume(sim, sus.run));
    }
  }

  // ------------------------------------------------------------------ recovery

  private recoverFromStuck(): void {
    const sim = this.sim;
    const agent = sim.agent;
    this.stuckRecoveries++;
    agent.clearStuck();
    agent.stop();
    agent.body.teleport(sim.zones.nearestFloorStandX(agent.x));
    agent.posture = 'standing';
    if (this.reaction) {
      this.reaction.runner.clear();
      this.reaction = null;
      this.suspended = null;
    }
    if (this.run) this.abandonActivity('navigation failed');
    else {
      this.state = 'SELECT_ACTIVITY';
      this.runner.clear();
    }
  }

  /** Put Carley into a safe idle state (used after loading a save). */
  resetToIdle(): void {
    this.reaction = null;
    this.suspended = null;
    this.run = null;
    this.endReason = null;
    this.runner.clear();
    this.state = 'SELECT_ACTIVITY';
    this.idleSelectDelay = 1.2;
    this.sim.agent.posture = 'standing';
    this.sim.agent.prop = null;
    this.sim.agent.face = {};
    this.sim.agent.play('idle', true);
    this.sim.character.currentActivity = 'idle';
  }

  describe(): { state: BrainState; activity: ActivityType; phase: string; step: string; reaction: string } {
    return {
      state: this.state,
      activity: this.run?.activity.id ?? 'idle',
      phase: this.run?.phase ?? '-',
      step: this.currentStepLabel,
      reaction: this.reaction?.def.id ?? '-'
    };
  }
}
