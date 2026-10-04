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
  /** Whether the car was above the high-speed threshold last frame. */
  private speeding = false;
  /** Last zoom we asked for, so the zoom is only eased when the state flips. */
  private zoomTarget: number = CAMERA.zoom;

  constructor() {
    super(SCENE_KEYS.game);
  }

  create(): void {
    this.bridge = getRaceBridge(this.game);
    this.resultReported = false;
    this.accumulator = 0;
    this.previousState = 'countdown';
    this.speeding = false;
    this.zoomTarget = CAMERA.zoom;

    const layout = new TrackLayout(getTrackDefinition(this.bridge.config.trackId));
    new TrackRenderer(this, layout);

    this.playerCar = new PlayerCar(this, this.bridge.config.car, layout.worldWidth, layout.worldHeight);
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
    const input = this.inputController.read();
    while (this.accumulator >= PHYSICS_STEP) {
      this.session.step(PHYSICS_STEP, input);
      this.accumulator -= PHYSICS_STEP;
    }

    const speed = this.playerCar.physics.speed;
    this.playerCar.sync(input.brake, input.accelerate, speed);
    
    // Camera effects. The zoom eases between two states and the rumble is a
    // one-shot played on entering the high-speed range: restarting a shake and
    // snapping the zoom on every frame made the whole view vibrate while driving.
    const cam = this.cameras.main;
    const speeding = speed > CAMERA.speedThreshold;
    if (speeding !== this.speeding) {
      this.speeding = speeding;
      const target = speeding ? CAMERA.zoom - CAMERA.speedZoomOut : CAMERA.zoom;
      if (target !== this.zoomTarget) {
        this.zoomTarget = target;
        // force: retarget from the current zoom if the threshold flips mid-blend.
        cam.zoomTo(target, CAMERA.zoomBlendMs, 'Sine.easeOut', true);
      }
      if (speeding) cam.shake(CAMERA.shakeDuration, CAMERA.shakeIntensity);
    }
    
    const hud = this.session.hudData();
    if (this.previousState === 'countdown' && hud.state === 'racing') {
      cam.flash(500, 255, 255, 255);
    }

    if (hud.state === 'finished' && this.previousState !== 'finished') {
      this.finishRace();
    }
    
    this.previousState = hud.state;

    // We can also add map data to hud here for the minimap
    (hud as any).playerPos = { x: this.playerCar.physics.x, y: this.playerCar.physics.y };

    this.game.events.emit(GAME_EVENTS.hudUpdate, hud);
  }

  private finishRace(): void {
    if (this.resultReported) return;
    this.resultReported = true;

    // Stop player controls and movement immediately
    this.playerCar.physics.vx = 0;
    this.playerCar.physics.vy = 0;

    const result = this.session.result();
    if (result) {
      this.time.delayedCall(RESULT_HANDOFF_DELAY_MS, () => this.bridge.onRaceComplete(result));
    }
  }
}
