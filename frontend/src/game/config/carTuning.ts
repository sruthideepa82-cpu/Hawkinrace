import type { CarId } from '../../data/cars';
import type { CharacterStats } from '../../data/characters';

/**
 * Everything that decides how a car behaves. Units: pixels and seconds.
 *
 * This is the single source of truth for handling. `CarPhysics` used to hardcode
 * the steering-wheel rates, the brake/reverse switch point and the barrier
 * scrub, while a second, unused copy of the same numbers sat in `GameConfig.CAR`.
 * Every value the car model reads now comes from here, so a chassis difference
 * is one edit in this file rather than a hunt through the physics.
 */
export interface CarTuning {
  /** Top speed on clean asphalt (px/s). */
  maxSpeed: number;
  /** Peak forward acceleration (px/s^2), tapering as the car nears max speed. */
  acceleration: number;
  /** Deceleration under the brake pedal (px/s^2). */
  brakeForce: number;
  /** Constant deceleration when the throttle is released (px/s^2). */
  coastFriction: number;
  /** Speed-proportional coasting drag (1/s). */
  drag: number;
  /** Hard cap on reverse speed (px/s). */
  maxReverseSpeed: number;
  /** Reverse acceleration (px/s^2). */
  reverseAcceleration: number;
  /**
   * Forward speed (px/s) at or below which the brake pedal stops braking and
   * starts reversing. Above it the pedal is a brake; the car always has to come
   * to a stop before it can go backwards.
   */
  reverseSwitchSpeed: number;
  /** Yaw rate (rad/s) at full lock and ideal speed. */
  steerRate: number;
  /** How fast the wheel turns toward the key (full lock in 1/x s). */
  steerResponse: number;
  /**
   * How fast the wheel self-centres when the key is released (1/x s). Higher
   * than `steerResponse`, so letting go straightens the car instead of leaving
   * it holding the lock it had on the last input.
   */
  steerReturn: number;
  /** Speed at which steering is most effective, as a fraction of maxSpeed. */
  steerPeakSpeedRatio: number;
  /**
   * Steering authority a car creeping along still has (0-1). A car pressed
   * nose-first into a barrier has all of its speed killed, so without any
   * authority here it could never rotate off the wall.
   */
  lowSpeedSteerFloor: number;
  /** Steering authority given up at top speed (0-1). */
  highSpeedSteerLoss: number;
  /** Sideways velocity decay (1/s). Higher = grippier, lower = driftier. */
  lateralGrip: number;
  /**
   * Fraction of speed a car keeps per SECOND while grinding along a barrier.
   * Time-based on purpose: a per-contact multiplier makes the same scrape
   * three times as strong at 120Hz as it is at 40Hz, which is how sliding
   * along a wall used to stop a car dead.
   */
  wallFriction: number;
  /** Bounce returned by a barrier hit square on (0-1). */
  wallBounce: number;
  /** Top-speed multiplier while nitro is engaged. */
  nitroSpeedBoost: number;
  /** Acceleration multiplier while nitro is engaged. */
  nitroAccelBoost: number;
  /** Nitro seconds available per lap. */
  nitroCapacity: number;
  /** Nitro seconds consumed per second of use. */
  nitroDrain: number;
  /** Nitro seconds regained per second. */
  nitroRegen: number;
}

type HandlingOverrides = Partial<
  Pick<
    CarTuning,
    | 'steerResponse'
    | 'steerReturn'
    | 'reverseSwitchSpeed'
    | 'lowSpeedSteerFloor'
    | 'highSpeedSteerLoss'
    | 'wallFriction'
    | 'wallBounce'
  >
>;

const BASE_TUNING: Omit<CarTuning, keyof HandlingOverrides> = {
  maxSpeed: 600,
  acceleration: 200,       // Smooth, progressive buildup
  brakeForce: 600,         // Strong intentional braking
  coastFriction: 30,       // Gradual slowdown when the throttle is released
  drag: 0.1,               // Momentum preservation
  maxReverseSpeed: 200,    // ~33% of max speed
  reverseAcceleration: 150,
  steerRate: 3.0,          // Yaw rate at full lock and ideal speed
  steerPeakSpeedRatio: 0.4,// Speed at which steering is most effective
  lateralGrip: 4.0,
  nitroSpeedBoost: 1.22,
  nitroAccelBoost: 1.9,
  nitroCapacity: 3.0,
  nitroDrain: 1,
  nitroRegen: 0.22,
};

/**
 * Shared handling model. Chassis differ in it, so a nimble car answers the
 * wheel quicker, centres it faster and keeps more rotation authority when it is
 * barely moving or pinned against a barrier.
 */
const BASE_HANDLING: Required<HandlingOverrides> = {
  steerResponse: 5.0,
  steerReturn: 8.0,
  reverseSwitchSpeed: 20,
  lowSpeedSteerFloor: 0.4,
  highSpeedSteerLoss: 0.5,
  wallFriction: 0.55,
  wallBounce: 0.1,
};

