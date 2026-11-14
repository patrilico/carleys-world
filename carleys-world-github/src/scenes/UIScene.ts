import Phaser from 'phaser';
import { COMMANDS } from '../systems/CommandSystem';
import type { CarleyView } from '../render/CarleyView';
import type { Simulation } from '../sim/Simulation';
import type { AudioSystem } from '../systems/AudioSystem';
import { SaveSystem, type Settings } from '../systems/SaveSystem';
import { DebugPanel } from '../ui/DebugPanel';
import { MoodMeter, UI_FONT } from '../ui/MoodMeter';
import { ActionToolbar } from '../ui/ActionToolbar';
import { MeterPanel } from '../ui/MeterPanel';
import { SettingsPanel } from '../ui/SettingsPanel';
import { StatusDisplay } from '../ui/StatusDisplay';
import { ThoughtBubble } from '../ui/ThoughtBubble';
import type { WorldScene } from './WorldScene';
import { heart } from '../ui/icons';

/** All 2D UI: mood meter, status, meters, command bar, thought bubbles, splash. Reads the simulation; never owns it. */
export class UIScene extends Phaser.Scene {
  private sim!: Simulation;
  private audio!: AudioSystem;
  private world!: WorldScene;
  private mood!: MoodMeter;
  private status!: StatusDisplay;
  private toolbar!: ActionToolbar;
  private meters!: MeterPanel;
  private bubble!: ThoughtBubble;
  private debug!: DebugPanel;
  private settingsPanel!: SettingsPanel;
  private time0 = 0;
  private hudAcc = 0;
  private cursorPointer = false;
  private splash: { g: Phaser.GameObjects.Graphics; texts: Phaser.GameObjects.Text[]; alpha: number; gone: boolean } | null = null;
  private pausedBeforeSettings = false;

  constructor() {
    super('UIScene');
  }

