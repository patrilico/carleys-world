import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { ArcadeCharacterBody } from '../render/ArcadeCharacterBody';
import { CarleyView } from '../render/CarleyView';
import { EffectsView } from '../render/EffectsView';
import { GardenView, HouseView, SkyView, WeatherView } from '../render/WorldView';
import { Simulation } from '../sim/Simulation';
import { AudioSystem } from '../systems/AudioSystem';
import { SaveSystem } from '../systems/SaveSystem';

/** The living world: owns the simulation and renders it. Contains no game logic of its own. */
export class WorldScene extends Phaser.Scene {
  sim!: Simulation;
  carleyView!: CarleyView;
  audio!: AudioSystem;
  private sky!: SkyView;
  private house!: HouseView;
  private garden!: GardenView;
  private weather!: WeatherView;
  private effects!: EffectsView;
  private resetting = false;
  private saveHandlers: (() => void)[] = [];
  private loadedSave = false;

  constructor() {
    super('WorldScene');
  }

  create(): void {
    const settings = SaveSystem.loadSettings();
    const body = new ArcadeCharacterBody(this, 360);
    this.sim = new Simulation({ body, seed: (Date.now() & 0xffffff) ^ GAME_CONFIG.seed });
    this.loadedSave = SaveSystem.load(this.sim);

    this.sky = new SkyView(this);
    this.house = new HouseView(this);
    this.garden = new GardenView(this);
    this.carleyView = new CarleyView(this, 50);
    this.weather = new WeatherView(this);
    this.effects = new EffectsView(this, this.sim, this.carleyView, this.garden, this.weather);

    // print-like finish: faint paper grain + warm vignette over the whole picture
    this.add.tileSprite(0, 0, 1280, 720, 'grain').setOrigin(0, 0).setDepth(90).setAlpha(0.07).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.add.image(0, 0, 'vignette').setOrigin(0, 0).setDepth(91);

    this.audio = new AudioSystem();
    this.audio.attach(this.sim, settings);

    this.registry.set('sim', this.sim);
    this.registry.set('audio', this.audio);
    this.registry.set('settings', settings);
    this.registry.set('carleyView', this.carleyView);
    this.registry.set('loadedSave', this.loadedSave);
    this.registry.set('worldScene', this);

    // autosave on a timer and on lifecycle events
    this.time.addEvent({ delay: GAME_CONFIG.autosaveSeconds * 1000, loop: true, callback: () => this.save() });
    const onHide = (): void => {
      if (document.hidden) this.save();
    };
    const onUnload = (): void => this.save();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('pagehide', onUnload);
    this.saveHandlers.push(
      () => document.removeEventListener('visibilitychange', onHide),
      () => window.removeEventListener('beforeunload', onUnload),
      () => window.removeEventListener('pagehide', onUnload)
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const f of this.saveHandlers) f();
      this.carleyView.destroy();
    });

    // dev/test hook
    (window as unknown as { __carley: unknown }).__carley = { sim: this.sim, scene: this };

    this.scene.launch('UIScene');
  }

  save(): void {
    if (this.resetting) return;
    SaveSystem.save(this.sim);
  }

  /** Wipe the save and reload with a brand-new world. */
  resetWorld(): void {
    this.resetting = true;
    SaveSystem.clear();
    window.location.reload();
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.1);
    const sim = this.sim;
    sim.update(dt);
    // visuals keep animating while paused so the world still feels alive
    this.physics.world.isPaused = sim.paused;
    if (sim.paused) return; // everything freezes in place, including Carley
    const vdt = dt;
    this.sky.update(vdt, sim);
    this.weather.update(vdt, sim);
    this.house.update(vdt, sim, this.weather.overlayColor, this.weather.overlayAlpha);
    this.garden.update(vdt, sim);
    this.carleyView.update(vdt, sim);
    this.effects.update(vdt);
    this.audio.update(vdt);
  }
}
