import { MOOD_HYSTERESIS, MOOD_SMOOTHING_PER_SEC, MOOD_THRESHOLDS } from '../config/characterConfig';
import { LOW_METER, METERS, meterValue } from '../config/meterConfig';
import { EMOTION_MIN_DWELL } from '../config/emotionConfig';
import type { EventBus } from '../core/EventBus';
import { approach, clamp, clamp100 } from '../core/math';
import type { ActivityType, CharacterNeeds, EmotionType, MoodLabel } from '../core/types';

/**
 * Happiness is the weighted SUM of Carley's meters (rest, fun, social, relax, garden, tummy). Pain and irritation
 * subtract from it, and a badly neglected meter hurts extra so one empty meter cannot be hidden by full ones.
 */
export function computeHappiness(needs: CharacterNeeds, memoryBonus = 0): number {
  let sum = 0;
  let neglect = 0;
  for (const m of METERS) {
    const v = meterValue(needs, m.key);
    sum += m.weight * v;
    if (v < LOW_METER) neglect += (LOW_METER - v) * 0.35;
  }
  sum -= neglect;
  sum -= 0.3 * Math.max(0, needs.pain - 10);
  sum -= 0.25 * Math.max(0, needs.irritation - 25);
  sum += memoryBonus;
  return clamp100(sum);
}

export const computeMoodScore = computeHappiness;

export function labelForScore(score: number): MoodLabel {
  let label: MoodLabel = MOOD_THRESHOLDS[0][0];
  for (const [l, min] of MOOD_THRESHOLDS) if (score >= min) label = l;
  return label;
}

/** Smoothed mood meter with hysteresis on the visible label. */
export class MoodTracker {
  value: number;
  label: MoodLabel;
  private idx: number;

  constructor(initial = 60) {
    this.value = initial;
    this.idx = MOOD_THRESHOLDS.findIndex(([l]) => l === labelForScore(initial));
    this.label = MOOD_THRESHOLDS[this.idx][0];
  }

  update(target: number, realDt: number): void {
    this.value = approach(this.value, target, MOOD_SMOOTHING_PER_SEC, realDt);
    // move up/down only when clearly past a threshold (hysteresis)
    for (let guard = 0; guard < 6; guard++) {
      const up = MOOD_THRESHOLDS[this.idx + 1];
      const cur = MOOD_THRESHOLDS[this.idx];
      if (up && this.value >= up[1] + MOOD_HYSTERESIS) this.idx++;
      else if (this.idx > 0 && this.value < cur[1] - MOOD_HYSTERESIS) this.idx--;
      else break;
    }
    this.label = MOOD_THRESHOLDS[this.idx][0];
  }

  snap(value: number): void {
    this.value = value;
    this.idx = MOOD_THRESHOLDS.findIndex(([l]) => l === labelForScore(value));
    this.label = MOOD_THRESHOLDS[this.idx][0];
  }
}

interface Transient {
  emotion: EmotionType;
  intensity: number;
  remaining: number;
}

/**
 * Derives Carley's current emotion from her needs/mood/activity, with anti-flicker dwell time, and lets
 * short reaction sequences temporarily override it.
 */
export class EmotionSystem {
  current: EmotionType = 'neutral';
  intensity = 0.5;
  private dwell = 0;
  private pending: EmotionType | null = null;
  private pendingTime = 0;
  private transient: Transient | null = null;
  readonly mood = new MoodTracker();
  /** 0..1: pure bliss (e.g. after a glass of milk) lifts the mood meter to the maximum, then fades. */
  bliss = 0;

  constructor(private bus: EventBus) {}

  /** Temporarily force an emotion (reaction sequences, thoughts, powers). */
  trigger(emotion: EmotionType, intensity = 0.8, seconds = 2): void {
    this.transient = { emotion, intensity, remaining: seconds };
    this.setCurrent(emotion, intensity);
  }

  clearTransient(): void {
    this.transient = null;
  }

  /** The emotion currently shown, accounting for transient override. */
  get effective(): EmotionType {
    return this.transient ? this.transient.emotion : this.current;
  }

  deriveEmotion(needs: CharacterNeeds, activity: ActivityType, performing: boolean): { emotion: EmotionType; intensity: number } {
    const mood = this.mood.value;
    if (needs.pain >= 35) return { emotion: 'hurt', intensity: clamp(0.35 + needs.pain / 120, 0, 1) };
    if (needs.irritation >= 72) return { emotion: 'angry', intensity: clamp(needs.irritation / 100, 0, 1) };
    if (needs.irritation >= 38) return { emotion: 'irritated', intensity: clamp(needs.irritation / 90, 0, 1) };
    if (activity === 'sleeping' && performing) return { emotion: 'relaxed', intensity: 0.8 };
    if (needs.energy <= 22) return { emotion: 'tired', intensity: clamp(1 - needs.energy / 30, 0.3, 1) };
    if (mood <= 28) return { emotion: 'sad', intensity: clamp((40 - mood) / 30, 0.3, 1) };
    if (activity === 'sunbathing' && performing && mood > 55) return { emotion: 'relaxed', intensity: 0.8 };
    if (mood >= 82) return { emotion: 'delighted', intensity: clamp((mood - 70) / 30, 0.4, 1) };
    if (mood >= 66) return { emotion: 'happy', intensity: clamp((mood - 50) / 40, 0.4, 1) };
    return { emotion: 'neutral', intensity: 0.5 };
  }

  update(realDt: number, needs: CharacterNeeds, activity: ActivityType, performing: boolean, memoryBonus: number): void {
    let score = computeMoodScore(needs, memoryBonus);
    if (this.bliss > 0) {
      score += (100 - score) * this.bliss;
      this.bliss = Math.max(0, this.bliss - realDt / 60);
    }
    this.mood.update(score, realDt);

    if (this.transient) {
      this.transient.remaining -= realDt;
      if (this.transient.remaining <= 0) this.transient = null;
    }

    this.dwell += realDt;
    const cand = this.deriveEmotion(needs, activity, performing);
    if (cand.emotion === this.current) {
      this.intensity = approach(this.intensity, cand.intensity, 1.5, realDt);
      this.pending = null;
      return;
    }
    // escalate immediately for strong negatives; otherwise require stability + dwell
    const urgent = cand.emotion === 'hurt' || cand.emotion === 'angry';
    if (this.pending !== cand.emotion) {
      this.pending = cand.emotion;
      this.pendingTime = 0;
    }
    this.pendingTime += realDt;
    if (urgent || (this.pendingTime > 1.2 && this.dwell >= EMOTION_MIN_DWELL)) {
      this.setCurrent(cand.emotion, cand.intensity);
    }
  }

  private setCurrent(emotion: EmotionType, intensity: number): void {
    if (emotion !== this.current) {
      const from = this.current;
      this.current = emotion;
      this.bus.emit('emotionChanged', { from, to: emotion });
    }
    this.intensity = intensity;
    this.dwell = 0;
    this.pending = null;
  }
}
