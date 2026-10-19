export type TrackId = 'hawkins-streets' | 'starcourt-run' | 'hawkins-forest' | 'hawkins-lab' | 'upside-down';

export interface TrackInfo {
  id: TrackId;
  name: string;
  description: string;
  difficulty: string;
  weather: string;
  environment: string;
  /** Best lap-set time in ms; null until persistence exists. */
  bestTimeMs: number | null;
  playable: boolean;
}

/**
 * Track list for the selection screen.
 *
 * The `id` values are deliberately unchanged from the original five: they are
 * the keys used by `getTrackDefinition`, by the card art under
 * `/assets/tracks/<id>.png`, and by the existing test harnesses. Renaming them
 * would break all three for no gain, so the display `name` carries the new
 * identity instead.
 */
export const TRACKS: readonly TrackInfo[] = [
  { id: 'hawkins-streets', name: 'HAWKINS TOWN', description: 'Neon-lit suburban streets, house lights and intersections.', difficulty: 'Medium', weather: 'Rain', environment: 'Town', bestTimeMs: null, playable: true },
  { id: 'hawkins-forest', name: 'MIRKWOOD FOREST', description: 'Fog-bound trails through dense pine. Narrow and blind.', difficulty: 'Hard', weather: 'Fog', environment: 'Forest', bestTimeMs: null, playable: true },
  { id: 'upside-down', name: 'THE UPSIDE DOWN', description: 'Corrupted earth, tendrils and floating rock.', difficulty: 'Extreme', weather: 'Spores', environment: 'Corrupted', bestTimeMs: null, playable: true },
  { id: 'starcourt-run', name: 'STARCOURT RUN', description: 'Mall lights and tight, technical turns.', difficulty: 'Medium', weather: 'Clear', environment: 'Mall', bestTimeMs: null, playable: true },
  { id: 'hawkins-lab', name: 'HAWKINS LAB', description: 'Floodlit restricted grounds. No mistakes.', difficulty: 'Hard', weather: 'Storm', environment: 'Industrial', bestTimeMs: null, playable: true },
];
