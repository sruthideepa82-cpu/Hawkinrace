import type { CharacterId, CharacterStats } from '../../data/characters';
import { CHARACTERS } from '../../data/characters';

/** Default for any id that is not in the roster. */
const FALLBACK: CharacterStats = { speed: 6, acceleration: 6, handling: 6, nitro: 5, awareness: 6 };

/**
 * Driver stats keyed by character id, for `createRacerTuning`. Kept in game/
 * config so the physics layer never has to walk the UI roster itself.
 */
const BY_ID = new Map<CharacterId, CharacterStats>(CHARACTERS.map((c) => [c.id, c.stats]));

export function getCharacterStats(id: string): CharacterStats {
  return BY_ID.get(id as CharacterId) ?? FALLBACK;
}