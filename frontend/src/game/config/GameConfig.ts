/** Central place for every tunable game constant. */

export const GAME = {
  width: 1280,
  height: 720,
  backgroundColor: '#07060d',
} as const;

export const SCENE_KEYS = {
  game: 'GameScene',
  hud: 'HudScene',
} as const;

export const GAME_EVENTS = {
  hudUpdate: 'hud:update',
  raceFinished: 'race:finished',
} as const;

/**
 * Font stacks for in-game (canvas) text. These must be real CSS font values:
 * a canvas 2D context does not resolve custom properties, so `var(--display)`
 * is rejected by ctx.font and the text silently falls back to 10px sans-serif.
 * Keep them in sync with `--display` / `--mono` in src/index.css.
 */
export const FONTS = {
  display: "'Impact', 'Haettenschweiler', 'Arial Black', sans-serif",
  mono: "'Courier New', monospace",
} as const;

export const COLORS = {
  grass: 0x0c1410,
  grassDetail: 0x101c16,
  roadEdge: 0xff2e63,
  road: 0x1f1f2a,
  roadCenterLine: 0x8a8aa3,
  carBody: 0xff2e63,
  carAccent: 0x9b5cff,
  carWindow: 0x15121f,
  finishLight: 0xf2f2f7,
  finishDark: 0x0b0b10,
} as const;

/** Keyboard bindings (Phaser key names). Edit here to remap controls. */
export const CONTROLS = {
  accelerate: ['W', 'UP'],
  brake: ['S', 'DOWN'],
  steerLeft: ['A', 'LEFT'],
  steerRight: ['D', 'RIGHT'],
  nitro: ['SHIFT', 'SPACE'],
  restart: ['R'],
  camera: ['C', 'V'],
} as const;

/** Base car handling. Units: pixels and seconds. Cars scale these via stats. */
export const CAR = {
  width: 44,
  height: 22,
  maxSpeed: 560,
  maxReverseSpeed: 150,
  /** Peak forward acceleration; fades out as the car nears max speed. */
  acceleration: 480,
  /** Deceleration while braking (S pressed while moving forward). */
  brakeDeceleration: 900,
  reverseAcceleration: 240,
  /** Below this forward speed, holding S reverses instead of braking. */
  reverseSwitchSpeed: 20,
  /** Constant coasting deceleration when no pedal is pressed. */
  coastFriction: 90,
  /** Speed-proportional drag (1/s) while coasting. */
  drag: 0.55,
  /** Sideways velocity decay (1/s). Higher = grippier, lower = driftier. */
  lateralGrip: 7,
  /** Yaw rate (rad/s) at full steering lock and ideal speed. */
  maxSteerRate: 2.7,
  /** Speed at which steering is most effective. */
  steerPeakSpeed: 150,
  /** Steering authority lost at top speed (0-1). */
  highSpeedSteerLoss: 0.4,
  /** How fast the wheel turns toward the key (full lock in 1/x s). */
  steerResponse: 5,
  /** How fast the wheel re-centres when keys are released. */
  steerReturn: 8,
  collisionRadius: 16,
  /** How much speed is lost in a head-on wall hit (0-1). Sliding barely scrubs. */
  wallScrub: 0.6,
  wallBounce: 0.25,
  /** Converts px/s to displayed km/h. */
  speedDisplayFactor: 0.32,
} as const;

/** How 1-10 car stats scale the base handling values. */
export const CAR_STATS = {
  neutral: 6,
  /** Each stat point above/below neutral changes the value by this fraction. */
  step: 0.03,
} as const;

export const RACE = {
  totalLaps: 3,
  countdownSeconds: 3,
} as const;

export const CAMERA = {
  /** Frame-rate independent follow smoothing (higher = snappier). */
  follow: 12,
  /** Same, for the camera's rotation. */
  rotateFollow: 10,
  /**
   * Camera presets, cycled with CONTROLS.camera.
   * lookAhead: world px the camera sits ahead of the car (which keeps the car low
   * in the frame so more road is visible). speedLookAhead: extra px per px/s of
   * speed, so the view reaches further ahead the faster you drive.
   * rotate: turn the world with the car so it always faces up the screen.
   */
  views: [
    { name: 'CHASE', lookAhead: 90, speedLookAhead: 0.22, zoom: 1.1, rotate: true },
    { name: 'HOOD', lookAhead: 40, speedLookAhead: 0.1, zoom: 1.45, rotate: true },
    { name: 'MAP', lookAhead: 0, speedLookAhead: 0, zoom: 0.7, rotate: false },
  ],
  /** Forward speed (px/s) above which the camera pulls back for a speed feel. */
  speedThreshold: 400,
  /** Extra zoom-out applied at high speed. */
  speedZoomOut: 0.05,
  /** How long the zoom eases between the two states (ms). Prevents a hard pop. */
  zoomBlendMs: 250,
  /** One-shot rumble played when the car enters the high-speed range. */
  shakeDuration: 250,
  shakeIntensity: 0.0015,
} as const;
