import { CHALLENGE } from '../config/GameConfig';

/** Most stars a run can earn. */
export const MAX_STARS = 3;

/**
 * Stars for a completed run, from its total race time.
 *
 * Only called for a run that finished every lap without a collision, which is
 * why there is no "zero star" case here: completing the challenge at all is
 * worth a star. Thresholds live in `CHALLENGE` in GameConfig.
 */
export function starsForTime(timeMs: number): number {
  if (timeMs <= CHALLENGE.targetTimeMs) return 3;
  if (timeMs <= CHALLENGE.acceptableTimeMs) return 2;
  return 1;
}
