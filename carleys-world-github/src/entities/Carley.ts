import { GAME_CONFIG } from '../config/gameConfig';
import { FLOOR_Y, SOLIDS, WALL_LEFT_X, WORLD_RIGHT_X, surfaceYAt } from '../config/worldLayout';
import type { FaceParams } from '../config/emotionConfig';
import { clamp } from '../core/math';
import type { ActionId, EmotionType, Posture, PropId, Vec2 } from '../core/types';

/** Abstraction over Carley's physical body so the AI is testable without Phaser. */
export interface CharacterBody {
  x: number;
  /** y of the feet */
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  /** True while pressed against a solid obstacle in the movement direction. */
  blocked: boolean;
  /** Desired horizontal velocity (px/s). The body handles acceleration, gravity and collisions. */
  setVelocityX(vx: number): void;
  hop(vx: number, vy: number): void;
  teleport(x: number, y?: number): void;
  update(dt: number): void;
}

/** Deterministic body used by tests and as a fallback; obeys world bounds and platform heights. */
export class KinematicBody implements CharacterBody {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  onGround = true;
  blocked = false;
  private desired = 0;

  constructor(x = 360) {
    this.x = x;
    this.y = surfaceYAt(x);
  }

  setVelocityX(vx: number): void {
    this.desired = vx;
  }

  hop(): void {
    /* instantaneous in kinematic mode */
  }

  teleport(x: number): void {
    this.x = x;
    this.y = surfaceYAt(x);
    this.vx = 0;
    this.desired = 0;
  }

  update(dt: number): void {
    this.vx = this.desired;
    const nx = clamp(this.x + this.vx * dt, WALL_LEFT_X + 14, WORLD_RIGHT_X);
    this.x = nx;
    this.y = surfaceYAt(nx);
    this.onGround = true;
    this.blocked = false;
  }
}

export interface FaceDirective {
  emotion?: EmotionType;
  override?: Partial<FaceParams>;
  talking?: boolean;
  /** world position (or function) Carley's eyes follow */
  gaze?: Vec2 | (() => Vec2 | null) | null;
  /** keep eyes closed (sleep) */
  eyesClosed?: boolean;
}

export type MoveStyle = 'walk' | 'run';

/**
 * Carley's physical presence: body, posture, held prop, and what the animation layer should currently play.
 * The AI (brain/steps) writes to this; CarleyView reads it.
 */
export class Carley {
  posture: Posture = 'standing';
  prop: PropId = null;
  action: ActionId = 'idle';
  /** Increments whenever a new action starts so the animator restarts its clock. */
  actionSerial = 0;
  face: FaceDirective = {};
  facing: 1 | -1 = 1;
  /** Which way her head points when lying down (-1 = left). */
  lieDir: 1 | -1 = -1;
  moving: 'none' | MoveStyle = 'none';
  stuck = false;
  /** Set by the brain each frame: movement speed multiplier from emotion/pain. */
  speedMultiplier = 1;
  /** 0..1 magical glow used by the healing effect */
  glow = 0;
  /** milk moustache amount 0..1 (fades) */
  stache = 0;
  /** Extra animation parameter, e.g. which mosquito she swats at. */
  actionData: Record<string, number> = {};
  private stuckTimer = 0;
  private lastProgressX = 0;
  /** accumulated distance for footstep sounds */
  stepDistance = 0;
  footstep = false;

  constructor(public body: CharacterBody) {}

  get x(): number {
    return this.body.x;
  }
  get y(): number {
    return this.body.y;
  }

  play(action: ActionId, force = false): void {
    if (action !== this.action || force) {
      this.action = action;
      this.actionSerial++;
    }
  }

  faceToward(x: number): void {
    if (Math.abs(x - this.body.x) > 3) this.facing = x > this.body.x ? 1 : -1;
  }

  stop(): void {
    this.body.setVelocityX(0);
    this.moving = 'none';
  }

  /**
   * Walk/run toward x. Returns true once within `tolerance`. Auto-hops over low obstacles (basket, flowerpot, bed).
   */
  moveToward(x: number, run: boolean, tolerance = 6): boolean {
    const dx = x - this.body.x;
    if (Math.abs(dx) <= tolerance) {
      this.stop();
      return true;
    }
    const dir = dx > 0 ? 1 : -1;
    this.facing = dir;
    const speed = (run ? GAME_CONFIG.physics.runSpeed : GAME_CONFIG.physics.walkSpeed) * this.speedMultiplier;
    // slow down smoothly when arriving
    const arrive = clamp(Math.abs(dx) / 40, 0.35, 1);
    this.body.setVelocityX(dir * speed * (run ? 1 : arrive));
    this.moving = run ? 'run' : 'walk';

    if (this.body.blocked && this.body.onGround) {
      const top = this.obstacleTopAhead(dir);
      if (top !== null && this.body.y - top <= 64) {
        const h = this.body.y - top + 16;
        const vy = Math.sqrt(2 * GAME_CONFIG.physics.gravity * Math.max(h, 24));
        this.body.hop(dir * Math.max(speed, 105), -vy);
      }
    }
    return false;
  }

  private obstacleTopAhead(dir: number): number | null {
    const reach = this.body.x + dir * 20;
    for (const s of SOLIDS) {
      if (reach >= s.x - 2 && reach <= s.x + s.w + 2 && s.hoppable) return s.y;
    }
    return null;
  }

  /** Per-frame update: moves the body, tracks progress/stuck state and footsteps. */
  update(dt: number): void {
    const px = this.body.x;
    this.body.update(dt);
    this.footstep = false;
    if (this.moving !== 'none' && this.body.onGround) {
      this.stepDistance += Math.abs(this.body.x - px);
      const stride = this.moving === 'run' ? 62 : 40;
      if (this.stepDistance >= stride) {
        this.stepDistance = 0;
        this.footstep = true;
      }
    }
    if (this.moving !== 'none') {
      if (Math.abs(this.body.x - this.lastProgressX) > 4) {
        this.lastProgressX = this.body.x;
        this.stuckTimer = 0;
      } else {
        this.stuckTimer += dt;
        if (this.stuckTimer > 4) this.stuck = true;
      }
    } else {
      this.stuckTimer = 0;
      this.lastProgressX = this.body.x;
    }
  }

  clearStuck(): void {
    this.stuck = false;
    this.stuckTimer = 0;
  }

  /** Is Carley standing on the ordinary floor (not on top of furniture)? */
  get onFloor(): boolean {
    return Math.abs(this.body.y - FLOOR_Y) < 2;
  }
}
