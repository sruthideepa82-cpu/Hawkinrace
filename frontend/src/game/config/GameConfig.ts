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
  restart: ['R'],
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
  zoom: 0.9,
  lerp: 0.09,
} as const;
