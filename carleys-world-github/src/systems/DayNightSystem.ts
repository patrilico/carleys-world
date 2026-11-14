import { GAME_CONFIG } from '../config/gameConfig';
import { clamp01, lerp, smoothstep } from '../core/math';
import type { TimeOfDayPhase } from '../core/types';

export const SUNRISE = 6.2;
export const SUNSET = 19.6;

/** Continuous simulated clock. Hours are 0..24. Lighting is derived here; it only affects the OUTDOORS. */
export class DayNightSystem {
  hour: number;
  day = 0;
  readonly secondsPerHour: number;

  constructor(startHour: number = GAME_CONFIG.startHour, dayLengthSeconds: number = GAME_CONFIG.dayLengthSeconds) {
    this.hour = startHour;
    this.secondsPerHour = dayLengthSeconds / 24;
  }

  /** Advance by simulated seconds. */
  update(simDt: number): void {
    this.hour += simDt / this.secondsPerHour;
    while (this.hour >= 24) {
      this.hour -= 24;
      this.day++;
    }
  }

  setHour(h: number): void {
    this.hour = ((h % 24) + 24) % 24;
  }

  get normalized(): number {
    return this.hour / 24;
  }

  get phase(): TimeOfDayPhase {
    const h = this.hour;
    if (h >= 21 || h < 5) return 'night';
    if (h < 7) return 'dawn';
    if (h < 12) return 'morning';
    if (h < 17) return 'afternoon';
    return 'evening';
  }

  /** 0 (deep night) .. 1 (full day) - pure time-of-day brightness, ignoring weather. */
  get daylight(): number {
    const h = this.hour;
    const up = smoothstep(SUNRISE - 1.2, SUNRISE + 1.3, h);
    const down = 1 - smoothstep(SUNSET - 1.4, SUNSET + 1.2, h);
    return clamp01(up * down);
  }

  /** Progress of the sun across the sky 0..1 (only meaningful while up). */
  get sunProgress(): number {
    return clamp01((this.hour - SUNRISE) / (SUNSET - SUNRISE));
  }

  get sunUp(): boolean {
    return this.hour > SUNRISE - 0.3 && this.hour < SUNSET + 0.3;
  }

  /** Moon progress 0..1 across the night. */
  get moonProgress(): number {
    const h = this.hour >= SUNSET - 0.5 ? this.hour - (SUNSET - 0.5) : this.hour + 24 - (SUNSET - 0.5);
    return clamp01(h / (24 - (SUNSET - 0.5) + SUNRISE + 0.5));
  }

  /** Warmth of light (0 = neutral white, 1 = deep orange) peaks around sunrise/sunset. */
  get goldenHour(): number {
    const h = this.hour;
    const m = Math.exp(-Math.pow(h - 7.2, 2) / 1.2) + Math.exp(-Math.pow(h - 18.6, 2) / 1.8);
    return clamp01(m);
  }

  /** Outdoor brightness 0..1 given the weather's direct sun amount (0..1). */
  outdoorLight(weatherSun: number): number {
    const d = this.daylight;
    return lerp(0.16, 1, d) * lerp(0.62, 1, clamp01(weatherSun));
  }

  /** Effective direct sunlight (0..1) combining time of day and sun-through-clouds. */
  directSun(weatherSun: number): number {
    return this.daylight * weatherSun;
  }
}
