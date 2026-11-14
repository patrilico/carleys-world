import { ActivitySystem } from '../systems/ActivitySystem';
import { CharacterBrain } from '../systems/CharacterBrain';
import { DayNightSystem } from '../systems/DayNightSystem';
import { EmotionSystem, computeMoodScore } from '../systems/EmotionSystem';
import { CommandSystem } from '../systems/CommandSystem';
import { MemorySystem } from '../systems/MemorySystem';
import { createInitialNeeds, updateNeeds, applyMosquitoAnnoyance, type NeedsEnvironment } from '../systems/NeedsSystem';
import { ThoughtSystem } from '../systems/ThoughtSystem';
import { WeatherSystem } from '../systems/WeatherSystem';
import { WorldEventSystem } from '../systems/WorldEventSystem';
import { ZoneSystem } from '../systems/ZoneSystem';
import { Carley, KinematicBody, type CharacterBody } from '../entities/Carley';
import { Easel } from '../entities/InteractiveObject';
import { Butterfly, Mosquito, resetInsectIds, type InsectEnv } from '../entities/Insect';
import { Plant, createPlants } from '../entities/Plant';
import { DEFAULT_PERSONALITY, MOSQUITO } from '../config/characterConfig';
import { GAME_CONFIG } from '../config/gameConfig';
import { FLOOR_Y, PLANT_XS, ZONE_SPLIT_X } from '../config/worldLayout';
import { EventBus } from '../core/EventBus';
import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import type { ActivityType, CharacterState, PersonalityProfile, Vec2 } from '../core/types';
import type { ActivityNeedsEffect } from '../config/activityConfig';

export interface SimulationOptions {
  seed?: number;
  body?: CharacterBody;
  startHour?: number;
  dayLengthSeconds?: number;
  /** Disable random world events (deterministic unit tests). */
  noEvents?: boolean;
  noNaturalWeather?: boolean;
}

/**
 * The whole simulated world, independent of Phaser. Rendering reads this state; Phaser provides the physics body
 * through the CharacterBody interface. Acts as the SimulationContext handed to activities, reactions and powers.
 */
export class Simulation {
  readonly rng: Rng;
  readonly bus = new EventBus();
  readonly zones = new ZoneSystem();
  readonly clock: DayNightSystem;
  readonly weather: WeatherSystem;
  readonly memory: MemorySystem;
  readonly emotion: EmotionSystem;
  readonly personality: PersonalityProfile = { ...DEFAULT_PERSONALITY };
  readonly character: CharacterState;
  readonly agent: Carley;
  readonly plants: Plant[];
  mosquitoes: Mosquito[] = [];
  butterflies: Butterfly[] = [];
  readonly easel = new Easel();
  readonly activities = new ActivitySystem();
  readonly brain: CharacterBrain;
  readonly events: WorldEventSystem;
  readonly commands: CommandSystem;
  /** When true Carley chooses her own activities (the old fully-autonomous mode). Default: the player decides. */
  autopilot = false;
  /** Sim seconds Carley has been kept reasonably happy in a row, and the best run so far. */
  happyStreak = 0;
  bestStreak = 0;
  readonly thoughts: ThoughtSystem;

  /** Total simulated seconds. */
  time = 0;
  /** Total real seconds (for thought rate-limits, UI). */
  realTime = 0;
  timeScale = 1;
  paused = false;
  /** Debug: stop the AI so animations can be previewed. */
  aiFrozen = false;
  noEvents: boolean;
  noNaturalWeather: boolean;

  lastDiscovery = 'Look what I found!';
  lastBloomPos: Vec2 | null = null;
  reactionData: Record<string, number | boolean> = {};
  /** Runtime stats for the debug panel / tests. */
  stats = { mosquitoesSwatted: 0, mosquitoesShooed: 0, injuries: 0 };

  private mosquitoPresenceCache = 0;
  private annoyanceCache = 0;
  private insectEnv: InsectEnv;
  private effectScratch: ActivityNeedsEffect = {};
  private perceptionTimer = 0;

