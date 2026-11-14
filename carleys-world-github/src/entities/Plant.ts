import { PLANT_XS } from '../config/worldLayout';
import { clamp100 } from '../core/math';
import type { Rng } from '../core/rng';
import type { PlantState, PlantVisualState } from '../core/types';

export type PlantSpecies = 'tulip' | 'daisy' | 'rose' | 'lavender' | 'sunflower' | 'pansy';

const SPECIES: { species: PlantSpecies; color: number }[] = [
  { species: 'tulip', color: 0xff8fb8 },
  { species: 'daisy', color: 0xffffff },
  { species: 'rose', color: 0xff6f91 },
  { species: 'lavender', color: 0xb69cf5 },
  { species: 'sunflower', color: 0xffd24a },
  { species: 'pansy', color: 0x9fb8ff }
];

/** Garden plant: logic only, rendering is in render/PlantView. */
export class Plant {
  state: PlantState;
  readonly species: PlantSpecies;
  readonly color: number;
  /** Pulse (0..1) used by views for bloom / watering sparkle feedback. */
  pulse = 0;

  constructor(readonly index: number, readonly x: number, rng: Rng) {
    const s = SPECIES[index % SPECIES.length];
    this.species = s.species;
    this.color = s.color;
    this.state = {
      growth: rng.range(48, 90),
      moisture: rng.range(38, 70),
      health: rng.range(70, 95),
      flowering: false
    };
    this.state.flowering = this.state.growth >= 65 && this.state.health >= 55;
  }

  get visual(): PlantVisualState {
    const s = this.state;
    if (s.health < 35) return 'wilted';
    if (s.moisture < 22) return 'dry';
    if (s.flowering) return 'blooming';
    if (s.growth < 45) return 'growing';
    return 'healthy';
  }

  /** dt in simulated seconds. `sun` is direct sunlight on the garden 0..1, `rain` 0..1. Returns true if it just bloomed. */
  update(simDt: number, secondsPerHour: number, sun: number, rain: number): boolean {
    const dh = simDt / secondsPerHour;
    const s = this.state;
    let dm = -2.4 - 5.5 * sun;
    if (rain > 0.3) dm += 55 * rain;
    s.moisture = clamp100(s.moisture + dm * dh);

    if (s.moisture < 15) s.health = clamp100(s.health - 5 * dh);
    else if (s.moisture >= 30) s.health = clamp100(s.health + 3 * dh);

    if (s.moisture > 35 && s.health > 40) s.growth = clamp100(s.growth + (1.2 + 1.5 * sun) * dh);

    const wasFlowering = s.flowering;
    if (!s.flowering && s.growth >= 65 && s.health >= 55 && s.moisture >= 25) s.flowering = true;
    if (s.flowering && (s.health < 35 || s.moisture < 8)) s.flowering = false;

    if (this.pulse > 0) this.pulse = Math.max(0, this.pulse - simDt * 0.7);
    return !wasFlowering && s.flowering;
  }

  water(amount = 22): void {
    this.state.moisture = clamp100(this.state.moisture + amount);
    this.pulse = Math.max(this.pulse, 0.5);
  }

  /** Divine growth: health, growth and moisture boost; guarantees a bloom. */
  magicGrow(): boolean {
    const was = this.state.flowering;
    this.state.health = clamp100(this.state.health + 35);
    this.state.growth = clamp100(this.state.growth + 28);
    this.state.moisture = clamp100(this.state.moisture + 25);
    this.state.flowering = true;
    this.pulse = 1;
    return !was;
  }

  /** Spontaneous bloom event (no divine power). */
  triggerBloom(): void {
    this.state.growth = Math.max(this.state.growth, 68);
    this.state.health = Math.max(this.state.health, 60);
    this.state.moisture = Math.max(this.state.moisture, 30);
    this.state.flowering = true;
    this.pulse = 1;
  }
}

export function createPlants(rng: Rng): Plant[] {
  return PLANT_XS.map((x, i) => new Plant(i, x, rng));
}
