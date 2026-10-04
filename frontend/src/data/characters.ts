export type CharacterId = 'steve' | 'max' | 'mike' | 'will' | 'dustin';

export interface CharacterStats {
  speed: number;
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
  portrait?: string;
}

export const CHARACTERS: readonly Character[] = [
  { id: 'steve', name: 'STEVE', role: 'Balanced', blurb: 'Steady hands, no weak spots.', accent: '#ff2e63', stats: { speed: 6, handling: 6, nitro: 5, awareness: 6 } },
  { id: 'max', name: 'MAX', role: 'Speed / Handling', blurb: 'Fast lines, razor-sharp turns.', accent: '#ff5c8a', stats: { speed: 8, handling: 8, nitro: 4, awareness: 5 } },
  { id: 'mike', name: 'MIKE', role: 'Strategy', blurb: 'Plans every lap before the lights.', accent: '#9b5cff', stats: { speed: 5, handling: 6, nitro: 5, awareness: 7 } },
  { id: 'will', name: 'WILL', role: 'Awareness', blurb: 'Senses trouble before it shows.', accent: '#6c7bff', stats: { speed: 5, handling: 6, nitro: 5, awareness: 9 } },
  { id: 'dustin', name: 'DUSTIN', role: 'Nitro / Tech', blurb: 'Tinkers with anything that burns.', accent: '#ffb02e', stats: { speed: 5, handling: 5, nitro: 9, awareness: 6 } },
];
