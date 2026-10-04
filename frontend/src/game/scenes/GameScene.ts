import Phaser from 'phaser';
import { getRaceBridge, type RaceBridge } from '../bridge';
import { CAMERA, SCENE_KEYS, GAME_EVENTS } from '../config/GameConfig';
import { getTrackDefinition } from '../config/tracks';
import { PlayerCar } from '../entities/PlayerCar';
import { TrackLayout } from '../entities/TrackLayout';
import { TrackRenderer } from '../entities/TrackRenderer';
import { InputController } from '../systems/InputController';
import { RaceSession } from '../systems/RaceSession';

const PHYSICS_STEP = 1 / 120;
const MAX_FRAME_SECONDS = 0.05;
/** Lets the player see the "RACE COMPLETE" banner before React shows results. */
const RESULT_HANDOFF_DELAY_MS = 1800;

export class GameScene extends Phaser.Scene {
  private bridge!: RaceBridge;
  private session!: RaceSession;
  private playerCar!: PlayerCar;
  private inputController!: InputController;
  private accumulator = 0;
  private resultReported = false;
  private previousState: string = 'countdown';

  constructor() {
    super(SCENE_KEYS.game);
  }

  create(): void {
    this.bridge = getRaceBridge(this.game);
    this.resultReported = false;
    this.accumulator = 0;

    const layout = new TrackLayout(getTrackDefinition(this.bridge.config.trackId));
    new TrackRenderer(this, layout);

    this.playerCar = new PlayerCar(this, this.bridge.config.car);
    this.session = new RaceSession(layout, this.playerCar.physics);
    this.inputController = new InputController(this);

    this.playerCar.sync();
    const cam = this.cameras.main;
    cam.setBounds(0, 0, layout.worldWidth, layout.worldHeight);
    cam.setBackgroundColor(0x07060d);
    cam.setZoom(CAMERA.zoom);
    cam.startFollow(this.playerCar.sprite, true, CAMERA.lerp, CAMERA.lerp);
    cam.centerOn(this.playerCar.sprite.x, this.playerCar.sprite.y);

    // HUD lives in its own scene, layered above the world.
    if (!this.scene.isActive(SCENE_KEYS.hud)) this.scene.launch(SCENE_KEYS.hud);
  }

  override update(_time: number, deltaMs: number): void {
    if (this.inputController.restartPressed()) {
      this.scene.restart();
      return;
    }

    this.accumulator += Math.min(deltaMs / 1000, MAX_FRAME_SECONDS);
    while (this.accumulator >= PHYSICS_STEP) {
      this.session.step(PHYSICS_STEP, this.inputController.read());
      this.accumulator -= PHYSICS_STEP;
    }

    this.playerCar.sync();
    
    const hud = this.session.hudData();
    if (this.previousState === 'countdown' && hud.state === 'racing') {
      this.cameras.main.flash(500, 255, 255, 255);
    }
    this.previousState = hud.state;

    this.game.events.emit(GAME_EVENTS.hudUpdate, hud);
    this.reportResultOnce();
  }

  private reportResultOnce(): void {
    if (this.resultReported) return;
    const result = this.session.result();
    if (!result) return;
    this.resultReported = true;
    this.time.delayedCall(RESULT_HANDOFF_DELAY_MS, () => this.bridge.onRaceComplete(result));
  }
}
