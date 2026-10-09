export type CharacterId = 'steve' | 'max' | 'mike' | 'will' | 'dustin';

export interface CharacterStats {
  speed: number;
  acceleration: number;
  handling: number;
  nitro: number;
  awareness: number;
}

/** Fan-project placeholder driver. `portrait` is reserved for real artwork later. */
export interface Character {
  id: CharacterId;
  name: string;
  role: string;
  blurb: string;
  accent: string;
  stats: CharacterStats;
  ability: string;
  portrait?: string;
  abilityDesc?: string;
}

export const CHARACTERS: readonly Character[] = [
  { id: 'will', name: 'WILL', role: 'THE CLERIC', blurb: 'Sensitive to the Upside Down. Anticipates danger before it arrives.', accent: '#11cc33', stats: { speed: 6, acceleration: 6, handling: 6, nitro: 5, awareness: 6 }, ability: 'TRUE SIGHT', abilityDesc: 'Briefly highlights shortcuts and hazards on the track.' },
  { id: 'max', name: 'MAX', role: 'THE SKATER', blurb: 'Fast lines, razor-sharp turns.', accent: '#ff5c8a', stats: { speed: 8, acceleration: 7, handling: 8, nitro: 4, awareness: 5 }, ability: 'SKATE BOOST', abilityDesc: 'Provides a short burst of acceleration.' },
  { id: 'mike', name: 'MIKE', role: 'THE STRATEGIST', blurb: 'Plans every lap before the lights.', accent: '#9b5cff', stats: { speed: 5, acceleration: 6, handling: 6, nitro: 5, awareness: 7 }, ability: 'PARTY SIGNAL', abilityDesc: 'Reveals nearby opponents and track information.' },
  { id: 'dustin', name: 'DUSTIN', role: 'THE INVENTOR', blurb: 'Tinkers with anything that burns.', accent: '#ffb02e', stats: { speed: 5, acceleration: 9, handling: 5, nitro: 9, awareness: 6 }, ability: 'SUPERCHARGE', abilityDesc: 'Boosts nitro recovery for a limited duration.' },
];
