import type { WeatherType } from '../core/types';

export const GAME_CONFIG = {
  width: 1280,
  height: 720,
  /** Real seconds per simulated 24h day. */
  dayLengthSeconds: 360,
  /** Needs/meters are paced against this fixed length so faster clocks don't make her drain faster. */
  needsSecondsPerHour: 30,
  /** Hour of day a brand new game starts at. */
  startHour: 9.5,
  /** Simulation never advances by more than this per frame (tab switches, hitches). */
  maxStepSeconds: 0.1,
  timeScales: [1, 2, 4, 8, 16],
  autosaveSeconds: 8,
  saveKey: 'carleys-little-world/save',
  settingsKey: 'carleys-little-world/settings',
  saveVersion: 2,
  seed: 20261114,
  physics: { gravity: 1500, walkSpeed: 118, runSpeed: 250, hopVy: 430 },
  limits: { maxMosquitoes: 6, maxButterflies: 8, maxSparkles: 140, maxRaindrops: 170 }
};

export const WEATHER_PROFILES: Record<WeatherType, { sun: number; cloud: number; rain: number; wind: number }> = {
  sunny: { sun: 1, cloud: 0.12, rain: 0, wind: 0.12 },
  cloudy: { sun: 0.32, cloud: 0.85, rain: 0, wind: 0.28 },
  rainy: { sun: 0.08, cloud: 1, rain: 1, wind: 0.32 },
  windy: { sun: 0.7, cloud: 0.4, rain: 0, wind: 1 }
};

/** Natural weather drift: [min,max] sim seconds a weather type lasts, then Markov-like transitions. */
export const WEATHER_PATTERN: Record<WeatherType, { duration: [number, number]; next: [WeatherType, number][] }> = {
  sunny: { duration: [150, 280], next: [['cloudy', 0.5], ['windy', 0.3], ['sunny', 0.2]] },
  cloudy: { duration: [90, 190], next: [['rainy', 0.35], ['sunny', 0.5], ['windy', 0.15]] },
  rainy: { duration: [70, 150], next: [['cloudy', 0.6], ['sunny', 0.4]] },
  windy: { duration: [60, 130], next: [['sunny', 0.5], ['cloudy', 0.5]] }
};
