import { meterValue, type MeterKey } from '../config/meterConfig';
import { ACTIVITY_LABEL } from '../config/activityConfig';
import { getLocation } from '../config/worldLayout';
import type { ActivityType } from '../core/types';
import type { Simulation } from '../sim/Simulation';

export interface CommandDef {
  id: string;
  name: string;
  icon: string;
  kind: 'activity' | 'milk' | 'love';
  activity?: ActivityType;
  /** The meter this mainly fills (shown on the button) */
  meter: MeterKey;
  color: number;
  description: string;
}

/** What the player can tell Carley to do. */
export const COMMANDS: CommandDef[] = [
  { id: 'sleep', name: 'Sleep', icon: 'bed', kind: 'activity', activity: 'sleeping', meter: 'rest', color: 0xa8a8ff, description: 'Go to bed. The longer she sleeps, the more her Rest fills.' },
  { id: 'paint', name: 'Paint', icon: 'paint', kind: 'activity', activity: 'painting', meter: 'fun', color: 0xffc94d, description: 'Paint at the easel. The longer she paints, the more Fun she has.' },
  { id: 'read', name: 'Read', icon: 'book', kind: 'activity', activity: 'reading', meter: 'fun', color: 0x8fb4ff, description: 'Curl up with a book: fills Fun and a little Relax.' },
  { id: 'garden', name: 'Garden', icon: 'can', kind: 'activity', activity: 'gardening', meter: 'nature', color: 0x8fd68f, description: 'Water the flowers. Fills her Garden meter (and the plants love it).' },
  { id: 'sunbathe', name: 'Sunbathe', icon: 'sun', kind: 'activity', activity: 'sunbathing', meter: 'relax', color: 0xffd45e, description: 'Lie on the blanket in the sunshine: big Relax boost. Needs sun!' },
  { id: 'call', name: 'Call Sister', icon: 'phone', kind: 'activity', activity: 'phone', meter: 'social', color: 0xff8fb8, description: 'Chat with her sister. Fills Social the longer they talk.' },
  { id: 'milk', name: 'Milk', icon: 'milk', kind: 'milk', meter: 'tummy', color: 0xbfe3ff, description: 'A cold glass of milk: fills her Tummy.' },
  { id: 'love', name: 'Hug', icon: 'heart', kind: 'love', meter: 'social', color: 0xff8fb1, description: 'Show Carley some love: Social and Relax up, aches soothed.' }
];

/** Which meter an activity is "for": a commanded activity ends on its own once that meter is full. */
export const ACTIVITY_GOAL: Partial<Record<ActivityType, MeterKey>> = {
  sleeping: 'rest',
  painting: 'fun',
  reading: 'fun',
  gardening: 'nature',
  sunbathing: 'relax',
  phone: 'social',
  windowWatching: 'relax'
};

export interface CommandResult {
  ok: boolean;
  message: string;
}

/** Turns button presses into behaviour: validates the request, then tells the brain what to do. */
export class CommandSystem {
  constructor(private sim: Simulation) {}

  get(id: string): CommandDef | undefined {
    return COMMANDS.find((c) => c.id === id);
  }

  /** Why the command can't be done right now (null = possible). */
  blockReason(id: string): string | null {
    const def = this.get(id);
    if (!def) return 'Unknown command';
    const sim = this.sim;
    const n = sim.character.needs;
    if (def.kind === 'milk') return sim.brain.isSleeping ? 'Let her sleep!' : null;
    if (def.kind === 'love') return sim.brain.isSleeping ? 'Let her sleep!' : null;
    const act = sim.activities.get(def.activity!);
    switch (def.activity) {
      case 'sleeping':
        if (n.energy >= 95) return "She isn't sleepy at all";
        return null;
      case 'gardening':
        if (sim.weather.rain > 0.1) return "It's raining outside!";
        if (sim.clock.daylight < 0.35) return "It's too dark for gardening";
        if (sim.weather.windStrength > 0.85) return "It's far too windy";
        if (n.pain >= 55) return 'Her hand hurts too much';
        if (n.energy <= 15) return 'She is too tired - let her sleep';
        return null;
      case 'sunbathing':
        if (sim.weather.rain > 0.1) return "It's raining outside!";
        if (sim.directSun < 0.4) return 'There is not enough sunshine';
        if (sim.weather.windStrength > 0.75) return "It's too windy to lie out";
        if (sim.mosquitoNear(getLocation('blanket').x, 220)) return 'Mosquitoes are buzzing by the blanket';
        if (n.pain >= 60) return 'She is in too much pain';
        return null;
      case 'phone':
        if (sim.clock.hour < 8 || sim.clock.hour > 22.3) return 'Her sister is asleep right now';
        return null;
      default:
        if (n.energy <= 8) return 'She is exhausted - let her sleep';
        return act.isAvailable(sim) ? null : 'She cannot do that right now';
    }
  }

  /** Is this command what Carley is currently busy with? */
  isActive(id: string): boolean {
    const def = this.get(id);
    if (!def) return false;
    const b = this.sim.brain;
    if (def.kind === 'milk') return b.reaction?.def.id === 'milk';
    if (def.kind === 'love') return b.reaction?.def.id === 'love';
    return b.run?.activity.id === def.activity && (b.run?.data.commanded === true || this.sim.autopilot);
  }

  /** Current value of the meter the command is aimed at. */
  meterOf(id: string): number {
    const def = this.get(id);
    return def ? meterValue(this.sim.character.needs, def.meter) : 0;
  }

  issue(id: string): CommandResult {
    const def = this.get(id);
    if (!def) return { ok: false, message: 'Unknown command' };
    const sim = this.sim;
    const brain = sim.brain;

    if (def.kind === 'activity' && this.isActive(id)) {
      brain.stopActivity();
      return { ok: true, message: `Okay, enough ${ACTIVITY_LABEL[def.activity!].toLowerCase()}` };
    }
    const block = this.blockReason(id);
    if (block) return { ok: false, message: block };
    if (brain.reaction && def.kind === 'activity') return { ok: false, message: 'She is busy for a moment...' };

    if (def.kind === 'milk') {
      if (brain.reaction?.def.id === 'milk') return { ok: false, message: 'She is already drinking!' };
      brain.react('milk', true);
      if (brain.reaction) brain.reaction.abandon = true; // the old activity stops; she doesn't go back to it
      return { ok: true, message: 'Here is a glass of milk!' };
    }
    if (def.kind === 'love') {
      const n = sim.character.needs;
      n.pain = 0;
      n.irritation = Math.max(0, n.irritation - 15);
      n.social = Math.min(100, n.social + 25);
      n.comfort = Math.min(100, n.comfort + 25);
      sim.memory.add('loved', 0.8, 0.8);
      sim.bus.emit('effect', { kind: 'heal', x: sim.agent.x, y: sim.agent.y - 55 });
      brain.react('love', true);
      if (brain.reaction) brain.reaction.abandon = true;
      return { ok: true, message: 'Carley feels loved!' };
    }
    const ok = brain.command(def.activity!);
    return ok ? { ok: true, message: `${def.name}!` } : { ok: false, message: 'She is busy for a moment...' };
  }
}