  constructor(opts: SimulationOptions = {}) {
    resetInsectIds();
    this.rng = new Rng(opts.seed ?? GAME_CONFIG.seed);
    this.noEvents = opts.noEvents ?? false;
    this.noNaturalWeather = opts.noNaturalWeather ?? false;
    this.clock = new DayNightSystem(opts.startHour ?? GAME_CONFIG.startHour, opts.dayLengthSeconds ?? GAME_CONFIG.dayLengthSeconds);
    this.weather = new WeatherSystem(this.bus, this.rng, 'sunny');
    this.memory = new MemorySystem(() => this.time);
    this.emotion = new EmotionSystem(this.bus);
    this.plants = createPlants(this.rng);
    this.agent = new Carley(opts.body ?? new KinematicBody(360));
    this.character = {
      needs: createInitialNeeds(),
      currentEmotion: 'neutral',
      currentActivity: 'idle',
      currentZone: 'indoor',
      currentLocationId: undefined,
      activityElapsed: 0,
      recentMemories: []
    };
    this.emotion.mood.snap(computeMoodScore(this.character.needs, 0));
    this.insectEnv = {
      target: { x: 0, y: 0, outdoors: false },
      minX: this.zones.insectBounds().minX, maxX: this.zones.insectBounds().maxX, minY: 110, maxY: FLOOR_Y - 30,
      wind: 0, flowers: this.plants.map((p) => ({ x: p.x, y: FLOOR_Y - 46 }))
    };
    this.brain = new CharacterBrain(this);
    this.events = new WorldEventSystem(this);
    this.commands = new CommandSystem(this);
    this.thoughts = new ThoughtSystem(this);
    this.wireEvents();
    this.brain.resetToIdle();
  }

  // ------------------------------------------------------------------ derived world facts

  get isOutdoors(): boolean {
    return this.agent.x >= ZONE_SPLIT_X;
  }

  /** Direct sunlight available outdoors (time of day * weather). Indoors ignores this. */
  get directSun(): number {
    return this.clock.directSun(this.weather.sun);
  }

  get outdoorLight(): number {
    return this.clock.outdoorLight(this.weather.sun);
  }

  /** Rain actually falling on Carley's position (never true indoors). */
  get rainOnCarley(): boolean {
    return this.weather.raining && this.zones.rainReaches(this.agent.x);
  }

  get secondsPerHour(): number {
    return this.clock.secondsPerHour;
  }

  headPos(): Vec2 {
    const a = this.agent;
    switch (a.posture) {
      case 'lying': return { x: a.x + a.lieDir * 54, y: a.y - 26 };
      case 'sitting': return { x: a.x, y: a.y - 76 };
      case 'kneeling': return { x: a.x + 6, y: a.y - 72 };
      default: return { x: a.x, y: a.y - 88 };
    }
  }

  liveMosquitoes(): Mosquito[] {
    return this.mosquitoes.filter((m) => m.state !== 'dying' && m.state !== 'flee');
  }

  /** Global presence of mosquitoes (0..1): used by activity utilities. */
  mosquitoPressure(): number {
    return this.mosquitoPresenceCache;
  }

  mosquitoNear(x: number, radius: number): boolean {
    return this.mosquitoes.some((m) => m.state !== 'dying' && m.state !== 'flee' && Math.abs(m.x - x) < radius);
  }

