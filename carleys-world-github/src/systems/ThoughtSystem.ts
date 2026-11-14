import { THOUGHTS } from '../config/thoughtConfig';
import type { Simulation } from '../sim/Simulation';

/**
 * Decides when thought bubbles appear. Reaction thoughts are allowed (rate-limited per key); ambient thoughts are
 * rare and context-sensitive so the screen never fills with text.
 */
export class ThoughtSystem {
  private lastAny = -1e9;
  private lastByKey = new Map<string, number>();
  private ambientTimer = 18;
  now = 0;

  constructor(private sim: Simulation) {}

  /** `keyOrText` is a THOUGHTS key or a literal string. */
  say(keyOrText: string, priority = 3): boolean {
    const phrases = THOUGHTS[keyOrText];
    const text = phrases ? this.sim.rng.pick(phrases) : keyOrText;
    const keyGap = this.now - (this.lastByKey.get(keyOrText) ?? -1e9);
    if (keyGap < 20) return false;
    if (priority < 6 && this.now - this.lastAny < 12) return false;
    if (priority >= 6 && this.now - this.lastAny < 1.2) return false;
    this.lastAny = this.now;
    this.lastByKey.set(keyOrText, this.now);
    this.sim.bus.emit('thought', { text, priority });
    return true;
  }

  update(realDt: number): void {
    this.now += realDt;
    this.ambientTimer -= realDt;
    if (this.ambientTimer > 0) return;
    this.ambientTimer = 24 + this.sim.rng.range(0, 22);
    const sim = this.sim;
    if (sim.brain.state === 'REACTING' || sim.brain.state === 'NAVIGATE_TO_LOCATION') return;
    const n = sim.character.needs;
    const a = sim.character.currentActivity;
    const sleeping = sim.brain.isSleeping;
    if (sleeping) return;
    if (n.energy < 28) this.say('sleepy', 2);
    else if (n.social < 28 && a !== 'phone') this.say('social', 2);
    else if (n.boredom > 72) this.say('bored', 2);
    else if (n.tummy < 25) this.say('hungry', 2);
    else if (n.comfort < 25) this.say('stressed', 2);
    else if (n.nature < 25) this.say('missGarden', 2);
    else if (a === 'sunbathing' && sim.directSun > 0.5) this.say('lovelyDay', 2);
    else if (a === 'gardening') this.say('flowers', 2);
    else if (!sim.isOutdoors && sim.clock.daylight < 0.4 && n.comfort > 55) this.say('cozy', 2);
    else if (sim.isOutdoors && sim.clock.daylight < 0.2) this.say('moon', 2);
    else if (sim.isOutdoors && sim.directSun > 0.6 && sim.emotion.mood.value > 55) this.say('lovelyDay', 2);
  }
}
