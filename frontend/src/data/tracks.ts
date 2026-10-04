export type TrackId = 'hawkins-streets' | 'starcourt-run' | 'hawkins-forest' | 'hawkins-lab' | 'upside-down';

export interface TrackInfo {
  id: TrackId;
  name: string;
  description: string;
  difficulty: string;
  weather: string;
  /** Best lap-set time in ms; null until persistence exists. */
  bestTimeMs: number | null;
  playable: boolean;
}

export const TRACKS: readonly TrackInfo[] = [
  { id: 'hawkins-streets', name: 'HAWKINS STREETS', description: 'Race through the neon-lit streets of Hawkins.', difficulty: 'Medium', weather: 'Clear Night', bestTimeMs: null, playable: true },
  { id: 'starcourt-run', name: 'STARCOURT RUN', description: 'Mall lights and tight turns.', difficulty: 'Medium', weather: 'Clear', bestTimeMs: null, playable: false },
  { id: 'hawkins-forest', name: 'HAWKINS FOREST', description: 'Dark trees, narrow trails.', difficulty: 'Hard', weather: 'Fog', bestTimeMs: null, playable: false },
  { id: 'hawkins-lab', name: 'HAWKINS LAB', description: 'Restricted grounds, no mistakes.', difficulty: 'Hard', weather: 'Storm', bestTimeMs: null, playable: false },
  { id: 'upside-down', name: 'THE UPSIDE DOWN', description: 'Nothing here is as it seems.', difficulty: 'Extreme', weather: 'Spores', bestTimeMs: null, playable: false },
];
