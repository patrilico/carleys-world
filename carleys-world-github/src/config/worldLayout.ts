import type { ActivityLocation } from '../core/types';

/** Fixed single-screen world, all coordinates in world pixels (1280 x 720). */
export const WORLD_W = 1280;
export const WORLD_H = 720;
export const FLOOR_Y = 600;

/** x where the cottage's doorway sits. Indoor = left of the split (~40% of width). */
export const ZONE_SPLIT_X = 512;
export const WALL_LEFT_X = 24;
export const WALL_OUTER_X = 524;
export const DOOR_TOP_Y = 448;
export const WORLD_RIGHT_X = WORLD_W - 24;

export interface SolidBox {
  id: string;
  x: number; // left
  y: number; // top
  w: number;
  h: number;
  /** Low solids can be hopped over; high ones are walls. */
  hoppable: boolean;
  /** Standable on top (platform) */
  platform: boolean;
}

export const BED = { x: 30, w: 160, topY: 556 };
export const BASKET = { x: 298, w: 28, topY: 574 };
export const GARDEN_POT = { x: 914, w: 34, topY: 566 };
export const PLANT_XS = [628, 678, 728, 778, 828, 878];

export const SOLIDS: SolidBox[] = [
  { id: 'bed', x: BED.x, y: BED.topY, w: BED.w, h: FLOOR_Y - BED.topY, hoppable: true, platform: true },
  { id: 'lintel', x: ZONE_SPLIT_X - 14, y: 0, w: 28, h: DOOR_TOP_Y, hoppable: false, platform: false }
];

/** Height (y of the walkable surface) at world x. Used by headless movement and bed hopping. */
export function surfaceYAt(x: number): number {
  for (const s of SOLIDS) {
    if (s.platform && x >= s.x && x <= s.x + s.w) return s.y;
  }
  return FLOOR_Y;
}

export function clampToWorld(x: number): number {
  return Math.min(WORLD_RIGHT_X, Math.max(WALL_LEFT_X + 14, x));
}

/** True if x sits on top of a solid (bed/basket/pot) - used to restore saved positions safely. */
export function isOnSolid(x: number): boolean {
  return surfaceYAt(x) !== FLOOR_Y;
}

export const LOCATIONS: ActivityLocation[] = [
  { id: 'bed', zone: 'indoor', x: 122, y: BED.topY, interactionRadius: 30, supportedActivities: ['sleeping'] },
  { id: 'bedside', zone: 'indoor', x: 222, y: FLOOR_Y, interactionRadius: 18, supportedActivities: ['sleeping'] },
  { id: 'windowTable', zone: 'indoor', x: 262, y: FLOOR_Y, interactionRadius: 24, supportedActivities: ['phone', 'windowWatching'] },
  { id: 'readingChair', zone: 'indoor', x: 366, y: FLOOR_Y, interactionRadius: 24, supportedActivities: ['reading'] },
  { id: 'easel', zone: 'indoor', x: 408, y: FLOOR_Y, interactionRadius: 20, supportedActivities: ['painting'] },
  { id: 'shelter', zone: 'indoor', x: 452, y: FLOOR_Y, interactionRadius: 40, supportedActivities: ['idle'] },
  { id: 'wateringCan', zone: 'outdoor', x: 574, y: FLOOR_Y, interactionRadius: 20, supportedActivities: ['gardening'] },
  { id: 'flowerbed', zone: 'outdoor', x: 750, y: FLOOR_Y, interactionRadius: 130, supportedActivities: ['gardening'] },
  { id: 'blanket', zone: 'outdoor', x: 1030, y: FLOOR_Y, interactionRadius: 50, supportedActivities: ['sunbathing'] },
  { id: 'tree', zone: 'outdoor', x: 1150, y: FLOOR_Y, interactionRadius: 60, supportedActivities: ['idle'] }
];

export function getLocation(id: string): ActivityLocation {
  const l = LOCATIONS.find((x) => x.id === id);
  if (!l) throw new Error(`Unknown location ${id}`);
  return l;
}

/** Interior lamp positions (warm lighting that stays on after sunset). */
export const LAMPS = [
  { x: 140, y: 360 },
  { x: 484, y: 360 }
];

/** Window on the back wall of the cottage. */
export const WINDOW_RECT = { x: 222, y: 290, w: 112, h: 118 };
