import { GAME_CONFIG } from '../config/gameConfig';
import { clamp, clamp100 } from '../core/math';
import type { CharacterMemory, WeatherType } from '../core/types';
import type { Simulation } from '../sim/Simulation';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SaveData {
  version: number;
  savedAt: number;
  time: number;
  hour: number;
  day: number;
  weather: { type: WeatherType; changeIn: number; sun: number; cloud: number; rain: number; wind: number };
  plants: { growth: number; moisture: number; health: number; flowering: boolean }[];
  character: {
    needs: Record<string, number>;
    x: number;
    mood: number;
    memories: CharacterMemory[];
  };
  eventCooldowns: [string, number][];
  activityCooldowns: [string, number][];
  easel: { progress: number; seed: number };
  rng: number;
  streak?: { current: number; best: number };
}

export interface Settings {
  master: number;
  ambience: number;
  sfx: number;
  voice: number;
  music: number;
  muted: boolean;
}

export const DEFAULT_SETTINGS: Settings = { master: 0.8, ambience: 0.6, sfx: 0.8, voice: 0.8, music: 0.5, muted: false };

const NEED_KEYS = ['happiness', 'energy', 'comfort', 'social', 'irritation', 'pain', 'boredom', 'nature', 'tummy'];
const WEATHERS: WeatherType[] = ['sunny', 'cloudy', 'rainy', 'windy'];

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Persists the simulation to localStorage with validation so a corrupt/old save can never crash the game. */
export const SaveSystem = {
  serialize(sim: Simulation): SaveData {
    const w = sim.weather;
    return {
      version: GAME_CONFIG.saveVersion,
      savedAt: Date.now(),
      time: sim.time,
      hour: sim.clock.hour,
      day: sim.clock.day,
      weather: { type: w.type, changeIn: w.changeIn, sun: w.sun, cloud: w.cloud, rain: w.rain, wind: w.wind },
      plants: sim.plants.map((p) => ({ ...p.state })),
      character: {
        needs: { ...sim.character.needs },
        x: sim.agent.x,
        mood: sim.emotion.mood.value,
        memories: sim.memory.serialize()
      },
      eventCooldowns: sim.events.serialize(),
      activityCooldowns: sim.activities.serialize().lastEnded,
      easel: sim.easel.serialize(),
      rng: sim.rng.state,
      streak: { current: sim.happyStreak, best: sim.bestStreak }
    };
  },

  validate(d: unknown): d is SaveData {
    const s = d as SaveData;
    if (!s || typeof s !== 'object' || s.version !== GAME_CONFIG.saveVersion) return false;
    if (!isNum(s.time) || !isNum(s.hour) || !isNum(s.day) || s.hour < 0 || s.hour >= 24) return false;
    if (!s.weather || !WEATHERS.includes(s.weather.type)) return false;
    if (![s.weather.changeIn, s.weather.sun, s.weather.cloud, s.weather.rain, s.weather.wind].every(isNum)) return false;
    if (!Array.isArray(s.plants) || s.plants.length === 0) return false;
    for (const p of s.plants) if (!isNum(p.growth) || !isNum(p.moisture) || !isNum(p.health) || typeof p.flowering !== 'boolean') return false;
    const c = s.character;
    if (!c || !isNum(c.x) || !isNum(c.mood) || !c.needs) return false;
    for (const k of NEED_KEYS) if (!isNum(c.needs[k])) return false;
    if (!Array.isArray(c.memories)) return false;
    for (const m of c.memories) if (typeof m.eventType !== 'string' || !isNum(m.intensity) || !isNum(m.emotionalImpact) || !isNum(m.timestamp)) return false;
    return true;
  },

  save(sim: Simulation, storage: StorageLike | null = defaultStorage()): boolean {
    if (!storage) return false;
    try {
      storage.setItem(GAME_CONFIG.saveKey, JSON.stringify(SaveSystem.serialize(sim)));
      return true;
    } catch (err) {
      console.warn('Save failed', err);
      return false;
    }
  },

  hasSave(storage: StorageLike | null = defaultStorage()): boolean {
    return !!storage?.getItem(GAME_CONFIG.saveKey);
  },

  /**
   * Restore state into a fresh simulation. Carley is placed idle at the saved location (on the floor, never inside
   * furniture) and the AI picks her next activity.
   */
  load(sim: Simulation, storage: StorageLike | null = defaultStorage()): boolean {
    if (!storage) return false;
    let data: unknown;
    try {
      const raw = storage.getItem(GAME_CONFIG.saveKey);
      if (!raw) return false;
      data = JSON.parse(raw);
    } catch {
      return false;
    }
    if (!SaveSystem.validate(data)) return false;
    SaveSystem.apply(sim, data);
    return true;
  },

  apply(sim: Simulation, d: SaveData): void {
    sim.time = d.time;
    sim.clock.hour = clamp(d.hour, 0, 23.999);
    sim.clock.day = Math.max(0, Math.floor(d.day));
    const w = sim.weather;
    w.type = d.weather.type;
    w.changeIn = d.weather.changeIn;
    w.sun = clamp(d.weather.sun, 0, 1);
    w.cloud = clamp(d.weather.cloud, 0, 1);
    w.rain = clamp(d.weather.rain, 0, 1);
    w.wind = clamp(d.weather.wind, 0, 1);
    w.raining = w.rain > 0.3;
    w.gust = 0;
    sim.plants.forEach((p, i) => {
      const s = d.plants[i];
      if (!s) return;
      p.state.growth = clamp100(s.growth);
      p.state.moisture = clamp100(s.moisture);
      p.state.health = clamp100(s.health);
      p.state.flowering = s.flowering;
    });
    const n = sim.character.needs;
    for (const k of NEED_KEYS) (n as unknown as Record<string, number>)[k] = clamp100(d.character.needs[k]);
    sim.emotion.mood.snap(clamp100(d.character.mood));
    sim.memory.restore(d.character.memories.filter((m) => m.intensity > 0.02));
    sim.events.restore(d.eventCooldowns, sim.time);
    sim.activities.restore({ lastEnded: d.activityCooldowns }, sim.time);
    if (d.easel) sim.easel.restore(d.easel);
    sim.rng.state = d.rng;
    sim.happyStreak = d.streak?.current ?? 0;
    sim.bestStreak = d.streak?.best ?? 0;
    // never resume mid-animation: stand idle at a valid floor position
    const x = sim.zones.nearestFloorStandX(d.character.x);
    sim.agent.body.teleport(x);
    sim.brain.resetToIdle();
    sim.mosquitoes = [];
    sim.butterflies = [];
  },

  clear(storage: StorageLike | null = defaultStorage()): void {
    try {
      storage?.removeItem(GAME_CONFIG.saveKey);
    } catch {
      /* ignore */
    }
  },

  loadSettings(storage: StorageLike | null = defaultStorage()): Settings {
    try {
      const raw = storage?.getItem(GAME_CONFIG.settingsKey);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const s = JSON.parse(raw) as Partial<Settings>;
      const v = (x: unknown, def: number): number => (isNum(x) ? clamp(x, 0, 1) : def);
      return {
        master: v(s.master, DEFAULT_SETTINGS.master),
        ambience: v(s.ambience, DEFAULT_SETTINGS.ambience),
        sfx: v(s.sfx, DEFAULT_SETTINGS.sfx),
        voice: v(s.voice, DEFAULT_SETTINGS.voice),
        music: v(s.music, DEFAULT_SETTINGS.music),
        muted: typeof s.muted === 'boolean' ? s.muted : false
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  },

  saveSettings(s: Settings, storage: StorageLike | null = defaultStorage()): void {
    try {
      storage?.setItem(GAME_CONFIG.settingsKey, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }
};
