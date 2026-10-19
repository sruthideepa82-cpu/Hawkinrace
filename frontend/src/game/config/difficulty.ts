/**
 * AI difficulty.
 *
 * Difficulty is a set of multipliers applied to every `AiProfile`, not a label.
 * Each field below changes something the driver actually does -- how fast it
 * carries a corner, whether it commits to a pass, how often it burns nitro, how
 * far off the ideal line it is allowed to wander, and how long it takes to
 * notice something has changed. Nothing here changes the physics or the
 * checkpoints; it only changes the decisions.
 *
 * The difficulty also sets how many cars are on the grid, so an easy race is
 * easier on two axes at once: fewer rivals to beat, and rivals that race worse.
 */

import type { AiProfile } from './racers';

export type DifficultyId = 'easy' | 'normal' | 'hard';

export interface Difficulty {
  id: DifficultyId;
  name: string;
  description: string;
  /** Cars on the grid, player included. */
  fieldSize: number;
  /** Multiplier on the AI's peak speed fraction. */
  pace: number;
  /** Multiplier on the corner speed the AI dares carry. */
  cornerConfidence: number;
  /** Multiplier on how often the AI commits to a nitro burst. */
  nitroEagerness: number;
  /** Multiplier on how readily the AI leaves the ideal line to pass. */
  overtaking: number;
  /**
   * Multiplier on the reaction interval -- how long between lane decisions.
   * Higher means the AI re-reads the road less often, which shows up as it
   * committing to a line a little too late.
   */
  reaction: number;
  /**
   * Multiplier on how far off the centreline the AI is willing to sit. Higher
   * means a sloppier line, which costs it time in the corners it does not even
   * know it is taking.
   */
  lineBias: number;
  /**
   * Multiplier on the corner-confidence cap itself, applied on top of
   * `cornerConfidence`. Kept separate because it is the difference between
   * "drives slower" and "runs wide enough to lose the racing line".
   */
  grip: number;
}

/**
 * `easy` is deliberately not just a slower `normal`. Each multiplier is chosen
 * so the AI looks and behaves like a weaker driver: it carries less corner
 * speed, sweeps wider, reacts later, passes less often and spends its nitro
 * sparingly. `hard` is the same policy run with a much higher appetite.
 *
 * `fieldSize` is clamped to the roster (see `racers.RACER_COUNT`), so a
 * difficulty can never ask for more drivers than exist.
 */
export const DIFFICULTIES: Readonly<Record<DifficultyId, Difficulty>> = {
  easy: {
    id: 'easy',
    name: 'EASY',
    description: 'Two rivals, slower and wider. A place to learn the road.',
    fieldSize: 3,
    pace: 0.82,
    cornerConfidence: 0.9,
    nitroEagerness: 0.4,
    overtaking: 0.55,
    reaction: 1.6,
    lineBias: 1.4,
    grip: 0.94,
  },
  normal: {
    id: 'normal',
    name: 'NORMAL',
    description: 'The full grid at the drivers\u2019 intended pace.',
    fieldSize: 4,
    pace: 1,
    cornerConfidence: 1,
    nitroEagerness: 1,
    overtaking: 1,
    reaction: 1,
    lineBias: 1,
    grip: 1,
  },
  hard: {
    id: 'hard',
    name: 'HARD',
    description: 'The full grid racing over the driver\u2019s head. Nitro comes early.',
    fieldSize: 4,
    pace: 1.05,
    cornerConfidence: 1.03,
    nitroEagerness: 1.75,
    overtaking: 1.25,
    reaction: 0.7,
    lineBias: 0.9,
    grip: 1.03,
  },
};

export const DIFFICULTY_ORDER: readonly DifficultyId[] = ['easy', 'normal', 'hard'];

export function getDifficulty(id: string | null | undefined): Difficulty {
  return (id && DIFFICULTIES[id as DifficultyId]) || DIFFICULTIES.normal;
}

/**
 * Applies a difficulty to one driver's profile.
 *
 * Every multiplier is clamped, so a bad difficulty entry degrades the AI
 * instead of inverting it: a cornerConfidence above 1 cannot make a driver take
 * a corner faster than the tyre model says is possible, and `grip` is capped
 * below the understeer limit so a hard AI still cannot simply wash wide.
 */
export function scaleAiProfile(profile: AiProfile, difficulty: Difficulty): AiProfile {
  return {
    ...profile,
    pace: profile.pace * difficulty.pace,
    cornerConfidence: profile.cornerConfidence * difficulty.cornerConfidence,
    nitroEagerness: profile.nitroEagerness * difficulty.nitroEagerness,
    overtaking: profile.overtaking * difficulty.overtaking,
    lineBias: profile.lineBias * difficulty.lineBias,
    // Reaction scales the decision interval, which lives in AiDriver. It is
    // carried on the profile so the driver reads one object.
    reaction: difficulty.reaction,
    // The corner-speed ceiling the driver will accept. Capped at 1: past that
    // the car understeers off the road whatever the steering controller does.
    grip: Math.min(1, difficulty.grip),
  };
}