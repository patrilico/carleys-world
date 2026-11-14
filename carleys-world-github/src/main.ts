import Phaser from 'phaser';
import { GAME_CONFIG } from './config/gameConfig';
import { BootScene } from './scenes/BootScene';
import { UIScene } from './scenes/UIScene';
import { WorldScene } from './scenes/WorldScene';

const game = new Phaser.Game({
  type: Phaser.AUTO, // WebGL with automatic Canvas fallback
  parent: 'game',
  width: GAME_CONFIG.width,
  height: GAME_CONFIG.height,
  backgroundColor: '#2b2238',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  fps: { target: 60 },
  render: { antialias: true, pixelArt: false, roundPixels: false, powerPreference: 'high-performance', batchSize: 4096 },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false }
  },
  scene: [BootScene, WorldScene, UIScene]
});

// Phaser pauses/resumes its loop with tab visibility; Simulation additionally clamps each step so nothing lurches.
// Offline support when installed as a home-screen app (needs https or localhost)
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

export default game;
