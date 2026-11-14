import { approach, clamp } from '../core/math';

const TIERS = 4;

/**
 * Secondary-motion hair: a few spring-damped tiers that lag behind the body (walking, running, jumping,
 * turning) and react to wind. Offsets are in the character's local, facing-relative space.
 */
export class HairModel {
  readonly ox = new Float32Array(TIERS);
  readonly oy = new Float32Array(TIERS);
  private vx = new Float32Array(TIERS);
  private vy = new Float32Array(TIERS);
  private prevBodyVx = 0;
  private prevBodyVy = 0;
  private phase = 0;

  /**
   * @param bodyVx world x velocity of the body (px/s)
   * @param facing +1/-1 (local +x = facing direction)
   * @param wind 0..1
   */
  update(dt: number, bodyVx: number, bodyVy: number, facing: number, wind: number, headRotVel = 0): void {
    this.phase += dt;
    const ax = (bodyVx - this.prevBodyVx) / Math.max(dt, 1e-3);
    const ay = (bodyVy - this.prevBodyVy) / Math.max(dt, 1e-3);
    this.prevBodyVx = bodyVx;
    this.prevBodyVy = bodyVy;
    const localVx = bodyVx * facing;
    for (let i = 0; i < TIERS; i++) {
      const w = (i + 1) / TIERS;
      const breeze = Math.sin(this.phase * (1.6 + i * 0.35) + i * 1.3) * (0.4 + wind * 2.6) * w;
      // hair trails opposite to travel; wind pushes it (wind blows toward +x world)
      const tx = -localVx * 0.045 * w - (ax * facing) * 0.004 * w + breeze + wind * 4 * w * facing + headRotVel * 2 * w;
      const ty = clamp(-bodyVy * 0.03 * w - ay * 0.0016 * w, -9, 9) + Math.sin(this.phase * 2.1 + i) * 0.35 * w;
      const k = 85 - i * 8; // stiffness
      const c = 9.5 - i * 0.6; // damping
      this.vx[i] += ((tx - this.ox[i]) * k - this.vx[i] * c) * dt;
      this.vy[i] += ((ty - this.oy[i]) * k - this.vy[i] * c) * dt;
      this.ox[i] = clamp(this.ox[i] + this.vx[i] * dt, -16, 16);
      this.oy[i] = clamp(this.oy[i] + this.vy[i] * dt, -8, 10);
    }
  }

  /** Small impulse (wind gust, stumble, sudden turn). */
  kick(dx: number, dy = 0): void {
    for (let i = 0; i < TIERS; i++) {
      this.vx[i] += dx * (i + 1) * 0.6;
      this.vy[i] += dy * (i + 1) * 0.4;
    }
  }

  settle(dt: number): void {
    for (let i = 0; i < TIERS; i++) {
      this.ox[i] = approach(this.ox[i], 0, 4, dt);
      this.oy[i] = approach(this.oy[i], 0, 4, dt);
    }
  }
}
