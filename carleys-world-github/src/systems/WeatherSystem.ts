import { WEATHER_PATTERN, WEATHER_PROFILES } from '../config/gameConfig';
import type { EventBus } from '../core/EventBus';
import { approach, clamp01 } from '../core/math';
import type { Rng } from '../core/rng';
import type { WeatherType } from '../core/types';

const RAIN_ON = 0.3;
const RAIN_OFF = 0.12;

/** Central weather controller. All values ease toward the target profile so transitions are never instant. */
export class WeatherSystem {
  type: WeatherType = 'sunny';
  sun = 1;
  cloud = 0.12;
  rain = 0;
  wind = 0.12;
  /** Short wind-gust impulse 0..1 (decays quickly). */
  gust = 0;
  raining = false;
  /** Sim seconds until the natural pattern picks a new weather. */
  changeIn = 120;
  /** Smoothing speed (1/sec of sim time). */
  rate = 0.3;
  /** Seconds of faster transition remaining (used for dramatic divine weather). */
  boost = 0;

  constructor(private bus: EventBus, private rng: Rng, initial: WeatherType = 'sunny') {
    this.type = initial;
    const p = WEATHER_PROFILES[initial];
    this.sun = p.sun;
    this.cloud = p.cloud;
    this.rain = p.rain;
    this.wind = p.wind;
    this.raining = this.rain > RAIN_ON;
    this.changeIn = this.rng.range(...WEATHER_PATTERN[initial].duration);
  }

  /** Combined wind strength 0..1 used by all wind-affected visuals. */
  get windStrength(): number {
    return Math.max(this.wind, this.gust);
  }

  /** Switch weather. `hold` is how many sim seconds natural drift is suppressed. */
  setWeather(type: WeatherType, hold?: number, instant = false): void {
    const from = this.type;
    this.type = type;
    this.changeIn = hold ?? this.rng.range(...WEATHER_PATTERN[type].duration);
    if (instant) {
      const p = WEATHER_PROFILES[type];
      this.sun = p.sun;
      this.cloud = p.cloud;
      this.rain = p.rain;
      this.wind = p.wind;
      this.updateRainFlag();
    }
    if (from !== type) this.bus.emit('weatherChanged', { from, to: type });
  }

  triggerGust(strength = 1): void {
    this.gust = Math.max(this.gust, clamp01(strength));
    this.bus.emit('windGust');
  }

  update(simDt: number, natural = true): void {
    const prof = WEATHER_PROFILES[this.type];
    const prevSun = this.sun;
    if (this.boost > 0) this.boost = Math.max(0, this.boost - simDt);
    const baseRate = this.boost > 0 ? 0.9 : this.rate;
    this.sun = approach(this.sun, prof.sun, baseRate, simDt);
    this.cloud = approach(this.cloud, prof.cloud, baseRate, simDt);
    // rain builds a little slower than it stops, which looks natural
    this.rain = approach(this.rain, prof.rain, prof.rain > this.rain ? baseRate * 0.7 : baseRate * 1.2, simDt);
    this.wind = approach(this.wind, prof.wind, baseRate * 0.8, simDt);
    this.gust = Math.max(0, this.gust - simDt * 0.28);

    if (this.type === 'sunny' && prevSun < 0.6 && this.sun >= 0.6) this.bus.emit('sunEmerged');
    this.updateRainFlag();

    if (natural) {
      this.changeIn -= simDt;
      if (this.changeIn <= 0) this.pickNext();
    }
  }

  private updateRainFlag(): void {
    if (!this.raining && this.rain > RAIN_ON) {
      this.raining = true;
      this.bus.emit('rainStarted');
    } else if (this.raining && this.rain < RAIN_OFF) {
      this.raining = false;
      this.bus.emit('rainStopped');
    }
  }

  private pickNext(): void {
    const options = WEATHER_PATTERN[this.type].next;
    const next = this.rng.weighted(options, (o) => o[1])[0];
    if (next === this.type) {
      this.changeIn = this.rng.range(...WEATHER_PATTERN[next].duration);
    } else {
      this.setWeather(next);
    }
  }
}
