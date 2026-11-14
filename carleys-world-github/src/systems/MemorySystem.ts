import type { CharacterMemory } from '../core/types';

/** Half-life (sim seconds) per memory type; unknown types use the default. */
const HALF_LIFE: Record<string, number> = {
  mosquitoAnnoyed: 150,
  mosquitoRelief: 120,
  gardeningInjury: 260,
  sunEnjoyed: 180,
  healed: 200,
  rainedOn: 200,
  butterflyDelight: 150,
  flowerBloomed: 140,
  startled: 80,
  windy: 90,
  discovery: 150,
  phoneChat: 180,
  paintedSomething: 180
};
const DEFAULT_HALF_LIFE = 140;
const MAX_MEMORIES = 40;

/** Lightweight emotional memory: events fade over time and bias later preferences. */
export class MemorySystem {
  memories: CharacterMemory[] = [];
  private nextId = 1;

  constructor(private now: () => number = () => 0) {}

  setClock(now: () => number): void {
    this.now = now;
  }

  /** Remember something. Repeated events of the same type stack (up to intensity 1). */
  add(eventType: string, emotionalImpact: number, intensity = 0.7, relatedLocation?: string): CharacterMemory {
    const existing = this.memories.find((m) => m.eventType === eventType && m.intensity > 0.15);
    const stackable = existing && this.now() - existing.timestamp < 60;
    if (stackable && existing) {
      existing.intensity = Math.min(1, existing.intensity + intensity * 0.6);
      existing.timestamp = this.now();
      existing.emotionalImpact = (existing.emotionalImpact + emotionalImpact) / 2;
      return existing;
    }
    const mem: CharacterMemory = {
      id: `m${this.nextId++}`,
      eventType,
      timestamp: this.now(),
      emotionalImpact: Math.max(-1, Math.min(1, emotionalImpact)),
      intensity: Math.max(0, Math.min(1, intensity)),
      relatedLocation
    };
    this.memories.push(mem);
    if (this.memories.length > MAX_MEMORIES) {
      this.memories.sort((a, b) => b.intensity - a.intensity);
      this.memories.length = MAX_MEMORIES;
    }
    return mem;
  }

  /** Exponential decay; memories under 3% intensity are forgotten. */
  update(simDt: number): void {
    for (const m of this.memories) {
      const hl = HALF_LIFE[m.eventType] ?? DEFAULT_HALF_LIFE;
      m.intensity *= Math.pow(0.5, simDt / hl);
    }
    this.memories = this.memories.filter((m) => m.intensity >= 0.03);
  }

  /** Summed (signed) intensity of memories of this type. */
  influence(eventType: string): number {
    let total = 0;
    for (const m of this.memories) if (m.eventType === eventType) total += m.intensity;
    return Math.min(1.5, total);
  }

  /** Overall emotional colour of recent memories, tanh-squashed to avoid runaway positives. */
  moodContribution(): number {
    let sum = 0;
    for (const m of this.memories) sum += m.emotionalImpact * m.intensity;
    return 14 * Math.tanh(sum / 14 * 3);
  }

  has(eventType: string, minIntensity = 0.2): boolean {
    return this.memories.some((m) => m.eventType === eventType && m.intensity >= minIntensity);
  }

  recent(limit = 8): CharacterMemory[] {
    return [...this.memories].sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }

  serialize(): CharacterMemory[] {
    return this.memories.map((m) => ({ ...m }));
  }

  restore(list: CharacterMemory[]): void {
    this.memories = list.map((m) => ({ ...m }));
    this.nextId = this.memories.length + 1000;
  }
}