/** Base character of each chassis, before driver stats are layered on. */
export const VEHICLE_CONFIG: Record<CarId, CarTuning> = {
  'apex-vulcan': {
    ...BASE_TUNING,
    ...BASE_HANDLING,
    acceleration: 200,      // Smooth, progressive buildup
    steerRate: 3.0,         // Smooth responsive rotation
    lateralGrip: 4.0,       // Subtle slide
    nitroSpeedBoost: 1.22,
    nitroAccelBoost: 1.9,
    nitroCapacity: 3.0,
  },
  'venom-verde': {
    ...BASE_TUNING,
    ...BASE_HANDLING,
    maxSpeed: 550,
    acceleration: 250,      // Quicker acceleration
    brakeForce: 650,
    coastFriction: 35,
    maxReverseSpeed: 180,
    steerRate: 3.5,         // Better handling
    lateralGrip: 5.0,
    // The sharpest chassis: quickest wheel, fastest self-centring, and the most
    // rotation authority left at a crawl so it can always steer itself out.
    steerResponse: 7.0,
    steerReturn: 11.0,
    lowSpeedSteerFloor: 0.45,
    wallFriction: 0.6,
    nitroSpeedBoost: 1.2,
    nitroAccelBoost: 2.0,
    nitroCapacity: 2.6,
  },
  'shadow-gt': {
    ...BASE_TUNING,
    ...BASE_HANDLING,
    maxSpeed: 650,
    acceleration: 220,
    brakeForce: 580,
    coastFriction: 32,
    maxReverseSpeed: 200,
    steerRate: 3.2,
    lateralGrip: 4.5,
    steerResponse: 5.6,
    steerReturn: 9.0,
    nitroSpeedBoost: 1.25,
    nitroAccelBoost: 1.95,
    nitroCapacity: 3.5,
  },
  'inferno-rs': {
    ...BASE_TUNING,
    ...BASE_HANDLING,
    maxSpeed: 700,          // Higher top speed
    acceleration: 180,      // Needs more space
    brakeForce: 500,        // Weaker brakes
    coastFriction: 25,
    drag: 0.08,
    maxReverseSpeed: 220,
    steerRate: 2.2,         // Weaker handling
    lateralGrip: 3.0,       // Slides more
    // Heavy and slow to turn in: the laziest wheel, the longest reverse
    // handover and the least rotation authority of the four, which is what
    // makes it feel like the car you have to set up early.
    steerResponse: 3.6,
    steerReturn: 6.0,
    reverseSwitchSpeed: 26,
    lowSpeedSteerFloor: 0.35,
    highSpeedSteerLoss: 0.6,
    wallFriction: 0.45,
    wallBounce: 0.06,
    nitroSpeedBoost: 1.3,
    nitroAccelBoost: 1.8,
    nitroCapacity: 4.2,
  },
};

/** 1-10 stat -> multiplier. 6 is neutral. */
const scale = (stat: number, strength: number): number =>
  1 + (stat - 6) * strength;

/**
 * Layers a driver's stats on top of a chassis so every racer feels different:
 * a high-speed driver in a heavy car still loses to a light one on twisty roads.
 *
 * `statWeight` scales how far the driver's stats move the car away from neutral
 * (6). The player's car uses the full 1, so the driver they picked feels exactly
 * as advertised. Opponents use a reduced weight -- see `AI_STAT_WEIGHT`.
 */
export function createRacerTuning(
  carId: string,
  stats: CharacterStats,
  statWeight: number = 1,
): CarTuning {
  const base = VEHICLE_CONFIG[carId as CarId] ?? VEHICLE_CONFIG['apex-vulcan'];
  const blend = (stat: number) => 6 + (stat - 6) * statWeight;
  return {
    ...base,
    maxSpeed: base.maxSpeed * scale(blend(stats.speed), 0.022),
    acceleration: base.acceleration * scale(blend(stats.acceleration), 0.03),
    steerRate: base.steerRate * scale(blend(stats.handling), 0.035),
    lateralGrip: base.lateralGrip * scale(blend(stats.handling), 0.05),
    // Handling moves the wheel as well as the chassis: a nimble driver turns
    // the wheel faster and centres it faster, which is what makes the same
    // corner feel different rather than merely faster.
    steerResponse: base.steerResponse * scale(blend(stats.handling), 0.04),
    steerReturn: base.steerReturn * scale(blend(stats.handling), 0.04),
    nitroCapacity: base.nitroCapacity * scale(blend(stats.nitro), 0.09),
  };
}

export function getCarTuning(id: string): CarTuning {
  return VEHICLE_CONFIG[id as CarId] ?? VEHICLE_CONFIG['apex-vulcan'];
}