  nearestMosquito(maxDist: number): Mosquito | null {
    if (!this.isOutdoors) return null;
    const h = this.headPos();
    let best: Mosquito | null = null;
    let bd = maxDist;
    for (const m of this.mosquitoes) {
      if (m.state === 'dying' || m.state === 'flee') continue;
      const d = m.distanceTo(h.x, h.y);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }

  nearestButterfly(maxDist: number): Butterfly | null {
    const h = this.headPos();
    let best: Butterfly | null = null;
    let bd = maxDist;
    for (const b of this.butterflies) {
      if (b.state === 'leaving') continue;
      const d = Math.hypot(b.x - h.x, b.y - h.y);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ actions used by activities / powers

  say(keyOrText: string, priority = 3): void {
    this.thoughts.say(keyOrText, priority);
  }

  spawnMosquito(x: number, y: number): Mosquito | null {
    if (this.liveMosquitoes().length >= GAME_CONFIG.limits.maxMosquitoes) return null;
    const b = this.zones.insectBounds();
    const m = new Mosquito(clamp(x, b.minX + 10, b.maxX), clamp(y, 130, FLOOR_Y - 40), this.rng);
    this.mosquitoes.push(m);
    this.bus.emit('mosquitoSpawned', { id: m.id });
    return m;
  }

  spawnButterfly(x: number, y: number, friendly: boolean): Butterfly | null {
    if (this.butterflies.length >= GAME_CONFIG.limits.maxButterflies) return null;
    const b = new Butterfly(x, y, this.rng, friendly);
    this.butterflies.push(b);
    this.bus.emit('butterflySpawned', { id: b.id });
    return b;
  }

  killMosquito(m: Mosquito): void {
    if (m.state === 'dying') return;
    m.swat();
    this.stats.mosquitoesSwatted++;
  }

  injure(cause: string): void {
    const n = this.character.needs;
    n.pain = clamp(n.pain + 42, 0, 100);
    this.stats.injuries++;
    this.bus.emit('injury', { cause });
  }

  announceBloom(index: number): void {
    const p = this.plants[index];
    this.lastBloomPos = { x: p.x, y: FLOOR_Y - 50 };
    this.bus.emit('effect', { kind: 'bloom', x: p.x, y: FLOOR_Y - 50 });
    this.bus.emit('sfx', { id: 'bloom', x: p.x });
    this.bus.emit('plantBloomed', { index });
  }

  // ------------------------------------------------------------------ event wiring (perception)

  private wireEvents(): void {
    const bus = this.bus;
    bus.on('rainStarted', () => {
      if (this.brain.isSleeping) return;
      if (this.isOutdoors) {
        this.memory.add('rainedOn', -0.6, 0.7, 'outdoors');
        this.brain.react('rainSurprise');
      } else {
        this.brain.react('noticeRain');
      }
    });
    bus.on('injury', () => {
      this.brain.react('injury', true);
    });
    bus.on('windGust', () => {
      if (!this.isOutdoors || this.weather.gust < 0.6 || this.brain.isSleeping) return;
      this.memory.add('windy', -0.1, 0.3);
      if (this.agent.moving !== 'none' && this.rng.chance(0.4)) this.brain.react('stumble');
      else this.brain.react('windGust');
    });
    bus.on('sunEmerged', () => {
      if (this.brain.isSleeping) return;
      if (this.isOutdoors || this.brain.state === 'SELECT_ACTIVITY') this.brain.react('sunEmerged');
    });
    bus.on('plantBloomed', ({ index }) => {
      const p = this.plants[index];
      if (this.isOutdoors && Math.abs(this.agent.x - p.x) < 520 && !this.brain.isSleeping) this.brain.react('bloom');
    });
    bus.on('mosquitoRemoved', ({ cause }) => {
      if (cause === 'shooed') this.stats.mosquitoesShooed++;
    });
  }

  // ------------------------------------------------------------------ main update

  /** Advance the simulation. `dt` is real seconds. */
  update(dt: number): void {
    if (this.paused) return;
    dt = Math.min(dt, GAME_CONFIG.maxStepSeconds);
    if (dt <= 0) return;
    const simDt = dt * this.timeScale;
    this.realTime += dt;
    this.time += simDt;

    // --- world ---
    this.clock.update(simDt);
    this.weather.update(simDt, !this.noNaturalWeather);
    const sun = this.directSun;
    for (const p of this.plants) {
      if (p.update(simDt, this.secondsPerHour, sun, this.weather.raining ? this.weather.rain : 0)) this.announceBloom(p.index);
    }
    this.updateInsects(dt);
    if (!this.noEvents) this.events.update(simDt);

    // --- character ---
    this.agent.update(dt);
    if (!this.aiFrozen) this.brain.update(dt, simDt);
    this.updateFootsteps();
    this.perceive(dt);
    this.updateNeeds(dt, simDt);
    const needs = this.character.needs;
    this.emotion.update(dt, needs, this.character.currentActivity, this.brain.isPerforming, this.memory.moodContribution());
    this.memory.update(simDt);
    this.thoughts.update(dt);

    this.agent.glow = Math.max(0, this.agent.glow - dt * 0.5);
    // objective: keep her happy. The streak grows while happiness stays comfortable and resets if she is miserable.
    const mood = this.emotion.mood.value;
    if (mood >= 40) this.happyStreak += simDt;
    else if (mood < 25) this.happyStreak = 0;
    this.bestStreak = Math.max(this.bestStreak, this.happyStreak);
    this.agent.stache = Math.max(0, this.agent.stache - dt * 0.12);
    const c = this.character;
    c.currentZone = this.zones.zoneAt(this.agent.x);
    c.currentEmotion = this.emotion.effective;
    c.recentMemories = this.memory.recent(8);
  }

  private updateFootsteps(): void {
    if (this.agent.footstep) this.bus.emit('sfx', { id: 'footstep', x: this.agent.x, volume: this.agent.moving === 'run' ? 1 : 0.7 });
  }

  private updateInsects(dt: number): void {
    const head = this.headPos();
    const env = this.insectEnv;
    env.target.x = head.x;
    env.target.y = head.y;
    env.target.outdoors = this.isOutdoors && head.x > env.minX - 40;
    env.wind = this.weather.windStrength;
    // mosquitoes hide from heavy rain by simply not being spawned; existing ones keep flying
    let presence = 0;
    let annoy = 0;
    for (const m of this.mosquitoes) {
      m.update(dt, env, this.rng);
      if (m.state !== 'dying' && m.state !== 'flee') {
        presence += 0.4;
        if (env.target.outdoors) {
          const d = m.distanceTo(head.x, head.y);
          if (d < MOSQUITO.annoyRadius) annoy += 1 - d / MOSQUITO.annoyRadius;
        }
      }
    }
    this.mosquitoPresenceCache = Math.min(1, presence);
    this.annoyanceCache = annoy;
    if (this.mosquitoes.some((m) => m.removed)) {
      for (const m of this.mosquitoes) {
        if (m.removed) this.bus.emit('mosquitoRemoved', { id: m.id, cause: m.cause ?? 'expired' });
      }
      this.mosquitoes = this.mosquitoes.filter((m) => !m.removed);
    }
    for (const b of this.butterflies) b.update(dt, env, this.rng);
    if (this.butterflies.some((b) => b.removed)) this.butterflies = this.butterflies.filter((b) => !b.removed);
  }

  /** Reactions that depend on the continuous state of nearby entities (individual mosquitoes, butterflies). */
  private perceive(dt: number): void {
    this.perceptionTimer -= dt;
    if (this.perceptionTimer > 0) return;
    this.perceptionTimer = 0.25;
    if (this.brain.isSleeping || !this.isOutdoors) return;
    const m = this.nearestMosquito(MOSQUITO.notifyRadius);
    if (m) this.brain.react('mosquito');
    const b = this.nearestButterfly(230);
    if (b && this.character.needs.irritation < 40 && this.rng.chance(0.25 * (0.4 + this.personality.curiosity))) this.brain.react('butterfly');
  }

  private updateNeeds(dt: number, simDt: number): void {
    const a = this.agent;
    const outdoors = this.isOutdoors;
    const exposedToRain = this.rainOnCarley;
    const run = this.brain.run;
    let effect: ActivityNeedsEffect | null = null;
    if (this.brain.isPerforming && run) effect = run.activity.needsEffect(this, run);
    // calm down faster when no mosquito is bothering her
    if (this.annoyanceCache <= 0) {
      const s = this.effectScratch;
      s.energy = effect?.energy; s.social = effect?.social; s.relax = effect?.relax; s.nature = effect?.nature; s.tummy = effect?.tummy;
      s.boredom = effect?.boredom; s.pain = effect?.pain;
      s.irritation = (effect?.irritation ?? 0) - 7;
      effect = s;
    }
    const env: NeedsEnvironment = {
      zone: outdoors ? 'outdoor' : 'indoor',
      weather: this.weather.type,
      raining: exposedToRain,
      rainAmount: exposedToRain ? this.weather.rain : 0,
      directSun: outdoors ? this.directSun : 0,
      daylight: this.clock.daylight,
      wind: outdoors ? this.weather.windStrength : 0,
      activity: this.character.currentActivity as ActivityType,
      performing: this.brain.isPerforming,
      sleeping: this.brain.isSleeping,
      movement: a.moving,
      effect,
      memoryMood: this.memory.moodContribution(),
      personality: this.personality
    };
    updateNeeds(this.character.needs, env, simDt, GAME_CONFIG.needsSecondsPerHour);
    if (outdoors) applyMosquitoAnnoyance(this.character.needs, this.annoyanceCache, this.personality.insectTolerance, dt);
  }

  // ------------------------------------------------------------------ misc

  /** Total sim seconds => 24h clock label e.g. "14:35". */
  get clockLabel(): string {
    const h = Math.floor(this.clock.hour);
    const m = Math.floor((this.clock.hour - h) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  /** Light helper for tests: run for `seconds` of real time in fixed steps. */
  run(seconds: number, step = 1 / 30): void {
    let t = 0;
    while (t < seconds) {
      this.update(step);
      t += step;
    }
  }

  /** Plant positions (for views). */
  get plantXs(): number[] {
    return PLANT_XS;
  }
}
