import { CAR, CAR_STATS } from './GameConfig';

/** A mutable copy of the CAR constants, so each car can be tuned. */
export type CarTuning = { -readonly [K in keyof typeof CAR]: number };

export interface CarStats {
  speed: number;
  acceleration: number;
  handling: number;
}

const scale = (stat: number): number => 1 + (stat - CAR_STATS.neutral) * CAR_STATS.step;

export function createCarTuning(stats?: CarStats): CarTuning {
  const tuning: CarTuning = { ...CAR };
  if (!stats) return tuning;
  tuning.maxSpeed *= scale(stats.speed);
  tuning.acceleration *= scale(stats.acceleration);
  tuning.maxSteerRate *= scale(stats.handling);
  tuning.lateralGrip *= scale(stats.handling);
  return tuning;
}
