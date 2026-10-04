export interface Point {
  x: number;
  y: number;
}

/** Data-only description of a track so more tracks can be added later. */
export interface TrackDefinition {
  id: string;
  name: string;
  worldWidth: number;
  worldHeight: number;
  roadWidth: number;
  /** Closed loop of control points, driven in order. */
  controlPoints: readonly Point[];
  /** Samples per control-point segment when smoothing the loop. */
  samplesPerSegment: number;
  /** Index of the sampled centerline point where the finish line sits. */
  finishSampleOffset: number;
  /** How many samples behind the finish line the car spawns. */
  spawnSamplesBehind: number;
  checkpointCount: number;
}

export const HAWKINS_STREETS: TrackDefinition = {
  id: 'hawkins-streets',
  name: 'Hawkins Streets',
  worldWidth: 2700,
  worldHeight: 1900,
  roadWidth: 200,
  controlPoints: [
    { x: 900, y: 1450 },
    { x: 1500, y: 1450 },
    { x: 2050, y: 1420 },
    { x: 2350, y: 1150 },
    { x: 2300, y: 780 },
    { x: 1950, y: 560 },
    { x: 1550, y: 620 },
    { x: 1300, y: 850 },
    { x: 950, y: 900 },
    { x: 650, y: 700 },
    { x: 400, y: 850 },
    { x: 350, y: 1200 },
    { x: 550, y: 1420 },
  ],
  samplesPerSegment: 24,
  finishSampleOffset: 30,
  spawnSamplesBehind: 7,
  checkpointCount: 4,
};

/** Every playable track, keyed by id. Add new tracks here. */
export const TRACKS: Readonly<Record<string, TrackDefinition>> = {
  [HAWKINS_STREETS.id]: HAWKINS_STREETS,
};

export function getTrackDefinition(id: string): TrackDefinition {
  return TRACKS[id] ?? HAWKINS_STREETS;
}
