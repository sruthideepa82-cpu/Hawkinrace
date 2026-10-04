import Phaser from 'phaser';
import { setRaceBridge, type RaceBridge } from './bridge';
import { GAME } from './config/GameConfig';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';

/** Creates the Phaser game inside `parent`. Independent of React. */
export function createGame(parent: HTMLElement, bridge: RaceBridge): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME.width,
    height: GAME.height,
    backgroundColor: GAME.backgroundColor,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    // The bridge must exist before any scene is created.
    callbacks: { preBoot: (game) => setRaceBridge(game, bridge) },
    // GameScene starts automatically; it launches HudScene on top of itself.
    scene: [GameScene, HudScene],
  });
}
