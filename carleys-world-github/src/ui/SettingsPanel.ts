import type { AudioSystem } from '../systems/AudioSystem';
import { SaveSystem, type Settings } from '../systems/SaveSystem';

/** DOM settings dialog: independent volume controls, mute, reset simulation, help. */
export class SettingsPanel {
  private root: HTMLElement;
  private confirmReset = false;

  constructor(private settings: Settings, private audio: AudioSystem, private onReset: () => void, private onVisibility: (open: boolean) => void) {
    this.root = document.getElementById('settings')!;
    this.build();
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
  }

  get isOpen(): boolean {
    return this.root.style.display === 'flex';
  }

  open(): void {
    this.confirmReset = false;
    this.build();
    this.root.style.display = 'flex';
    this.onVisibility(true);
  }

  close(): void {
    this.root.style.display = 'none';
    this.onVisibility(false);
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  private slider(label: string, key: 'master' | 'ambience' | 'sfx' | 'voice' | 'music'): HTMLElement {
    const row = document.createElement('div');
    row.className = 'row';
    const l = document.createElement('span');
    l.textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '1';
    input.step = '0.05';
    input.value = String(this.settings[key]);
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      this.settings[key] = v;
      if (key === 'sfx') {
        this.settings.voice = v;
        this.settings.ambience = v;
      }
      this.audio.setSettings(this.settings);
      SaveSystem.saveSettings(this.settings);
    });
    input.addEventListener('change', () => this.audio.click());
    row.append(l, input);
    return row;
  }

  private build(): void {
    this.root.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'card';
    const h = document.createElement('h2');
    h.textContent = 'Settings';
    card.appendChild(h);
    card.appendChild(this.slider('Music', 'music'));
    card.appendChild(this.slider('Sounds', 'sfx'));

    const mute = document.createElement('div');
    mute.className = 'row';
    const ml = document.createElement('span');
    ml.textContent = 'Mute everything';
    const mc = document.createElement('input');
    mc.type = 'checkbox';
    mc.checked = this.settings.muted;
    mc.addEventListener('change', () => {
      this.settings.muted = mc.checked;
      this.audio.setSettings(this.settings);
      SaveSystem.saveSettings(this.settings);
    });
    mute.append(ml, mc);
    card.appendChild(mute);

    const btns = document.createElement('div');
    btns.className = 'btns';
    const reset = document.createElement('button');
    reset.className = 'danger';
    reset.textContent = this.confirmReset ? 'Really reset? Click again' : 'Reset world';
    reset.addEventListener('click', () => {
      if (!this.confirmReset) {
        this.confirmReset = true;
        reset.textContent = 'Really reset? Click again';
        return;
      }
      this.onReset();
    });
    const close = document.createElement('button');
    close.textContent = 'Back to Carley';
    close.addEventListener('click', () => this.close());
    btns.append(reset, close);
    card.appendChild(btns);

    const help = document.createElement('p');
    help.className = 'help';
    help.innerHTML =
      '<b>How to play:</b> keep Carley happy! Her six meters (Rest, Fun, Social, Relax, Garden, Tummy) drain slowly and only fill while she does something for them. ' +
      'Use the buttons at the bottom (keys 1-8) to tell her what to do - click again to stop. The Auto button lets her choose for herself. <b>Space</b> pauses, <b>F3</b> opens the debug panel.';
    card.appendChild(help);
    this.root.appendChild(card);
  }
}
