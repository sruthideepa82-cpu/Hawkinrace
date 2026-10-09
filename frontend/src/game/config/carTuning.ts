import type { CarId } from '../../data/cars';
import type { CharacterStats } from '../../data/characters';

/** Everything that decides how a car behaves. Units: pixels and seconds. */
export interface CarTuning {
  maxSpeed: number;
  acceleration: number;
  brakeForce: number;
  coastFriction: number;
  drag: number;
  maxReverseSpeed: number;
  reverseAcceleration: number;
  steerRate: number;
  lateralGrip: number;
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

const BASE_TUNING: Omit<CarTuning, 'maxSpeed' | 'acceleration' | 'steerRate' | 'lateralGrip' | 'nitroSpeedBoost' | 'nitroAccelBoost' | 'nitroCapacity'> = {
  brakeForce: 600,        // Strong intentional braking
  coastFriction: 30,      // Gradual slowdown when throttle released
  drag: 0.1,              // Momentum preservation
  maxReverseSpeed: 200,   // ~33% of max speed
  reverseAcceleration: 150,
  nitroDrain: 1,
  nitroRegen: 0.22,
};

/** Base character of each chassis, before driver stats are layered on. */
export const VEHICLE_CONFIG: Record<CarId, CarTuning> = {
  'apex-vulcan': {
    ...BASE_TUNING,
    maxSpeed: 600,
    acceleration: 200,      // Smooth, progressive buildup
    steerRate: 3.0,         // Smooth responsive rotation
    lateralGrip: 4.0,       // Subtle slide
    nitroSpeedBoost: 1.22,
    nitroAccelBoost: 1.9,
    nitroCapacity: 3.0,
  },
  'venom-verde': {
    ...BASE_TUNING,
    maxSpeed: 550,
    acceleration: 250,      // Quicker acceleration
    brakeForce: 650,
    coastFriction: 35,
    maxReverseSpeed: 180,
    steerRate: 3.5,         // Better handling
    lateralGrip: 5.0,
    nitroSpeedBoost: 1.2,
    nitroAccelBoost: 2.0,
    nitroCapacity: 2.6,
  },
  'shadow-gt': {
    ...BASE_TUNING,
    maxSpeed: 650,
    acceleration: 220,
    brakeForce: 580,
    coastFriction: 32,
    maxReverseSpeed: 200,
    steerRate: 3.2,
    lateralGrip: 4.5,
    nitroSpeedBoost: 1.25,
    nitroAccelBoost: 1.95,
    nitroCapacity: 3.5,
  },
  'inferno-rs': {
    ...BASE_TUNING,
    maxSpeed: 700,          // Higher top speed
    acceleration: 180,      // Needs more space
    brakeForce: 500,        // Weaker brakes
    coastFriction: 25,
    drag: 0.08,
    maxReverseSpeed: 220,
    steerRate: 2.2,         // Weaker handling
    lateralGrip: 3.0,       // Slides more
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
    nitroCapacity: base.nitroCapacity * scale(blend(stats.nitro), 0.09),
  };
}

export function getCarTuning(id: string): CarTuning {
  return VEHICLE_CONFIG[id as CarId] ?? VEHICLE_CONFIG['apex-vulcan'];
}