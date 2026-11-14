import { describe, expect, it } from 'vitest';
import { makeSim, runUntil, startActivity } from './helpers';
import { LOCATIONS, ZONE_SPLIT_X } from '../src/config/worldLayout';

describe('Scenario B: rain interruption', () => {
  it('rain while sunbathing makes Carley run indoors; house stays dry', () => {
    const sim = makeSim({ startHour: 13 });
    startActivity(sim, 'sunbathing');
    expect(runUntil(sim, () => sim.brain.state === 'PERFORM_ACTIVITY' && sim.agent.posture === 'lying', 90)).toBe(true);
    expect(sim.agent.x).toBeGreaterThan(ZONE_SPLIT_X);

    sim.weather.setWeather('rainy', 80);
    sim.weather.boost = 6;
    expect(runUntil(sim, () => sim.weather.raining, 30)).toBe(true);
    // she reacts and ends up indoors
    expect(runUntil(sim, () => sim.brain.state === 'REACTING', 10)).toBe(true);
    expect(sim.brain.reaction?.def.id).toBe('rainSurprise');
    expect(runUntil(sim, () => !sim.isOutdoors, 40)).toBe(true);
    // while indoors, rain does not wet her
    sim.run(5);
    expect(sim.rainOnCarley).toBe(false);
    expect(sim.character.currentZone).toBe('indoor');
    // activity was abandoned (not resumed in the rain)
    expect(sim.character.currentActivity).not.toBe('sunbathing');
  });
});

describe('Scenario C: mosquito harassment', () => {
  it('mosquitoes irritate her; she swats; shooing removes them and irritation falls', () => {
    const sim = makeSim({ startHour: 12 });
    startActivity(sim, 'gardening');
    expect(runUntil(sim, () => sim.brain.state === 'PERFORM_ACTIVITY', 90)).toBe(true);
    const before = sim.character.needs.irritation;
    for (let i = 0; i < 3; i++) sim.spawnMosquito(sim.agent.x + 40, sim.agent.y - 90);
    // she notices individual mosquitoes and swats
    expect(runUntil(sim, () => sim.brain.reaction?.def.id === 'mosquito', 12)).toBe(true);
    sim.run(10);
    expect(sim.character.needs.irritation).toBeGreaterThan(before + 5);
    // the player removes the mosquitoes
    for (const m of sim.liveMosquitoes()) m.shoo();
    sim.run(4);
    expect(sim.liveMosquitoes().length).toBe(0);
    const irritationAfterShoo = sim.character.needs.irritation;
    sim.run(30);
    expect(sim.character.needs.irritation).toBeLessThan(irritationAfterShoo);
  });

  it('mosquito proximity causes irritation; no mosquitoes means no harassment', () => {
    const a = makeSim({ startHour: 12 });
    a.agent.body.teleport(900);
    for (let i = 0; i < 3; i++) a.spawnMosquito(900, a.agent.y - 90);
    a.run(8);
    expect(a.character.needs.irritation).toBeGreaterThan(8);

    const b = makeSim({ startHour: 12 });
    b.agent.body.teleport(900);
    b.run(8);
    expect(b.character.needs.irritation).toBeLessThan(5);
  });

  it('mosquitoes avoid entering the cottage', () => {
    const sim = makeSim({ startHour: 12 });
    sim.agent.body.teleport(300); // indoors
    for (let i = 0; i < 4; i++) sim.spawnMosquito(600, 300);
    sim.run(60);
    for (const m of sim.mosquitoes) expect(m.x).toBeGreaterThan(ZONE_SPLIT_X + 10);
    // being indoors, she is not harassed
    expect(sim.character.needs.irritation).toBeLessThan(3);
  });
});

describe('Scenario D: gardening injury and healing', () => {
  it('injury produces hurt reaction and pain; heal removes pain and she recovers', () => {
    const sim = makeSim({ startHour: 12 });
    startActivity(sim, 'gardening');
    expect(runUntil(sim, () => sim.brain.state === 'PERFORM_ACTIVITY', 90)).toBe(true);
    sim.injure('thorn');
    expect(sim.character.needs.pain).toBeGreaterThan(30);
    sim.run(0.5);
    expect(sim.brain.reaction?.def.id).toBe('injury');
    sim.run(2);
    expect(sim.emotion.effective).toBe('hurt');
    expect(sim.agent.action === 'holdHand' || sim.agent.action === 'flinch').toBe(true);

    const res = sim.commands.issue('love');
    expect(res.ok).toBe(true);
    expect(sim.character.needs.pain).toBe(0);
    sim.run(0.5);
    expect(sim.brain.reaction?.def.id).toBe('love');
    // relief and recovery, then the AI resumes control
    expect(runUntil(sim, () => sim.brain.state !== 'REACTING', 20)).toBe(true);
    expect(sim.emotion.effective).not.toBe('hurt');
  });
});

describe('Scenario A/E/F: autonomy', () => {
  it('runs several simulated days without stuck navigation, using all kinds of activities', () => {
    const sim = makeSim({ startHour: 9, noEvents: false, noNaturalWeather: false });
    sim.autopilot = true;
    const seen = new Set<string>();
    sim.bus.on('activityStarted', (e) => seen.add(e.activity));
    const zones = new Set<string>();
    for (let i = 0; i < 30 * 720 * 2; i++) {
      sim.update(1 / 30);
      zones.add(sim.character.currentZone);
    }
    expect(sim.brain.stuckRecoveries).toBe(0);
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(seen.has('sleeping')).toBe(true);
    expect(zones.has('indoor')).toBe(true);
    expect(zones.has('outdoor')).toBe(true);
  });

  it('sleeps at night when energy is low and prefers indoors', () => {
    const sim = makeSim({ startHour: 21.5 });
    sim.autopilot = true;
    sim.character.needs.energy = 18;
    expect(runUntil(sim, () => sim.character.currentActivity === 'sleeping', 120)).toBe(true);
    expect(runUntil(sim, () => sim.brain.isSleeping, 60)).toBe(true);
    expect(sim.isOutdoors).toBe(false);
  });
});

describe('Navigation rules', () => {
  it('never selects activities at unusable locations (rain makes outdoor activities unavailable)', () => {
    const sim = makeSim({ startHour: 13 });
    sim.weather.setWeather('rainy', 999, true);
    sim.weather.update(0.01, false);
    const scores = sim.activities.evaluate(sim);
    const g = scores.find((s) => s.id === 'gardening')!;
    const s = scores.find((s) => s.id === 'sunbathing')!;
    expect(g.available).toBe(false);
    expect(s.available).toBe(false);
    for (let i = 0; i < 50; i++) expect(['gardening', 'sunbathing']).not.toContain(sim.activities.select(sim));
  });

  it('all locations lie within world bounds and she walks to them (no teleport)', () => {
    for (const l of LOCATIONS) expect(l.x).toBeGreaterThan(24);
    const sim = makeSim({ startHour: 13 });
    startActivity(sim, 'sunbathing');
    let lastX = sim.agent.x;
    let maxJump = 0;
    for (let i = 0; i < 30 * 40; i++) {
      sim.update(1 / 30);
      maxJump = Math.max(maxJump, Math.abs(sim.agent.x - lastX));
      lastX = sim.agent.x;
    }
    expect(maxJump).toBeLessThan(12); // one frame of walking, never a teleport
  });
});
