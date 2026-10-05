import type { Car, CarId } from '../../data/cars';
import { CARS } from '../../data/cars';
import type { Character, CharacterId } from '../../data/characters';
import { CHARACTERS } from '../../data/characters';

export const RACER_COUNT = 4;

/** How an AI driver races. Nothing here is scripted per-frame: it is steering policy. */
export interface AiProfile {
  /** Multiplies the corner speed the driver dares to carry. */
  cornerConfidence: number;
  /** Peak speed the driver will attempt as a fraction of the car's max. */
  pace: number;
  /** 0..1 chance per decision tick of committing to a nitro burst. */
  nitroEagerness: number;
  /** How readily the driver will leave the ideal line to pass. */
  overtaking: number;
  /** Seconds of low speed before the driver tries to reverse out. */
  stuckSeconds: number;
  /** Preferred line offset from the centre, as a fraction of half the road. */
  lineBias: number;
  /** Per-driver variation so the same car does not drive identically. */
  seed: number;
}

/**
 * `pace` and `cornerConfidence` are deliberately kept within a couple of percent
 * of each other. They multiply straight into corner speed, so a wide spread here
 * is a guaranteed win before the race starts -- and it compounded with the
 * chassis and driver-stat advantages. These four drivers are separated by the
 * axes that actually change *how* a race looks: where they run on the road, how
 * eagerly they commit to a pass, and how much nitro they burn.
 */
const AI_PROFILES: Record<string, AiProfile> = {
  max:   { cornerConfidence: 0.99, pace: 0.99, nitroEagerness: 0.30, overtaking: 0.88, stuckSeconds: 1.0, lineBias:  0.20, seed: 0.11 },
  mike:  { cornerConfidence: 1.00, pace: 1.00, nitroEagerness: 0.44, overtaking: 0.72, stuckSeconds: 0.8, lineBias: -0.24, seed: 0.37 },
  dustin:{ cornerConfidence: 0.98, pace: 0.98, nitroEagerness: 0.80, overtaking: 0.96, stuckSeconds: 0.7, lineBias:  0.34, seed: 0.63 },
  steve: { cornerConfidence: 0.99, pace: 0.99, nitroEagerness: 0.45, overtaking: 0.76, stuckSeconds: 0.9, lineBias: 0.0,  seed: 0.50 },
};

export function getAiProfile(characterId: string): AiProfile {
  return AI_PROFILES[characterId] ?? AI_PROFILES.steve;
}

/** One car on the grid. */
export interface RacerConfig {
  characterId: CharacterId;
  characterName: string;
  /** Accent colour as 0xRRGGBB, used for the car's paint. */
  color: number;
  carId: CarId;
  carName: string;
  isPlayer: boolean;
  /** Player cars keep their chosen look; AI get distinct paint from their driver. */
  stats: { speed: number; acceleration: number; handling: number };
}

/**
 * Paint colours for the AI grid. Deliberately distinct from the chassis default
 * so four cars are readable at a glance even when two share a chassis.
 */
const AI_COLORS: Record<string, number> = {
  max: 0xff5c8a,
  mike: 0x9b5cff,
  dustin: 0xffb02e,
  steve: 0xcc1133,
};

/** Chassis handed to AI opponents: the unused cars first, then a repeat. */
function aiCarFor(index: number, unused: readonly Car[], fallback: Car): Car {
  return unused[index] ?? fallback;
}

/**
 * How far an opponent's driver stats move their car away from neutral.
 *
 * The player's car is spec'd to the driver they picked, at full weight, so the
 * pick always feels real. An opponent at full weight compounds its driver stats
 * with its chassis, and because the best stats and the best chassis both belong
 * to the top of the roster, that compounding is what made one opponent unbeatable
 * regardless of how the race was driven. Halving the influence keeps the cars
 * distinct while leaving the player's own choices the thing that decides the
 * grid's strength.
 */
export const AI_STAT_WEIGHT = 0.5;

/**
 * Rotation applied to the AI field, keyed on the player's own roster position.
 *
 * The player takes one driver and one car; the AI take the rest. Dealing those
 * out in list order was not neutral: the same driver kept landing on the same
 * chassis in every race, so on a twisty track the driver who happened to be
 * first -- and who had the strongest stats besides -- won every race no matter
 * how well anyone drove. Rotating by the player's index means a different driver
 * inherits the front-running chassis each time, and each driver's own stats
 * decide the rest.
 *
 * It is keyed on the roster index rather than a hash on the id strings because
 * that distributes exactly: over all five player choices, every driver ends up
 * with every chassis the same number of times, and appears in the field the same
 * number of times. A string hash spreads things *on average* but leaves real
 * gaps -- which showed up as one driver sitting in 165 of 225 races and another
 * in 105.
 */
function fieldRotation(character: Character): number {
  const index = CHARACTERS.findIndex((c) => c.id === character.id);
  return index < 0 ? 0 : index;
}

/** Cyclically shifts a list, so a different element lands in each slot. */
function rotate<T>(items: readonly T[], by: number): T[] {
  const n = items.length;
  if (n === 0) return [];
  const shift = ((by % n) + n) % n;
  return items.map((_, i) => items[(i + shift) % n]);
}

/**
 * Picks the AI field: three of the four drivers the player did not choose.
 *
 * Four drivers want three slots, so exactly one is left out on any given grid.
 * Roster order made that always the same driver for a given player pick, so that
 * driver rarely raced at all. Rotating the remaining roster by the player's own
 * index spreads it evenly: across all five player choices every driver sits out
 * exactly once, so each appears in three of five grids.
 */
function pickOpponents(character: Character, rotation: number): Character[] {
  const remaining = CHARACTERS.filter((c) => c.id !== character.id);
  return rotate(remaining, rotation).slice(0, RACER_COUNT - 1);
}

/**
 * Builds the four-car grid. The player keeps the car and driver they chose; the
 * AI field is filled from the drivers they did NOT pick, driving the cars they
 * did not choose (repeating a chassis if the garage runs out).
 */
export function buildGrid(character: Character, car: Car): RacerConfig[] {
  const racers: RacerConfig[] = [{
    characterId: character.id,
    characterName: character.name,
    color: car.color,
    carId: car.id,
    carName: car.name,
    isPlayer: true,
    stats: { speed: car.stats.speed, acceleration: car.stats.acceleration, handling: car.stats.handling },
  }];

  const rotation = fieldRotation(character);
  const unusedCars = rotate(CARS.filter((c) => c.id !== car.id), rotation);
  const opponents = pickOpponents(character, rotation);

  opponents.forEach((opponent, i) => {
    const chassis = aiCarFor(i, unusedCars, car);
    racers.push({
      characterId: opponent.id,
      characterName: opponent.name,
      color: AI_COLORS[opponent.id] ?? chassis.color,
      carId: chassis.id,
      carName: chassis.name,
      isPlayer: false,
      stats: {
        speed: Math.round((chassis.stats.speed + opponent.stats.speed) / 2),
        acceleration: Math.round((chassis.stats.acceleration + opponent.stats.acceleration) / 2),
        handling: Math.round((chassis.stats.handling + opponent.stats.handling) / 2),
      },
    });
  });

  return racers;
}