  create(): void {
    this.sim = this.registry.get('sim') as Simulation;
    this.audio = this.registry.get('audio') as AudioSystem;
    this.world = this.registry.get('worldScene') as WorldScene;
    const view = this.registry.get('carleyView') as CarleyView;
    const settings = this.registry.get('settings') as Settings;

    this.mood = new MoodMeter(this);
    this.status = new StatusDisplay(this);
    this.meters = new MeterPanel(this);
    this.toolbar = new ActionToolbar(this, this.sim);
    this.bubble = new ThoughtBubble(this, this.sim, () => view.world.head);
    this.debug = new DebugPanel(this.sim);
    this.settingsPanel = new SettingsPanel(
      settings,
      this.audio,
      () => this.world.resetWorld(),
      (open) => {
        if (open) {
          this.pausedBeforeSettings = this.sim.paused;
          this.sim.paused = true;
        } else this.sim.paused = this.pausedBeforeSettings;
      }
    );

    this.input.setTopOnly(false);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    this.buildSplash();
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (this.splash && !this.splash.gone) {
      this.dismissSplash();
      this.audio.click();
      return;
    }
    if (this.settingsPanel.isOpen) return;
    const x = p.x;
    const y = p.y;
    const hud = this.status.hitTest(x, y);
    if (hud === 'pause') {
      this.sim.paused = !this.sim.paused;
      this.audio.click();
      return;
    }
    if (hud === 'auto') {
      this.sim.autopilot = !this.sim.autopilot;
      this.toolbar.toast(this.sim.autopilot ? 'Autopilot on: Carley chooses for herself' : 'Autopilot off: you decide', true);
      this.audio.click();
      return;
    }
    if (hud === 'settings') {
      this.audio.click();
      this.settingsPanel.open();
      return;
    }
    const i = this.toolbar.hitTest(x, y);
    if (i >= 0) {
      this.audio.click();
      this.toolbar.press(i);
      return;
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (this.splash && !this.splash.gone && (e.key === ' ' || e.key === 'Enter')) {
      this.dismissSplash();
      return;
    }
    if (e.key === ' ' && !this.settingsPanel.isOpen) {
      this.sim.paused = !this.sim.paused;
      e.preventDefault();
    } else if (/^[1-9]$/.test(e.key) && !this.settingsPanel.isOpen) {
      const idx = Number(e.key) - 1;
      if (idx < COMMANDS.length) {
        this.audio.click();
        this.toolbar.press(idx);
      }
    }
  }

  private buildSplash(): void {
    const g = this.add.graphics().setDepth(200);
    const saved = !!this.registry.get('loadedSave');
    const style = (size: number, color: string, extra: object = {}) => ({ fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: 'bold', color, align: 'center', ...extra });
    const title = this.add.text(640, 270, "Carley's World", style(64, '#e99f8a', { stroke: '#ffffff', strokeThickness: 10 })).setOrigin(0.5).setDepth(201);
    const sub2 = this.add
      .text(640, 392, saved ? `Welcome back! Day ${this.sim.clock.day + 1} is waiting.` : 'Keep her happy: tell her what she needs.', style(18, '#866b5e'))
      .setOrigin(0.5)
      .setDepth(201);
    const go = this.add.text(640, 470, 'Click anywhere to begin', style(26, '#6a4436', { stroke: '#ffffff', strokeThickness: 6 })).setOrigin(0.5).setDepth(201);
    this.splash = { g, texts: [title, sub2, go], alpha: 1, gone: false };
  }

  private dismissSplash(): void {
    if (this.splash) this.splash.gone = true;
  }

  update(_t: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.1);
    this.time0 += dt;
    const ptr = this.input.activePointer;
    const hud = this.status.hitTest(ptr.x, ptr.y);
    this.status.hover = hud;
    // the HUD panels are redrawn ~30x per second; they are static-ish and expensive to re-tessellate
    this.hudAcc += dt;
    if (this.hudAcc >= 1 / 32) {
      const hd = this.hudAcc;
      this.hudAcc = 0;
      this.mood.update(hd, this.sim, this.time0);
      this.status.update(hd, this.sim, this.time0);
      this.meters.update(hd, this.sim);
      this.toolbar.update(hd, { x: ptr.x, y: ptr.y });
    }
    this.bubble.update(dt);
    this.debug.update(dt);
    const over = !!hud || this.toolbar.hover >= 0;
    if (over !== this.cursorPointer) {
      this.cursorPointer = over;
      this.input.setDefaultCursor(over ? 'pointer' : 'default');
    }

    if (this.splash) this.updateSplash(dt);
    if (this.sim.paused && !this.settingsPanel.isOpen) this.drawPausedBadge();
    else this.pausedText?.setVisible(false);
  }

  private pausedText?: Phaser.GameObjects.Text;
  private drawPausedBadge(): void {
    if (!this.pausedText) {
      this.pausedText = this.add.text(640, 108, 'Paused', { fontFamily: UI_FONT, fontSize: '28px', fontStyle: 'bold', color: '#ffffff', stroke: '#6a4436', strokeThickness: 7 }).setOrigin(0.5).setDepth(130);
    }
    this.pausedText.setVisible(true);
  }

  private updateSplash(dt: number): void {
    const s = this.splash!;
    const g = s.g;
    g.clear();
    if (s.gone) s.alpha = Math.max(0, s.alpha - dt * 3);
    if (s.alpha <= 0.01) {
      g.destroy();
      for (const t of s.texts) t.destroy();
      this.splash = null;
      return;
    }
    g.fillStyle(0xfaeae6, 0.72 * s.alpha);
    g.fillRect(0, 0, 1280, 720);
    g.fillStyle(0xffffff, 0.8 * s.alpha);
    g.lineStyle(5, 0x855c4d, s.alpha);
    g.fillRoundedRect(250, 190, 780, 360, 36);
    g.strokeRoundedRect(250, 190, 780, 360, 36);
    const bob = Math.sin(this.time0 * 3) * 6;
    heart(g, 640, 226 + bob, 22, 0xe99f8a, 0x6a4436);
    for (const t of s.texts) t.setAlpha(s.alpha);
    s.texts[2].setAlpha(s.alpha * (0.6 + 0.4 * Math.sin(this.time0 * 4)));
    void SaveSystem;
  }
}
