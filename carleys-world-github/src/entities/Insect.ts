import { FLOOR_Y } from '../config/worldLayout';
import { clamp, dist } from '../core/math';
import type { Rng } from '../core/rng';

export interface InsectEnv {
  /** Where Carley's head is and whether she is outdoors (mosquitoes only chase her there). */
  target: { x: number; y: number; outdoors: boolean };
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  wind: number;
  /** Plant tops for butterflies to visit */
  flowers: { x: number; y: number }[];
}

let nextInsectId = 1;
export const resetInsectIds = (): void => {
  nextInsectId = 1;
};

/**
 * Mosquito - an independent flying entity with its own steering (no gravity). States:
 * wander -> seek -> orbit (buzzing around her head) -> wander; 'flee' when shooed; 'dying' when swatted.
 */
export class Mosquito {
  readonly id = nextInsectId++;
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  state: 'wander' | 'seek' | 'orbit' | 'flee' | 'dying' = 'wander';
  age = 0;
  lifespan: number;
  private stateTime = 0;
  private stateDuration = 3;
  private orbitAngle = 0;
  private orbitRadius = 55;
  private wanderAngle: number;
  removed = false;
  /** Set when removed so the manager can report the cause once. */
  cause: 'swatted' | 'shooed' | 'expired' | null = null;
  /** Fade/spin used by views for dying/fleeing */
  fade = 1;

  constructor(x: number, y: number, rng: Rng, lifespan?: number) {
    this.x = x;
    this.y = y;
    this.lifespan = lifespan ?? rng.range(95, 170);
    this.wanderAngle = rng.range(0, Math.PI * 2);
    this.orbitAngle = rng.range(0, Math.PI * 2);
  }

  distanceTo(px: number, py: number): number {
    return dist(this.x, this.y, px, py);
  }

  swat(): void {
    if (this.state === 'dying') return;
    this.state = 'dying';
    this.stateTime = 0;
    this.cause = 'swatted';
    this.vx *= 0.3;
    this.vy = -30;
  }

  shoo(): void {
    if (this.state === 'dying' || this.state === 'flee') return;
    this.state = 'flee';
    this.stateTime = 0;
    this.cause = 'shooed';
  }

  update(dt: number, env: InsectEnv, rng: Rng): void {
    this.age += dt;
    this.stateTime += dt;
    const t = env.target;

    if (this.state === 'dying') {
      this.vy += 600 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.fade = clamp(1 - this.stateTime / 0.7, 0, 1);
      if (this.stateTime > 0.7 || this.y > FLOOR_Y) this.removed = true;
      return;
    }
    if (this.state === 'flee') {
      // scatter up and away from Carley, accelerating
      const dx = this.x - t.x || 1;
      this.vx += Math.sign(dx) * 420 * dt;
      this.vy -= 260 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.fade = clamp(1 - this.stateTime / 1.5, 0, 1);
      if (this.stateTime > 1.5) this.removed = true;
      return;
    }

    if (this.age > this.lifespan) {
      // fly away when its time is up
      this.state = 'flee';
      this.stateTime = 0;
      this.cause = 'expired';
      return;
    }

    const d = this.distanceTo(t.x, t.y);

    // --- state transitions ---
    if (this.stateTime > this.stateDuration) {
      this.stateTime = 0;
      this.stateDuration = rng.range(2.5, 6);
      if (this.state === 'wander') {
        if (t.outdoors && d < 480 && rng.chance(0.6)) {
          this.state = 'seek';
          this.stateDuration = 12;
        }
      } else if (this.state === 'orbit') {
        this.state = 'wander';
        this.stateDuration = rng.range(2, 5);
      } else if (this.state === 'seek') {
        this.state = 'wander';
      }
    }
    if (this.state === 'seek' && (!t.outdoors || d < 70)) {
      if (t.outdoors) {
        this.state = 'orbit';
        this.stateTime = 0;
        this.stateDuration = rng.range(5, 9);
        this.orbitRadius = rng.range(42, 85);
      } else {
        this.state = 'wander';
        this.stateTime = 0;
      }
    }
    if (this.state === 'orbit' && !t.outdoors) {
      this.state = 'wander';
      this.stateTime = 0;
    }

    // --- steering ---
    let ax = 0;
    let ay = 0;
    this.wanderAngle += (rng.next() - 0.5) * 7 * dt * 4;
    ax += Math.cos(this.wanderAngle) * 140;
    ay += Math.sin(this.wanderAngle) * 140;

    if (this.state === 'seek') {
      const dx = t.x - this.x;
      const dy = t.y - this.y;
      const l = Math.hypot(dx, dy) || 1;
      ax += (dx / l) * 260;
      ay += (dy / l) * 260;
    } else if (this.state === 'orbit') {
      this.orbitAngle += dt * 3.4;
      const gx = t.x + Math.cos(this.orbitAngle) * this.orbitRadius;
      const gy = t.y + Math.sin(this.orbitAngle * 1.3) * this.orbitRadius * 0.6;
      ax += (gx - this.x) * 9;
      ay += (gy - this.y) * 9;
      ax *= 0.8;
      ay *= 0.8;
    } else if (!t.outdoors) {
      // loiter near the garden edge, away from the cottage
      ax += (env.minX + 120 - this.x) * 0.5;
    }

    // keep inside outdoor bounds (never enter the house)
    const margin = 40;
    if (this.x < env.minX + margin) ax += (env.minX + margin - this.x) * 12;
    if (this.x > env.maxX - margin) ax -= (this.x - (env.maxX - margin)) * 12;
    if (this.y < env.minY + margin) ay += (env.minY + margin - this.y) * 12;
    if (this.y > env.maxY - margin) ay -= (this.y - (env.maxY - margin)) * 12;
    ax += env.wind * 90;

    this.vx += ax * dt;
    this.vy += ay * dt;
    const max = this.state === 'seek' ? 150 : this.state === 'orbit' ? 170 : 90;
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > max) {
      this.vx = (this.vx / sp) * max;
      this.vy = (this.vy / sp) * max;
    }
    const drag = Math.exp(-0.9 * dt);
    this.vx *= drag;
    this.vy *= drag;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.x = clamp(this.x, env.minX - 4, env.maxX + 4);
    this.y = clamp(this.y, env.minY, env.maxY);
  }
}

