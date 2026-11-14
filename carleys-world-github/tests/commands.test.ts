import { describe, expect, it } from 'vitest';
import { makeSim, runUntil } from './helpers';
import { meterValue } from '../src/config/meterConfig';
import { computeHappiness } from '../src/systems/EmotionSystem';
import { SaveSystem } from '../src/systems/SaveSystem';

const mem = () => {
  const store = new Map<string, string>();
  return { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
};

describe('meters', () => {
  it('slowly drain when nothing feeds them', () => {
    const sim = makeSim({ startHour: 13 });
    const before = { ...sim.character.needs };
    sim.run(60);
    const n = sim.character.needs;
    expect(n.energy).toBeLessThan(before.energy);
    expect(n.social).toBeLessThan(before.social);
    expect(n.nature).toBeLessThan(before.nature);
    expect(n.tummy).toBeLessThan(before.tummy);
    expect(meterValue(n, 'fun')).toBeLessThan(100 - before.boredom);
  });

  it('happiness is the weighted sum of the meters', () => {
    const sim = makeSim();
    const n = sim.character.needs;
    sim.run(2);
    expect(n.happiness).toBeCloseTo(computeHappiness(n, sim.memory.moodContribution() * 0.5), 5);
    const high = { ...n, energy: 100, boredom: 0, social: 100, comfort: 100, nature: 100, tummy: 100, pain: 0, irritation: 0 };
    const low = { ...high, energy: 5, social: 5 };
    expect(computeHappiness(high)).toBeGreaterThan(95);
    expect(computeHappiness(low)).toBeLessThan(computeHappiness(high) - 30);
  });
});

describe('player commands', () => {
  it('painting fills Fun the longer she paints, and stops when asked', () => {
    const sim = makeSim({ startHour: 14 });
    sim.character.needs.boredom = 80;
    const res = sim.commands.issue('paint');
    expect(res.ok).toBe(true);
    expect(runUntil(sim, () => sim.brain.state === 'PERFORM_ACTIVITY' && sim.character.currentActivity === 'painting', 90)).toBe(true);
    const a = meterValue(sim.character.needs, 'fun');
    sim.run(15);
    const b = meterValue(sim.character.needs, 'fun');
    expect(b).toBeGreaterThan(a + 5);
    expect(sim.commands.issue('paint').ok).toBe(true); // second press = stop
    expect(runUntil(sim, () => sim.character.currentActivity !== 'painting', 30)).toBe(true);
  });

  it('sleep sends her to bed and Rest fills while she sleeps', () => {
    const sim = makeSim({ startHour: 15 });
    sim.character.needs.energy = 30;
    expect(sim.commands.issue('sleep').ok).toBe(true);
    expect(runUntil(sim, () => sim.brain.isSleeping, 90)).toBe(true);
    const a = sim.character.needs.energy;
    sim.run(20);
    expect(sim.character.needs.energy).toBeGreaterThan(a + 5);
    expect(sim.agent.y).toBeLessThan(580); // lying on the bed
    // wakes up on her own when Rest is full
    sim.character.needs.energy = 99.5;
    expect(runUntil(sim, () => !sim.brain.isSleeping && sim.character.currentActivity !== 'sleeping', 60)).toBe(true);
  });

  it('calling her sister fills Social', () => {
    const sim = makeSim({ startHour: 14 });
    sim.character.needs.social = 20;
    expect(sim.commands.issue('call').ok).toBe(true);
    expect(runUntil(sim, () => sim.brain.state === 'PERFORM_ACTIVITY', 90)).toBe(true);
    const a = sim.character.needs.social;
    sim.run(12);
    expect(sim.character.needs.social).toBeGreaterThan(a + 5);
  });

  it('milk fills Tummy', () => {
    const sim = makeSim({ startHour: 14 });
    sim.character.needs.tummy = 10;
    expect(sim.commands.issue('milk').ok).toBe(true);
    sim.run(12);
    expect(sim.character.needs.tummy).toBeGreaterThan(60);
  });

  it('refuses impossible commands with a reason', () => {
    const sim = makeSim({ startHour: 23 });
    expect(sim.commands.issue('garden').ok).toBe(false);
    expect(sim.commands.issue('sunbathe').ok).toBe(false);
    const rainy = makeSim({ startHour: 13 });
    rainy.weather.setWeather('rainy', 99, true);
    rainy.weather.update(0.01, false);
    expect(rainy.commands.blockReason('garden')).toMatch(/rain/i);
    const rested = makeSim({ startHour: 13 });
    rested.character.needs.energy = 100;
    expect(rested.commands.issue('sleep').ok).toBe(false);
  });

  it('changing the command switches activity gracefully', () => {
    const sim = makeSim({ startHour: 14 });
    sim.commands.issue('read');
    expect(runUntil(sim, () => sim.brain.state === 'PERFORM_ACTIVITY' && sim.character.currentActivity === 'reading', 90)).toBe(true);
    sim.commands.issue('paint');
    expect(runUntil(sim, () => sim.character.currentActivity === 'painting' && sim.brain.state === 'PERFORM_ACTIVITY', 90)).toBe(true);
    expect(sim.agent.prop === 'brush' || sim.agent.prop === null).toBe(true);
  });

  it('she only idles when nobody gives orders (autopilot off)', () => {
    const sim = makeSim({ startHour: 14 });
    const seen = new Set<string>();
    sim.bus.on('activityStarted', (e) => seen.add(e.activity));
    sim.run(90);
    expect([...seen]).toEqual(['idle']);
  });

  it('save/load keeps the new meters and the happy streak', () => {
    const store = mem();
    const a = makeSim();
    a.character.needs.nature = 33;
    a.character.needs.tummy = 44;
    a.happyStreak = 1234;
    expect(SaveSystem.save(a, store)).toBe(true);
    const b = makeSim();
    expect(SaveSystem.load(b, store)).toBe(true);
    expect(b.character.needs.nature).toBeCloseTo(33, 3);
    expect(b.character.needs.tummy).toBeCloseTo(44, 3);
    expect(b.happyStreak).toBeCloseTo(1234, 3);
  });
});
