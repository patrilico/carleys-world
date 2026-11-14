// Shared domain types. Kept free of Phaser so the whole simulation can run headless (tests).

export type Zone = 'indoor' | 'outdoor';

export type ActivityType =
  | 'idle'
  | 'gardening'
  | 'sunbathing'
  | 'reading'
  | 'phone'
  | 'painting'
  | 'sleeping'
  | 'windowWatching';

export type EmotionType =
  | 'neutral'
  | 'happy'
  | 'delighted'
  | 'sad'
  | 'irritated'
  | 'angry'
  | 'hurt'
  | 'tired'
  | 'curious'
  | 'relaxed'
  | 'surprised';

export type WeatherType = 'sunny' | 'cloudy' | 'rainy' | 'windy';

export type MoodLabel = 'Miserable' | 'Sad' | 'Okay' | 'Content' | 'Happy' | 'Delighted';

export type TimeOfDayPhase = 'night' | 'dawn' | 'morning' | 'afternoon' | 'evening';

/** All values are normalised 0..100. Higher social = more fulfilled; higher pain = more discomfort. */
export interface CharacterNeeds {
  happiness: number;
  energy: number;
  comfort: number;
  social: number;
  irritation: number;
  pain: number;
  boredom: number;
  /** garden / fresh-air fulfilment (higher = better) */
  nature: number;
  /** fullness (higher = better fed) */
  tummy: number;
}

export interface CharacterMemory {
  id: string;
  eventType: string;
  timestamp: number;
  /** -1 (very unpleasant) .. +1 (very pleasant) */
  emotionalImpact: number;
  /** 0..1, decays over time */
  intensity: number;
  relatedLocation?: string;
}

export type Posture = 'standing' | 'sitting' | 'lying' | 'kneeling';

export type BrainState =
  | 'SELECT_ACTIVITY'
  | 'NAVIGATE_TO_LOCATION'
  | 'PREPARE_ACTIVITY'
  | 'PERFORM_ACTIVITY'
  | 'COMPLETE_ACTIVITY'
  | 'PLAY_TRANSITION'
  | 'REACTING';

export interface CharacterState {
  needs: CharacterNeeds;
  currentEmotion: EmotionType;
  currentActivity: ActivityType;
  currentZone: Zone;
  currentLocationId?: string;
  activityElapsed: number;
  recentMemories: CharacterMemory[];
}

export interface PersonalityProfile {
  gardeningAffinity: number;
  sunbathingAffinity: number;
  readingAffinity: number;
  paintingAffinity: number;
  socialAffinity: number;
  insectTolerance: number;
  rainTolerance: number;
  curiosity: number;
  playfulness: number;
}

export interface PlantState {
  growth: number;
  moisture: number;
  health: number;
  flowering: boolean;
}

export type PlantVisualState = 'growing' | 'healthy' | 'blooming' | 'dry' | 'wilted';

export interface ActivityLocation {
  id: string;
  zone: Zone;
  x: number;
  y: number;
  interactionRadius: number;
  supportedActivities: string[];
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface PowerTarget {
  x: number;
  y: number;
  entityId?: string;
}

export type PropId = 'wateringCan' | 'phone' | 'book' | 'brush' | 'milk' | null;

/** Everything the animation layer can be asked to play. */
export type ActionId =
  // movement
  | 'idle' | 'stand' | 'walk' | 'run' | 'sadWalk' | 'cautiousWalk' | 'turn'
  | 'sitDown' | 'sitIdle' | 'standUp' | 'lieDown' | 'lieIdle' | 'getUp' | 'sitUp' | 'sitStretch'
  | 'jump' | 'hop' | 'stumble' | 'recoverBalance' | 'land'
  // positive
  | 'smile' | 'laugh' | 'excitedBounce' | 'celebrateJump' | 'contentClose' | 'dance'
  | 'headTilt' | 'wave' | 'tinyDance' | 'hum' | 'smileToSelf' | 'relief'
  // negative
  | 'frown' | 'cry' | 'stomp' | 'crossArms' | 'swat' | 'swatHard' | 'flinch' | 'holdHand'
  | 'startledJump' | 'sigh' | 'shakeOff' | 'wipeBrow'
  // attention
  | 'lookAround' | 'lookUp' | 'watchSky' | 'surprised' | 'examine' | 'point' | 'hairAdjust'
  // activities
  | 'pickUp' | 'putAway' | 'water' | 'kneel' | 'kneelUp' | 'inspectFlower'
  | 'sunRelax' | 'sunAdjust' | 'stretch' | 'yawn'
  | 'read' | 'turnPage' | 'readSurprised'
  | 'phoneRetrieve' | 'phoneTalk' | 'phoneLaugh' | 'phoneEnd'
  | 'paint' | 'paintInspect' | 'paintAdmire' | 'paintFrustrated'
  | 'sleep' | 'wakeStretch' | 'windowWatch' | 'healed' | 'comfort' | 'takeGlass' | 'drinkMilk';

export type FaceHint = EmotionType;
