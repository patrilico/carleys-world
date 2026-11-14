import { ACTIVITY_LABEL } from '../config/activityConfig';
import { ACTIONS } from '../systems/AnimationController';
import type { WorldEventId } from '../systems/WorldEventSystem';
import type { ActionId, EmotionType, Posture, PropId, WeatherType } from '../core/types';
import type { Simulation } from '../sim/Simulation';

const EMOTIONS: EmotionType[] = ['neutral', 'happy', 'delighted', 'sad', 'irritated', 'angry', 'hurt', 'tired', 'curious', 'relaxed', 'surprised'];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
};

/**
 * Hidden-by-default (F3 / `) developer panel: needs, AI state, utility scores, memories, weather, events, and
 * controls for speeding up time, forcing events and previewing any animation.
 */
export class DebugPanel {
  private root: HTMLElement;
  private readouts: HTMLElement;
  private visible = false;
  private timer = 0;
  private hourSlider!: HTMLInputElement;
  private speedBtns: HTMLButtonElement[] = [];
  private freezeBtn!: HTMLButtonElement;

  constructor(private sim: Simulation, private onToggle?: (v: boolean) => void) {
    this.root = document.getElementById('debug')!;
    this.root.innerHTML = '';
    this.root.appendChild(el('h2', {}, "Carley's World debug panel"));
    this.root.appendChild(this.buildControls());
    this.readouts = el('div');
    this.root.appendChild(this.readouts);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F3' || e.key === '`') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  toggle(force?: boolean): void {
    this.visible = force ?? !this.visible;
    this.root.style.display = this.visible ? 'block' : 'none';
    this.onToggle?.(this.visible);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  private btn(label: string, fn: () => void, cls = ''): HTMLButtonElement {
    const b = el('button', cls ? { class: cls } : {}, label);
    b.addEventListener('click', fn);
    return b;
  }

  private select(options: string[], value = ''): HTMLSelectElement {
    const s = el('select');
    for (const o of options) s.appendChild(el('option', { value: o }, o));
    if (value) s.value = value;
    return s;
  }

  private buildControls(): HTMLElement {
    const sim = this.sim;
    const box = el('div');

    box.appendChild(el('h3', {}, 'Time'));
    const speeds = el('div');
    for (const s of [1, 2, 4, 8, 16]) {
      const b = this.btn(`${s}x`, () => {
        sim.timeScale = s;
      });
      this.speedBtns.push(b);
      speeds.appendChild(b);
    }
    speeds.appendChild(this.btn('Pause', () => (sim.paused = !sim.paused)));
    this.freezeBtn = this.btn('Freeze AI', () => {
      sim.aiFrozen = !sim.aiFrozen;
    });
    speeds.appendChild(this.freezeBtn);
    box.appendChild(speeds);
    const hourRow = el('div');
    hourRow.appendChild(el('span', {}, 'Hour '));
    this.hourSlider = el('input', { type: 'range', min: '0', max: '24', step: '0.25', value: String(sim.clock.hour) });
    this.hourSlider.addEventListener('input', () => sim.clock.setHour(parseFloat(this.hourSlider.value)));
    hourRow.appendChild(this.hourSlider);
    box.appendChild(hourRow);

    box.appendChild(el('h3', {}, 'Weather'));
    const wb = el('div');
    for (const w of ['sunny', 'cloudy', 'rainy', 'windy'] as WeatherType[]) wb.appendChild(this.btn(w, () => sim.weather.setWeather(w, 150)));
    wb.appendChild(this.btn('gust', () => sim.weather.triggerGust(1)));
    box.appendChild(wb);

    box.appendChild(el('h3', {}, 'Force events'));
    const eb = el('div');
    const sel = this.select(sim.events.ids);
    eb.appendChild(sel);
    eb.appendChild(this.btn('Fire', () => sim.events.force(sel.value as WorldEventId)));
    eb.appendChild(this.btn('Swat-able bugs x3', () => { for (let i = 0; i < 3; i++) sim.spawnMosquito(sim.agent.x + 80, sim.agent.y - 90); }));
    eb.appendChild(this.btn('Injure', () => sim.injure('debug')));
    eb.appendChild(this.btn('Tire (energy 15)', () => (sim.character.needs.energy = 15)));
    eb.appendChild(this.btn('Bore (boredom 90)', () => (sim.character.needs.boredom = 90)));
    eb.appendChild(this.btn('Lonely (social 5)', () => (sim.character.needs.social = 5)));
    box.appendChild(eb);

    box.appendChild(el('h3', {}, 'Animation preview (freeze AI first)'));
    const ab = el('div');
    const actions = this.select(Object.keys(ACTIONS).sort());
    const posture = this.select(['standing', 'sitting', 'lying', 'kneeling']);
    const prop = this.select(['none', 'wateringCan', 'phone', 'book', 'brush']);
    const emo = this.select(['(auto)', ...EMOTIONS]);
    const play = (): void => {
      sim.aiFrozen = true;
      sim.agent.posture = posture.value as Posture;
      sim.agent.prop = prop.value === 'none' ? null : (prop.value as PropId);
      sim.agent.face = emo.value === '(auto)' ? {} : { emotion: emo.value as EmotionType };
      sim.agent.stop();
      sim.agent.play(actions.value as ActionId, true);
    };
    ab.appendChild(actions);
    ab.appendChild(posture);
    ab.appendChild(prop);
    ab.appendChild(emo);
    ab.appendChild(this.btn('Play', play));
    ab.appendChild(this.btn('Walk right', () => { sim.aiFrozen = true; sim.agent.moveToward(sim.agent.x + 300, false, 0); sim.agent.play('walk'); }));
    box.appendChild(ab);
    return box;
  }

  update(dt: number): void {
    if (!this.visible) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.25;
    const sim = this.sim;
    this.speedBtns.forEach((b, i) => b.classList.toggle('on', [1, 2, 4, 8, 16][i] === sim.timeScale));
    this.freezeBtn.classList.toggle('on', sim.aiFrozen);
    if (document.activeElement !== this.hourSlider) this.hourSlider.value = String(sim.clock.hour);

    const n = sim.character.needs;
    const bar = (k: string, v: number, good: boolean): string =>
      `<div>${k.padEnd(11, ' ')}<span class="barbg"><span class="bar" style="width:${(v * 1.2).toFixed(0)}px;background:${good ? '#7fe0a0' : '#ff9fc2'}"></span></span>${v.toFixed(0)}</div>`;
    const b = sim.brain.describe();
    const scores = sim.activities.evaluate(sim);
    const mem = sim.memory.recent(8);
    const w = sim.weather;
    const html = [
      '<h3>Needs</h3>',
      bar('happiness', n.happiness, true), bar('rest', n.energy, true), bar('fun', 100 - n.boredom, true), bar('social', n.social, true), bar('relax', n.comfort, true), bar('garden', n.nature, true), bar('tummy', n.tummy, true),
      bar('irritation', n.irritation, false), bar('pain', n.pain, false),
      '<h3>Mind</h3>',
      `mood: <b>${sim.emotion.mood.value.toFixed(1)}</b> (${sim.emotion.mood.label})<br>`,
      `emotion: <b>${sim.emotion.current}</b> / shown: ${sim.emotion.effective} (${sim.emotion.intensity.toFixed(2)})<br>`,
      `brain: <b>${b.state}</b><br>activity: <b>${ACTIVITY_LABEL[b.activity]}</b> [${b.phase}]<br>step: ${b.step}<br>reaction: ${b.reaction}<br>`,
      `action: ${sim.agent.action} · posture: ${sim.agent.posture} · prop: ${sim.agent.prop ?? '-'}<br>`,
      `zone: <b>${sim.character.currentZone}</b> x=${sim.agent.x.toFixed(0)} y=${sim.agent.y.toFixed(0)} · stuck recoveries: ${sim.brain.stuckRecoveries}<br>`,
      '<h3>Utility scores</h3><table>',
      ...scores.map((s) => `<tr><td>${s.id}</td><td>${s.available ? s.utility.toFixed(2) : `<span class="dim">${s.blocked}${s.cooldownLeft > 0 ? ` ${s.cooldownLeft.toFixed(0)}s` : ''}</span>`}</td><td><span class="bar" style="width:${Math.min(120, s.utility * 100).toFixed(0)}px;background:${s.available ? '#ffd45e' : '#6a5a78'}"></span></td></tr>`),
      '</table>',
      '<h3>Environment</h3>',
      `weather: <b>${w.type}</b> sun ${w.sun.toFixed(2)} cloud ${w.cloud.toFixed(2)} rain ${w.rain.toFixed(2)} wind ${w.windStrength.toFixed(2)} · next change ${w.changeIn.toFixed(0)}s<br>`,
      `time: ${sim.clockLabel} (${sim.clock.phase}) daylight ${sim.clock.daylight.toFixed(2)} outdoor light ${sim.outdoorLight.toFixed(2)} speed ${sim.timeScale}x<br>`,
      `rain on Carley: ${sim.rainOnCarley} · mosquitoes: ${sim.liveMosquitoes().length} · butterflies: ${sim.butterflies.length}<br>`,
      `plants: ${sim.plants.map((p) => `${p.visual[0]}${p.state.moisture.toFixed(0)}`).join(' ')}<br>`,
      '<h3>Memories</h3>',
      ...(mem.length ? mem.map((m) => `${m.eventType} <span class="dim">impact ${m.emotionalImpact.toFixed(1)} · ${(m.intensity * 100).toFixed(0)}%</span><br>`) : ['<span class="dim">none</span><br>']),
      '<h3>World events</h3>',
      `running: ${sim.events.active.map((a) => a.id).join(', ') || '-'}<br>`,
      `recent: ${sim.events.history.slice(-5).map((h) => `${h.id}@${(h.at / sim.secondsPerHour % 24).toFixed(1)}h`).join(', ') || '-'}<br>`,
      `stats: swatted ${sim.stats.mosquitoesSwatted}, shooed ${sim.stats.mosquitoesShooed}, injuries ${sim.stats.injuries}`
    ].join('');
    this.readouts.innerHTML = html;
  }
}
