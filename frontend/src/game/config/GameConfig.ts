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
  supernaturalUpdate: 'race:supernaturalUpdate',
  supernaturalEvent: 'race:supernaturalEvent',
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
  ability: ['F', 'E'],
  restart: ['R'],
  camera: ['C', 'V'],
  pause: ['P'],
  /** Mutes and unmutes race audio. The preference persists between races. */
  mute: ['M'],
  /** Development-only collision overlay. Ignored in a production build. */
  debug: ['B'],
} as const;

/**
 * The car body, in the units the world is measured in.
 *
 * Handling (top speed, acceleration, braking, steering, grip) is NOT here: it
 * lives in `config/carTuning`, one entry per chassis. This block used to hold a
 * second, unread copy of the same numbers, so the two could never agree.
 */
export const CAR = {
  /** Chassis size on screen, before `footprintPadding`. */
  width: 60,
  height: 30,
  /**
   * How far past the chassis the wheels and shadow reach. It counts as part of
   * the car for track-edge collision, so the whole car stays on the road
   * instead of letting a wheel clip through the kerb.
   */
  footprintPadding: 6,
  /**
   * How fast the wall assist eases a car straight while it is against the edge
   * (rad/s). Deliberately gentle: it should nudge the nose back toward the road,
   * not wrestle the wheel off the driver.
   */
  wallAssistRate: 1.2,
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

/**
 * Car-to-car collision. The extents match the visible top-down sprite, which
 * `CarView` scales to 84px wide (half-length 42). Those sprites are about 0.454
 * as tall as they are wide, so the car is roughly 38px across (half-width 19).
 * A single pair of numbers is used for every car: the four chassis sprites are
 * within a few percent of each other, and keeping one box means the hitbox is
 * always the same as the thing drawn on screen.
 */
export const COLLISION = {
  /** Half the car's length, along its heading. */
  halfLength: 42,
  /** Half the car's width, across its heading. */
  halfWidth: 19,
  /**
   * Penetration (px) required before an overlap counts as a confirmed contact.
   * Cars are pushed apart to exactly touching each step, so a resting pair reads
   * as zero overlap. This filters out the sub-pixel tangential rub that AI lane
   * wander produces -- a real hit, where one car drives into another, buries
   * several pixels deep in a single step.
   */
  contactEpsilon: 1.5,
  /**
   * Closing speed (px/s) that also confirms a contact, for a fast sideswipe
   * that never gets deep. Below both this and `contactEpsilon` the two cars are
   * merely brushing, which must not end the challenge.
   */
  contactSpeed: 160,
  /** Closing speed (px/s) that reads as a full-severity head-on hit. */
  severeSpeed: 360,
  /** Bounce returned on the gentlest touch. */
  minRestitution: 0.05,
  /** Bounce returned at full severity. */
  maxRestitution: 0.35,
  /**
   * Fraction of speed two cars keep per SECOND at full severity.
   *
   * A per-second rate, not a per-contact fraction: contact is resolved on every
   * physics step, so a per-contact number made the same shunt several times as
   * punishing at 120Hz as at 40Hz and left two touching cars pinned together
   * with no speed at all.
   */
  speedRetainedPerSecond: 0.65,
} as const;

/**
 * Challenge scoring thresholds, in milliseconds for the whole race.
 *
 * Deliberately global rather than per-track: no track carries its own target
 * time, and inventing per-track rules would make identical driving earn a
 * different star rating for no stated reason. Tune the two numbers here.
 */
export const CHALLENGE = {
  /**
   * 3 stars: finish the required laps at or under this time. The reference AI
   * driver laps the five tracks in roughly 63-105s, so this rewards driving at
   * or near its pace.
   */
  targetTimeMs: 100_000,
  /** 2 stars: finish at or under this time. Slower still earns 1 star. */
  acceptableTimeMs: 140_000,
} as const;

export const CAMERA = {
  /** Frame-rate independent follow smoothing (higher = snappier). */
  follow: 12,
  /**
   * How hard the view is pulled toward the car's heading once it has turned past
   * the dead zone (1/s). Deliberately gentle: the world eases round *after* the
   * car instead of snapping to it, so a turn reads as the car moving and the
   * view smoothly following.
   */
  rotateGain: 4,
  /**
   * Ceiling on how fast the view may turn (rad/s). Set just above the fastest
   * car's turn rate, so it never holds the camera back in a normal corner but
   * still stops a sudden heading flip from whipping the world around.
   */
  maxRotateSpeed: 3.6,
  /**
   * Camera presets, cycled with CONTROLS.camera.
   *
   * anchor: where the car rests, as a fraction of the visible half-height below
   *   the screen centre (0 = dead centre, 0.5 = three quarters down). A fraction
   *   rather than a world distance, so the car holds the same spot on screen
   *   when the camera pulls back for speed.
   * rotate: turn the world so the car always points up the screen.
   * angleDeadZoneDeg: turning less than this leaves the view completely still,
   *   so straight-line corrections never wobble the background.
   */
  views: [
    { name: 'CHASE', anchor: 0.15, zoom: 0.85, rotate: true, angleDeadZoneDeg: 6 },
    { name: 'HOOD', anchor: 0.1, zoom: 1.1, rotate: true, angleDeadZoneDeg: 4 },
    // Overhead map: no rotation, the car just sits in the middle of the frame.
    { name: 'MAP', anchor: 0, zoom: 0.5, rotate: false, angleDeadZoneDeg: 0 },
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
