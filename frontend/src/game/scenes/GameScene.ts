import Phaser from 'phaser';
import { getRaceBridge, type RaceBridge } from '../bridge';
import { GAME_EVENTS, SCENE_KEYS } from '../config/GameConfig';
import { getTrackDefinition } from '../config/tracks';
import { buildGrid } from '../config/racers';
import { CameraRig } from '../entities/CameraRig';
import { PlayerCar } from '../entities/PlayerCar';
import { AiCarView } from '../entities/CarView';
import { ensureParticleTexture } from '../entities/carTexture';
import { TrackLayout } from '../entities/TrackLayout';
import { TrackRenderer } from '../entities/TrackRenderer';
import { InputController } from '../systems/InputController';
import { RaceSession, type Racer } from '../systems/RaceSession';
import { CHARACTERS } from '../../data/characters';
import { CARS } from '../../data/cars';
import { VecnaEntity } from '../entities/VecnaEntity';
import { SupernaturalSystem } from '../systems/SupernaturalSystem';
import { CollisionDebug } from '../systems/CollisionDebug';

const PHYSICS_STEP = 1 / 120;
const MAX_FRAME_SECONDS = 0.05;
/** Lets the player see the "RACE COMPLETE" banner before React shows results. */
const RESULT_HANDOFF_DELAY_MS = 1800;
/** Shorter, because a failure is a stop rather than a finish to celebrate. */
const FAILURE_HANDOFF_DELAY_MS = 1100;
/** Short, non-cinematic jolt on contact, played before the failure screen. */
const IMPACT_SHAKE_MS = 260;
const IMPACT_SHAKE_INTENSITY = 0.008;

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
  private supernaturalSystem?: SupernaturalSystem;
  private collisionDebug!: CollisionDebug;

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
    const trackId = this.bridge.config.trackId;
    
    // Background and base ambiance
    if (trackId === 'upside-down') cam.setBackgroundColor(0x0f0005);
    else if (trackId === 'hawkins-forest') cam.setBackgroundColor(0x02050a);
    else if (trackId === 'hawkins-lab') cam.setBackgroundColor(0x0a0c11);
    else if (trackId === 'starcourt-run') cam.setBackgroundColor(0x050510);
    else cam.setBackgroundColor(0x07060d); // hawkins-streets

    // Track-specific weather and particle effects
    if (trackId === 'hawkins-streets') {
      const rg = this.make.graphics({x:0, y:0}, false);
      rg.fillStyle(0xaaaaff, 0.4);
      rg.fillRect(0, 0, 2, 20);
      rg.generateTexture('rain_drop', 2, 20);
      rg.destroy();

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

      // Subtle town fog overlay
      this.add.rectangle(0, 0, layout.worldWidth, layout.worldHeight, 0x07061a, 0.2).setOrigin(0, 0).setDepth(5).setBlendMode(Phaser.BlendModes.SCREEN);
      
    } else if (trackId === 'starcourt-run') {
      // Subtle mall neon glow overlay
      this.add.rectangle(0, 0, layout.worldWidth, layout.worldHeight, 0x1f0033, 0.1).setOrigin(0, 0).setDepth(5).setBlendMode(Phaser.BlendModes.SCREEN);
      
    } else if (trackId === 'hawkins-forest') {
      // Dense blue forest fog
      this.add.rectangle(0, 0, layout.worldWidth, layout.worldHeight, 0x4466aa, 0.15).setOrigin(0, 0).setDepth(5).setBlendMode(Phaser.BlendModes.SCREEN);
      
    } else if (trackId === 'hawkins-lab') {
      // Cold industrial atmosphere
      this.add.rectangle(0, 0, layout.worldWidth, layout.worldHeight, 0x112233, 0.1).setOrigin(0, 0).setDepth(5).setBlendMode(Phaser.BlendModes.SCREEN);
      
    } else if (trackId === 'upside-down') {
      const rg = this.make.graphics({x:0, y:0}, false);
      rg.fillStyle(0xffaabb, 0.6);
      rg.fillCircle(2, 2, 2);
      rg.generateTexture('spore', 4, 4);
      rg.destroy();

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
      this.rainEmitter = particles; 

      // Deep red/crimson fog overlay
      this.add.rectangle(0, 0, layout.worldWidth, layout.worldHeight, 0x1f000a, 0.25).setOrigin(0, 0).setDepth(5).setBlendMode(Phaser.BlendModes.SCREEN);
      
      const heading = this.session.player.physics.heading;
      const px = this.session.player.physics.x;
      const py = this.session.player.physics.y;
      const vecnaX = px + Math.cos(heading) * 600 - Math.sin(heading) * 300;
      const vecnaY = py + Math.sin(heading) * 600 + Math.cos(heading) * 300;
      this.vecna = new VecnaEntity(this, vecnaX, vecnaY);
      this.vecna.setRotation(heading - Math.PI / 2);
    }

    // Chase camera: pins the car to a fixed spot on screen and turns the world
    // so it always points up, easing round after the car (see CameraRig).
    this.cameraRig = new CameraRig(cam);
    this.cameraRig.snap(this.session.player.physics);

    // HUD lives in its own scene, layered above the world.
    if (!this.scene.isActive(SCENE_KEYS.hud)) this.scene.launch(SCENE_KEYS.hud);
    
    this.supernaturalSystem = new SupernaturalSystem(this, layout, this.session.player);

    // Own handler, removed by reference on shutdown. `game.events.off(event)`
    // with no listener drops EVERY listener for that event, which quietly
    // unplugged the HUD's own supernatural listener on the first restart and
    // left the ability bar dead for the rest of the session.
    const onSupernaturalEvent = (ev: any) => {
      if (ev.type === 'takeover_start') {
        this.cameras.main.setBackgroundColor('#1a0000');
        this.add.rectangle(0, 0, layout.worldWidth, layout.worldHeight, 0xff0000, 0.2)
          .setOrigin(0).setDepth(4).setBlendMode(Phaser.BlendModes.MULTIPLY);
      } else if (ev.type === 'ability_start') {
        this.cameras.main.flash(500, 139, 92, 246);
        this.playerCar.sprite.setTint(0x8b5cf6);
      } else if (ev.type === 'ability_end') {
        this.playerCar.sprite.clearTint();
      }
    };
    this.game.events.on(GAME_EVENTS.supernaturalEvent, onSupernaturalEvent);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(GAME_EVENTS.supernaturalEvent, onSupernaturalEvent);
    });

    // Development-only collision overlay. `available` is false in a production
    // build, so the key does nothing there and the code is never constructed.
    this.collisionDebug = new CollisionDebug(this, layout);
  }

  override update(_time: number, deltaMs: number): void {
    const race = this.session.race;

    // Restart rebuilds the scene from scratch. It is offered only while the
    // race is live: once the race is over the results screen owns the display
    // and RETRY there builds a brand new race underneath it.
    if (!race.isOver && this.inputController.restartPressed()) {
      this.scene.restart();
      return;
    }

    // Pause freezes the race clock and the cars together. Keys are released on
    // both edges, because a key let go of while the race was frozen never
    // delivers its keyup and would otherwise still be held when play resumes.
    if (this.inputController.pausePressed()) {
      if (race.pause() || race.resume()) this.inputController.release();
    }

    if (this.inputController.cameraPressed()) this.cameraRig.cycle();
    if (this.collisionDebug?.available && this.inputController.debugPressed()) {
      this.collisionDebug.toggle();
    }

    const isOver = race.isOver;
    const isPaused = race.isPaused;
    // A frozen race banks no time. The frame it was frozen on must not be paid
    // out as a lump the moment play resumes.
    if (!isOver && !isPaused) this.accumulator += Math.min(deltaMs / 1000, MAX_FRAME_SECONDS);
    else this.accumulator = 0;

    const input = this.inputController.read();

    if (!isOver) {
      if (!isPaused && this.supernaturalSystem) {
        this.supernaturalSystem.update(deltaMs / 1000, _time, input.ability);
      }
      while (this.accumulator >= PHYSICS_STEP) {
        const abilityBoost = this.supernaturalSystem?.abilityBoost ?? 1.0;
        this.session.step(PHYSICS_STEP, input, abilityBoost);
        this.accumulator -= PHYSICS_STEP;
      }
    }

    // A confirmed player-opponent contact fails the challenge inside the step.
    // Play the impact here, before the failure handoff, so the screen shake
    // reads as the cause rather than an effect that appears out of nowhere.
    const impact = this.session.consumePlayerCollision();
    if (impact) this.playImpactEffect(impact.impact);

    // 1. Player view: full effects.
    const player = this.session.player;

    const speed = player.physics.speed;
    const racing = race.isRacing;
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
    } else if (hud.state === 'paused') {
      // The view holds exactly where it was: a paused race that drifted under
      // the player is a race that does not look paused.
    } else {
      this.cameraRig.update(player.physics, speed, deltaMs, twist);
    }

    if (this.rainEmitter) {
      this.rainEmitter.setPosition(this.cameras.main.scrollX + this.cameras.main.width / 2, this.cameras.main.scrollY);
    }

    // The flash belongs to the moment the lights go out. A lap transition is
    // still a live race, so resuming from the card must not flash it again.
    if (this.previousState === 'countdown' && hud.state === 'racing') {
      this.cameras.main.flash(500, 255, 255, 255);
    }

    // Either way the race is over -- completed, or failed because every AI car
    // finished first -- so hand the result to React once, on the transition.
    if (over && this.previousState !== 'finished' && this.previousState !== 'failed') {
      this.finishRace();
    }

    this.previousState = hud.state;

    this.collisionDebug?.update(this.session, player.physics);

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
   * A short jolt for a confirmed collision. Deliberately restrained: the point
   * is to register the hit, not to be a set piece. A heavier impact shakes a
   * little harder, but the range stays small. The crash debris that follows is
   * part of the same moment, so the frozen scene reads as "just crashed".
   */
  private playImpactEffect(impact: number): void {
    const severity = Math.min(1, impact / 360);
    this.cameras.main.shake(IMPACT_SHAKE_MS, IMPACT_SHAKE_INTENSITY * (0.6 + 0.4 * severity));
    this.cameras.main.flash(160, 150, 20, 40, false);
    this.spawnCrashDebris(severity);
  }

  /**
   * One-shot crash debris at the player's car: smoke, sparks and a pair of red
   * tail-light glows. Reuses the shared particle dot and the car's own heading
   * rather than drawing anything new, so the frozen sprite at the collision
   * point is still the car the player was driving.
   *
   * Everything here is cosmetic and self-destroying; it never touches race
   * state, the clock, or the car's physics.
   */
  private spawnCrashDebris(severity: number): void {
    ensureParticleTexture(this);
    const { x, y, heading } = this.session.player.physics;
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);

    const smoke = this.add
      .particles(x, y, 'particle-dot', {
        speed: { min: 8, max: 50 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.5, end: 2.6 },
        alpha: { start: 0.45, end: 0 },
        tint: 0x9a96a8,
        lifespan: { min: 900, max: 1500 },
        quantity: 12,
        emitting: false,
      })
      .setDepth(12);
    smoke.explode(12);
    this.time.delayedCall(1700, () => smoke.destroy());

    const sparks = this.add
      .particles(x, y, 'particle-dot', {
        speed: { min: 80, max: 260 * (0.6 + 0.4 * severity) },
        angle: { min: 0, max: 360 },
        scale: { start: 0.55, end: 0 },
        alpha: { start: 0.9, end: 0 },
        tint: 0xff6a3a,
        lifespan: { min: 300, max: 650 },
        quantity: 16,
        blendMode: 'ADD',
        emitting: false,
      })
      .setDepth(12);
    sparks.explode(16);
    this.time.delayedCall(900, () => sparks.destroy());

    // Tail-light glows left burning at the rear corners, matching the brake
    // lights CarView draws, so the parked car still reads as "crashed".
    const rearX = x - cos * 15;
    const rearY = y - sin * 15;
    for (const side of [-1, 1]) {
      const glow = this.add
        .image(rearX - sin * 8 * side, rearY + cos * 8 * side, 'particle-dot')
        .setDepth(11)
        .setTint(0xff2e3a)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(4)
        .setAlpha(0);
      this.tweens.add({ targets: glow, alpha: 0.7, duration: 220, delay: 60 });
    }
  }

  /**
   * Called once the race is over for any reason -- the player taking the
   * chequered flag, a confirmed collision, or every AI car finishing with the
   * player still on track.
   *
   * The session is the single authority on whether that moment has arrived; this
   * just reacts to the state changing, exactly once. A failed race uses a
   * shorter handoff so the failure screen follows the impact promptly, and
   * carries the outcome through so the results screen can tell a failure from a
   * completed race.
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