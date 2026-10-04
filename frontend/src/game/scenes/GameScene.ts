import Phaser from 'phaser';
import { getRaceBridge, type RaceBridge } from '../bridge';
import { GAME_EVENTS, SCENE_KEYS } from '../config/GameConfig';
import { getTrackDefinition } from '../config/tracks';
import { CameraRig } from '../entities/CameraRig';
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
  private cameraRig!: CameraRig;
  private inputController!: InputController;
  private accumulator = 0;
  private resultReported = false;
  private previousState: string = 'countdown';
  private rainEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super(SCENE_KEYS.game);
  }

  create(): void {
    this.bridge = getRaceBridge(this.game);
    this.resultReported = false;
    this.accumulator = 0;
    this.previousState = 'countdown';

    const layout = new TrackLayout(getTrackDefinition(this.bridge.config.trackId));
    new TrackRenderer(this, layout);

    this.playerCar = new PlayerCar(this, this.bridge.config.car, layout.worldWidth, layout.worldHeight);
    this.session = new RaceSession(layout, this.playerCar.physics);
    this.inputController = new InputController(this);

    this.playerCar.sync();
    const cam = this.cameras.main;
    cam.setBounds(0, 0, layout.worldWidth, layout.worldHeight);
    cam.setBackgroundColor(0x07060d);

    const DEBUG_COLLISION = false;
    if (DEBUG_COLLISION) {
      const g = this.add.graphics();
      g.setDepth(999);
      
      // RED: non-drivable area
      g.fillStyle(0xff0000, 0.3);
      g.fillRect(0, 0, layout.worldWidth, layout.worldHeight);
      
      // GREEN: drivable area (road + sidewalk = roadWidth / 2 + 40)
      g.lineStyle(layout.roadWidth + 80, 0x00ff00, 0.4);
      g.beginPath();
      layout.centerline.forEach((p, i) => {
        if (i === 0) g.moveTo(p.x, p.y);
        else g.lineTo(p.x, p.y);
      });
      g.closePath();
      g.strokePath();

      // YELLOW: collision objects / boundaries
      // Let's draw the hard boundary edge
      g.lineStyle(2, 0xffff00, 1);
      const half = layout.roadWidth / 2;
      const hardLimit = half + 40;
      
      // Inner/Outer offsets (approximate for visualization)
      const drawOffsetLine = (offset: number) => {
        g.beginPath();
        layout.centerline.forEach((p, i) => {
          const dir = layout.directionAt(i);
          const nx = -dir.y;
          const ny = dir.x;
          const px = p.x + nx * offset;
          const py = p.y + ny * offset;
          if (i === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        });
        g.closePath();
        g.strokePath();
      };
      
      drawOffsetLine(hardLimit);
      drawOffsetLine(-hardLimit);
    }

    // Weather Effects
    if (this.bridge.config.trackId === 'hawkins-streets') {
      // Generate rain texture
      const rg = this.make.graphics({x:0, y:0}, false);
      rg.fillStyle(0xaaaaff, 0.4);
      rg.fillRect(0, 0, 2, 20);
      rg.generateTexture('rain_drop', 2, 20);
      rg.destroy();

      // Rain particles attached to camera
      const particles = this.add.particles(0, 0, 'rain_drop', {
        x: { min: -1000, max: 2000 },
        y: { min: -1000, max: 1500 },
        lifespan: 1000,
        speedY: { min: 400, max: 600 },
        speedX: { min: -50, max: 50 },
        angle: 90,
        quantity: 2,
        blendMode: 'ADD'
      });
      particles.setDepth(10);
      this.rainEmitter = particles;

      // Subtle fog overlay
      this.add.rectangle(0, 0, layout.worldWidth, layout.worldHeight, 0x07061a, 0.2).setOrigin(0, 0).setDepth(5).setBlendMode(Phaser.BlendModes.SCREEN);
    } else if (this.bridge.config.trackId === 'upside-down') {
      // Generate spore texture
      const rg = this.make.graphics({x:0, y:0}, false);
      rg.fillStyle(0xffaabb, 0.6);
      rg.fillCircle(2, 2, 2);
      rg.generateTexture('spore', 4, 4);
      rg.destroy();

      // Floating spores attached to camera
      const particles = this.add.particles(0, 0, 'spore', {
        x: { min: -1000, max: 2000 },
        y: { min: -1000, max: 1500 },
        lifespan: 4000,
        speedY: { min: -30, max: 30 },
        speedX: { min: -40, max: 20 },
        scale: { start: 0, end: 1.5, ease: 'Sine.easeInOut' },
        alpha: { start: 0, end: 0.8, ease: 'Sine.easeInOut' },
        quantity: 1,
        blendMode: 'SCREEN'
      });
      particles.setDepth(10);
      this.rainEmitter = particles; // Reusing the rainEmitter reference to follow camera

      // Deep red/crimson fog overlay
      this.add.rectangle(0, 0, layout.worldWidth, layout.worldHeight, 0x1f000a, 0.25).setOrigin(0, 0).setDepth(5).setBlendMode(Phaser.BlendModes.SCREEN);
    }

    // Chase camera: sits ahead of the car and turns with it (see CameraRig).
    this.cameraRig = new CameraRig(cam);
    this.cameraRig.snap(this.playerCar.physics);

    // HUD lives in its own scene, layered above the world.
    if (!this.scene.isActive(SCENE_KEYS.hud)) this.scene.launch(SCENE_KEYS.hud);
  }

  override update(_time: number, deltaMs: number): void {
    if (this.inputController.restartPressed()) {
      this.scene.restart();
      return;
    }
    if (this.inputController.cameraPressed()) this.cameraRig.cycle();

    this.accumulator += Math.min(deltaMs / 1000, MAX_FRAME_SECONDS);
    const input = this.inputController.read();
    while (this.accumulator >= PHYSICS_STEP) {
      this.session.step(PHYSICS_STEP, input);
      this.accumulator -= PHYSICS_STEP;
    }

    const speed = this.playerCar.physics.speed;
    this.playerCar.sync(input.brake, input.accelerate, speed);
    
    // Anti-gravity twist logic (only if not finished)
    let twist = 0;
    if (this.session.race.snapshot().state !== 'finished') {
      twist = this.session.layout.getAntiGravityTwist(this.playerCar.physics.x, this.playerCar.physics.y);
    }
    
    this.cameraRig.update(this.playerCar.physics, speed, deltaMs, twist);

    if (this.rainEmitter) {
      this.rainEmitter.setPosition(this.cameras.main.scrollX + this.cameras.main.width / 2, this.cameras.main.scrollY);
    }

    const hud = this.session.hudData();
    if (this.previousState === 'countdown' && hud.state === 'racing') {
      this.cameras.main.flash(500, 255, 255, 255);
    }

    if (hud.state === 'finished' && this.previousState !== 'finished') {
      this.finishRace();
    }

    this.previousState = hud.state;

    this.game.events.emit(GAME_EVENTS.hudUpdate, {
      ...hud,
      playerPos: { x: this.playerCar.physics.x, y: this.playerCar.physics.y },
      cameraRotation: this.cameraRig.screenRotation,
      view: this.cameraRig.viewName,
    });
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
