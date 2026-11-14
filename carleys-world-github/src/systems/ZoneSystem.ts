import { LOCATIONS, WALL_LEFT_X, WALL_OUTER_X, WORLD_RIGHT_X, ZONE_SPLIT_X, clampToWorld, getLocation, isOnSolid } from '../config/worldLayout';
import type { ActivityLocation, Zone } from '../core/types';

/**
 * Spatial rules for the whole world. Every environmental system asks this class whether an effect applies at
 * a point, so rain/sun/wind/insects consistently respect indoor and outdoor boundaries.
 */
export class ZoneSystem {
  zoneAt(x: number): Zone {
    return x < ZONE_SPLIT_X ? 'indoor' : 'outdoor';
  }

  /** Sheltered = under the cottage roof (rain, direct sun and wind do not reach). */
  isSheltered(x: number): boolean {
    return x < ZONE_SPLIT_X;
  }

  /** Whether falling rain can physically be present at this point. */
  rainReaches(x: number): boolean {
    return x >= WALL_OUTER_X && x <= WORLD_RIGHT_X + 24;
  }

  sunlightReaches(x: number): boolean {
    return x >= ZONE_SPLIT_X;
  }

  windReaches(x: number, windowOpen = false): boolean {
    return x >= ZONE_SPLIT_X || windowOpen;
  }

  /** Insects live outdoors and keep clear of the cottage. */
  insectBounds(): { minX: number; maxX: number } {
    return { minX: WALL_OUTER_X + 36, maxX: WORLD_RIGHT_X };
  }

  inBounds(x: number): boolean {
    return x >= WALL_LEFT_X && x <= WORLD_RIGHT_X;
  }

  getLocation(id: string): ActivityLocation {
    return getLocation(id);
  }

  locationsFor(activity: string): ActivityLocation[] {
    return LOCATIONS.filter((l) => l.supportedActivities.includes(activity));
  }

  /**
   * Is the location reachable and usable right now? Outdoor places are unusable in the rain.
   * (Activities additionally gate on time-of-day etc. in their own isAvailable.)
   */
  isLocationUsable(loc: ActivityLocation, raining: boolean): boolean {
    if (!this.inBounds(loc.x)) return false;
    if (loc.zone === 'outdoor' && raining) return false;
    return true;
  }

  /** Nearest spot a character can legally stand on the floor (used when restoring saves). */
  nearestFloorStandX(x: number): number {
    let nx = clampToWorld(x);
    if (isOnSolid(nx)) nx = nx < 300 ? 222 : nx > 900 ? 960 : nx;
    if (isOnSolid(nx)) nx = 360;
    return nx;
  }
}
