import Phaser from 'phaser';
import { getRaceBridge, type RaceBridge } from '../bridge';
import { GAME_EVENTS, SCENE_KEYS } from '../config/GameConfig';
import { getTrackDefinition } from '../config/tracks';
import { buildGrid } from '../config/racers';
import { CameraRig } from '../entities/CameraRig';
import { PlayerCar } from '../entities/PlayerCar';
import { AiCarView } from '../entities/CarView';
import { TrackLayout } from '../entities/TrackLayout';
import { TrackRenderer } from '../entities/TrackRenderer';
import { InputController } from '../systems/InputController';
import { RaceSession, type Racer } from '../systems/RaceSession';
import { CHARACTERS } from '../../data/characters';
import { CARS } from '../../data/cars';
import { VecnaEntity } from '../entities/VecnaEntity';

const PHYSICS_STEP = 1 / 120;
const MAX_FRAME_SECONDS = 0.05;
/** Lets the player see the "RACE COMPLETE" banner before React shows results. */
const RESULT_HANDOFF_DELAY_MS = 1800;
/** Shorter, because a failure is a stop rather than a finish to celebrate. */
const FAILURE_HANDOFF_DELAY_MS = 1100;

export class GameScene extends Phaser.Scene {
  private bridge!: RaceBridge;
  private session!: RaceSession;
  private playerCar!: PlayerCar;
  private aiViews = new Map<Racer, AiCarView>();
  private cameraRig!: CameraRig;
  private inputController!: InputController;
  private accumulator = 0;
  private resultReported = false;
  private previousState: string = 'countdown';
  private rainEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  private vecna?: VecnaEntity;
  private lapTransitionMs: number = 0;

  constructor() {
    super(SCENE_KEYS.game);
  }

  preload(): void {
    // Load high-quality car sprites
    this.load.image('car-apex-vulcan', 'cars/car-apex-vulcan-top.png');
    this.load.image('car-venom-verde', 'cars/car-venom-verde-top.png');
    this.load.image('car-shadow-gt', 'cars/car-shadow-gt-top.png');
    this.load.image('car-inferno-rs', 'cars/car-inferno-rs-top.png');
  }

  create(): void {
    this.bridge = getRaceBridge(this.game);
    this.resultReported = false;
    this.accumulator = 0;
    this.previousState = 'countdown';
    this.lapTransitionMs = 0;
    this.aiViews.clear();

    const layout = new TrackLayout(getTrackDefinition(this.bridge.config.trackId));
    new TrackRenderer(this, layout);

    // The player keeps the driver and car they picked; the AI field is built
    // around them from the drivers and cars they did not choose.
    const character = CHARACTERS.find((c) => c.id === this.bridge.config.characterId) ?? CHARACTERS[0];
    const car = CARS.find((c) => c.id === this.bridge.config.car.id) ?? CARS[0];
    const grid = buildGrid(character, car);
    const playerConfig = grid.find((g) => g.isPlayer)!;
    const aiConfigs = grid.filter((g) => !g.isPlayer);

    this.session = new RaceSession(layout, grid);
    this.playerCar = new PlayerCar(this, playerConfig, layout.worldWidth, layout.worldHeight);
    for (const config of aiConfigs) {
      const racer = this.session.racers.find((r) => r.config === config);
      if (racer) this.aiViews.set(racer, new AiCarView(this, config));
    }
    this.inputController = new InputController(this);

    this.playerCar.sync(this.session.player.physics, {});
    const cam = this.cameras.main;
    cam.setBounds(0, 0, layout.worldWidth, layout.worldHeight);
    cam.setBackgroundColor(0x07060d);

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
      
      // Place Vecna in the distance relative to the player's start position
      const heading = this.session.player.physics.heading;
      const px = this.session.player.physics.x;
      const py = this.session.player.physics.y;
      const vecnaX = px + Math.cos(heading) * 600 - Math.sin(heading) * 300;
      const vecnaY = py + Math.sin(heading) * 600 + Math.cos(heading) * 300;
      this.vecna = new VecnaEntity(this, vecnaX, vecnaY);
      this.vecna.setRotation(heading - Math.PI / 2); // Face the road
    }

    // Chase camera: pins the car to a fixed spot on screen and turns the world
    // so it always points up, easing round after the car (see CameraRig).
    this.cameraRig = new CameraRig(cam);
    this.cameraRig.snap(this.session.player.physics);

