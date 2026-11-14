import type { ActivityType, EmotionType, PropId, WeatherType } from './types';

export type SfxId =
  | 'footstep' | 'water' | 'page' | 'surprise' | 'happy' | 'laugh' | 'giggle' | 'sad' | 'irritated' | 'ouch'
  | 'sigh' | 'yawn' | 'heal' | 'magic' | 'sparkle' | 'swat' | 'splash' | 'wind' | 'pop' | 'hum' | 'chirp'
  | 'bloom' | 'gulp' | 'thud' | 'brush' | 'phone';

export interface GameEvents {
  rainStarted: undefined;
  rainStopped: undefined;
  weatherChanged: { from: WeatherType; to: WeatherType };
  mosquitoSpawned: { id: number };
  mosquitoRemoved: { id: number; cause: 'swatted' | 'shooed' | 'expired' };
  butterflySpawned: { id: number };
  plantBloomed: { index: number };
  plantWatered: { index: number };
  injury: { cause: string };
  healed: { hadPain: boolean };
  windGust: undefined;
  playfulDisturbance: { kind: string };
  activityStarted: { activity: ActivityType };
  activityEnded: { activity: ActivityType; reason: string };
  emotionChanged: { from: EmotionType; to: EmotionType };
  thought: { text: string; priority: number; durationMs?: number };
  sfx: { id: SfxId; x?: number; volume?: number };
  effect: { kind: 'sparkles' | 'heal' | 'bloom' | 'puff' | 'gust' | 'splash' | 'notice' | 'poof'; x: number; y: number };
  powerActivated: { id: string; ok: boolean; message?: string };
  propChanged: { prop: PropId };
  sunEmerged: undefined;
  discovery: { what: string };
  sleepStarted: undefined;
  sleepEnded: undefined;
}

type Handler<T> = (payload: T) => void;

/** Minimal strongly-typed event emitter (event-driven communication between systems). */
export class EventBus {
  private handlers = new Map<keyof GameEvents, Set<Handler<never>>>();

  on<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn as Handler<never>);
    return () => this.off(type, fn);
  }

  off<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): void {
    this.handlers.get(type)?.delete(fn as Handler<never>);
  }

  emit<K extends keyof GameEvents>(type: K, ...payload: GameEvents[K] extends undefined ? [] : [GameEvents[K]]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of [...set]) (fn as Handler<GameEvents[K] | undefined>)(payload[0]);
  }

  clear(): void {
    this.handlers.clear();
  }
}