/** Butterfly: gentle, irregular flight; visits flowers; friendly ones also flutter near Carley. */
export class Butterfly {
  readonly id = nextInsectId++;
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  age = 0;
  lifespan: number;
  state: 'wander' | 'toFlower' | 'perched' | 'toCarley' | 'leaving' = 'wander';
  private stateTime = 0;
  private stateDuration = 3;
  private target = { x: 0, y: 0 };
  private phase: number;
  removed = false;
  fade = 1;
  readonly hue: number;
  /** Visited a flower recently - used for bloom/perch visuals. */
  perchedPlant = -1;

  constructor(x: number, y: number, rng: Rng, readonly friendly = false) {
    this.x = x;
    this.y = y;
    this.lifespan = rng.range(80, friendly ? 170 : 130);
    this.phase = rng.range(0, 6.28);
    this.hue = rng.int(0, 4);
  }

  update(dt: number, env: InsectEnv, rng: Rng): void {
    this.age += dt;
    this.stateTime += dt;
    this.phase += dt * 2.3;
    if (this.age > this.lifespan && this.state !== 'leaving') {
      this.state = 'leaving';
      this.stateTime = 0;
    }
    if (this.state === 'leaving') {
      this.vy -= 30 * dt;
      this.vx += 20 * dt;
      this.fade = clamp(1 - this.stateTime / 3, 0, 1);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.stateTime > 3 || this.y < 40) this.removed = true;
      return;
    }

    if (this.stateTime > this.stateDuration) {
      this.stateTime = 0;
      const r = rng.next();
      if (this.state === 'perched' || this.state === 'toCarley' || this.state === 'toFlower') {
        this.state = 'wander';
        this.stateDuration = rng.range(3, 7);
        this.perchedPlant = -1;
      } else if (r < 0.5 && env.flowers.length) {
        const i = rng.int(0, env.flowers.length - 1);
        this.target = env.flowers[i];
        this.perchedPlant = i;
        this.state = 'toFlower';
        this.stateDuration = 14;
      } else if (this.friendly && env.target.outdoors && r < 0.8) {
        this.state = 'toCarley';
        this.stateDuration = rng.range(6, 10);
      } else {
        this.state = 'wander';
        this.stateDuration = rng.range(3, 6);
      }
    }

    let ax = Math.sin(this.phase * 0.7) * 40 + Math.cos(this.phase * 1.9) * 25;
    let ay = Math.cos(this.phase * 0.9) * 35 + Math.sin(this.phase * 1.4) * 25;

    if (this.state === 'toFlower') {
      const dx = this.target.x - this.x;
      const dy = this.target.y - 4 - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 10) {
        this.state = 'perched';
        this.stateTime = 0;
        this.stateDuration = rng.range(4, 8);
        this.vx = 0;
        this.vy = 0;
      } else {
        ax += (dx / d) * 120;
        ay += (dy / d) * 120;
      }
    } else if (this.state === 'perched') {
      this.vx *= 0.8;
      this.vy *= 0.8;
      this.x += (this.target.x - this.x) * 3 * dt;
      this.y += (this.target.y - 4 + Math.sin(this.phase * 2) * 1.5 - this.y) * 3 * dt;
      return;
    } else if (this.state === 'toCarley') {
      const gx = env.target.x + Math.cos(this.phase * 0.8) * 70;
      const gy = env.target.y - 30 + Math.sin(this.phase * 1.1) * 40;
      ax += (gx - this.x) * 2.2;
      ay += (gy - this.y) * 2.2;
    }

    const margin = 40;
    if (this.x < env.minX + margin) ax += (env.minX + margin - this.x) * 8;
    if (this.x > env.maxX - margin) ax -= (this.x - (env.maxX - margin)) * 8;
    if (this.y < env.minY + margin) ay += (env.minY + margin - this.y) * 8;
    if (this.y > env.maxY - margin - 40) ay -= (this.y - (env.maxY - margin - 40)) * 8;
    ax += env.wind * 70;

    this.vx += ax * dt;
    this.vy += ay * dt;
    const sp = Math.hypot(this.vx, this.vy);
    const max = 75;
    if (sp > max) {
      this.vx = (this.vx / sp) * max;
      this.vy = (this.vy / sp) * max;
    }
    const drag = Math.exp(-0.7 * dt);
    this.vx *= drag;
    this.vy *= drag;
    this.x = clamp(this.x + this.vx * dt, env.minX, env.maxX);
    this.y = clamp(this.y + this.vy * dt, env.minY, env.maxY);
  }
}