    // HUD lives in its own scene, layered above the world.
    if (!this.scene.isActive(SCENE_KEYS.hud)) this.scene.launch(SCENE_KEYS.hud);
  }

  override update(_time: number, deltaMs: number): void {
    if (this.inputController.restartPressed()) {
      this.scene.restart();
      return;
    }
    
    // Lap completion slow motion effect
    if (this.lapTransitionMs > 0) {
      this.lapTransitionMs -= deltaMs;
      deltaMs *= 0.1;
    }
    
    if (this.inputController.cameraPressed()) this.cameraRig.cycle();

    this.accumulator += Math.min(deltaMs / 1000, MAX_FRAME_SECONDS);
    const input = this.inputController.read();
    
    const isOver = this.session.race.isOver;
    if (!isOver) {
      while (this.accumulator >= PHYSICS_STEP) {
        this.session.step(PHYSICS_STEP, input);
        this.accumulator -= PHYSICS_STEP;
      }
    } else {
      this.accumulator = 0;
    }

    // 1. Player view: full effects.
    const player = this.session.player;
    
    // Trigger lap completion overlay
    if (player.lastLapEvent === 'lap') {
      const lapData = player.laps.snapshot();
      const lapTimeMs = lapData.lapTimesMs[lapData.lapTimesMs.length - 1] ?? 0;
      const completedLap = lapData.lap - 1;
      
      this.game.events.emit(GAME_EVENTS.lapComplete, {
        lap: completedLap,
        lapTimeMs,
        position: this.session.playerPosition(),
        totalRacers: this.session.racers.length,
        lapsRemaining: lapData.totalLaps - completedLap
      });
      
      this.lapTransitionMs = 2000;
    }

    const speed = player.physics.speed;
    const racing = this.session.race.isRacing;
    this.playerCar.sync(player.physics, {
      braking: racing && input.brake,
      accelerating: racing && input.accelerate,
      speed,
      boosting: racing && input.nitro && player.nitro.active,
    });

    // 2. Opponent views. The camera stays locked to the player, so rivals simply
    //    render wherever they physically are.
    for (const [racer, view] of this.aiViews) {
      view.sync(racer.physics, { braking: racer.nitro.active === false && racer.physics.forwardSpeed < 40, boosting: racer.nitro.active });
    }

    // Anti-gravity twist logic. Only the player's view drives it, and only while
    // the race is live, so a finished or failed car stops rolling the camera.
    let twist = 0;
    if (!this.session.race.isOver) {
      twist = this.session.layout.getAntiGravityTwist(player.physics.x, player.physics.y);
    }

    const hud = this.session.hudData();
    const over = hud.state === 'finished' || hud.state === 'failed';
    const isUpsideDown = this.bridge.config.trackId === 'upside-down';

    if (this.vecna) {
      const totalIntroMs = isUpsideDown ? 5500 : 3500;
      const elapsed = totalIntroMs - hud.introRemainingMs;
      this.vecna.update(_time, elapsed);
    }

    if (hud.state === 'intro') {
      const introTotal = isUpsideDown ? 5500 : 3500;
      this.cameraRig.updateIntro(player.physics, deltaMs, hud.introRemainingMs, introTotal, this.bridge.config.trackId);
    } else if (over) {
      this.cameraRig.updateResults(player.physics, deltaMs);
    } else {
      this.cameraRig.update(player.physics, speed, deltaMs, twist);
    }

    if (this.rainEmitter) {
      this.rainEmitter.setPosition(this.cameras.main.scrollX + this.cameras.main.width / 2, this.cameras.main.scrollY);
    }

    if (this.previousState === 'countdown' && hud.state === 'racing') {
      this.cameras.main.flash(500, 255, 255, 255);
    }

    // Either way the race is over -- completed, or failed because every AI car
    // finished first -- so hand the result to React once, on the transition.
    if (over && this.previousState !== 'finished' && this.previousState !== 'failed') {
      this.finishRace();
    }

    this.previousState = hud.state;

    this.game.events.emit(GAME_EVENTS.hudUpdate, {
      ...hud,
      playerPos: { x: player.physics.x, y: player.physics.y },
      rivalPos: this.session.racers
        .filter((r) => !r.isPlayer)
        .map((r) => ({ x: r.physics.x, y: r.physics.y, color: r.config.color })),
      cameraRotation: this.cameraRig.screenRotation,
      view: this.cameraRig.viewName,
    });
  }

  /**
   * Called once the race is over for any reason -- the player taking the
   * chequered flag, or every AI car finishing with the player still on track.
   *
   * The session is the single authority on whether that moment has arrived; this
   * just reacts to the state changing. A failed race uses a shorter handoff so
   * the "YOU FAILED" moment does not drag, and carries `outcome` through so the
   * results screen can tell a failure from a completed race.
   */
  private finishRace(): void {
    if (this.resultReported) return;
    this.resultReported = true;

    const result = this.session.result();
    if (result) {
      const delay = result.outcome === 'failed' ? FAILURE_HANDOFF_DELAY_MS : RESULT_HANDOFF_DELAY_MS;
      this.time.delayedCall(delay, () => this.bridge.onRaceComplete(result));
    }
  }
}