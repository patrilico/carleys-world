import { clamp01 } from '../core/math';
import type { Rng } from '../core/rng';

/** The painting easel: tracks the picture's progress so the canvas visibly fills in. */
export class Easel {
  /** 0..1 how complete the current painting is. */
  progress = 0.55;
  /** continuously increasing stroke clock for animated brush strokes */
  stroke = 0;
  /** Seed for the painting's look (palette + shape layout). */
  seed = 7;

  reset(rng: Rng): void {
    this.progress = 0;
    this.seed = rng.int(1, 9999);
  }

  serialize(): { progress: number; seed: number } {
    return { progress: this.progress, seed: this.seed };
  }

  restore(d: { progress: number; seed: number }): void {
    this.progress = clamp01(d.progress);
    this.seed = d.seed;
  }
}
