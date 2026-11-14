/** Random event tuning. Eligibility logic lives in WorldEventSystem; numbers live here. */
export interface EventTuning {
  weight: number;
  /** Min sim seconds between occurrences. */
  minInterval: number;
  maxConcurrent: number;
}

export const EVENT_TUNING = {
  evaluateEvery: [9, 18] as [number, number], // sim seconds between roll attempts
  mosquitoAppears: { weight: 1.0, minInterval: 85, maxConcurrent: 3 },
  butterflyArrives: { weight: 1.2, minInterval: 60, maxConcurrent: 4 },
  flowerBlooms: { weight: 0.8, minInterval: 70, maxConcurrent: 1 },
  cloudsGather: { weight: 0.55, minInterval: 200, maxConcurrent: 1 },
  lightRain: { weight: 0.4, minInterval: 330, maxConcurrent: 1 },
  sunEmerges: { weight: 0.7, minInterval: 160, maxConcurrent: 1 },
  gardeningInjury: { weight: 0.5, minInterval: 260, maxConcurrent: 1 },
  gentleBreeze: { weight: 0.6, minInterval: 140, maxConcurrent: 1 },
  pleasantDiscovery: { weight: 0.5, minInterval: 200, maxConcurrent: 1 }
};

export const DISCOVERIES = [
  { where: 'outdoor', text: 'A four-leaf clover!' },
  { where: 'outdoor', text: 'A shiny little pebble!' },
  { where: 'outdoor', text: 'A ladybug says hello!' },
  { where: 'indoor', text: 'My old sketchbook!' },
  { where: 'indoor', text: 'A sweet note from Sis!' },
  { where: 'indoor', text: 'Ooh, a pretty button!' }
];
