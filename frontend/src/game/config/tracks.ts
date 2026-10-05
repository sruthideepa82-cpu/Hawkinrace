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
  /** Optional ranges of track distance (0..1) where the track twists. */
  antiGravityRanges?: readonly { start: number; end: number; twist: number }[];
}

export const HAWKINS_STREETS: TrackDefinition = {
  id: 'hawkins-streets',
  name: 'Hawkins Streets',
  worldWidth: 3600,
  worldHeight: 2800,
  roadWidth: 360, // Wide enough for 4 cars
  controlPoints: [
    { x: 1800, y: 2400 }, // Start/finish
    { x: 1000, y: 2400 }, // Main straight
    { x: 500, y: 2000 },  // 90 right (North)
    { x: 500, y: 1200 },  // Downtown
    { x: 700, y: 700 },   // Curving East
    { x: 1200, y: 600 },  // Intersection
    { x: 1600, y: 400 },  // Curving North-East
    { x: 2200, y: 400 },  // Long straight (East)
    { x: 2800, y: 500 },  // Residential
    { x: 3100, y: 1000 }, // Tight right (South)
    { x: 3100, y: 1600 }, // South straight
    { x: 2600, y: 2200 }, // Final curve
    { x: 2200, y: 2400 }  
  ],
  samplesPerSegment: 32, // More samples for smoother curves on a larger track
  finishSampleOffset: 20,
  spawnSamplesBehind: 12,
  checkpointCount: 4,
};

export const UPSIDE_DOWN: TrackDefinition = {
  id: 'upside-down',
  name: 'The Upside Down',
  worldWidth: 3200,
  worldHeight: 3200,
  roadWidth: 360,
  controlPoints: [
    { x: 1600, y: 2800 },
    { x: 800,  y: 2800 },
    { x: 400,  y: 2400 },
    { x: 400,  y: 1600 }, // Wall ride section
    { x: 800,  y: 800 },
    { x: 1600, y: 400 },  // Ceiling section
    { x: 2400, y: 800 },
    { x: 2800, y: 1600 }, // Drop down
    { x: 2800, y: 2400 },
    { x: 2400, y: 2800 },
  ],
  samplesPerSegment: 40,
  finishSampleOffset: 15,
  spawnSamplesBehind: 10,
  checkpointCount: 4,
  antiGravityRanges: [
    { start: 0.2, end: 0.4, twist: -Math.PI / 6 }, // Drive on left wall
    { start: 0.4, end: 0.6, twist: Math.PI },      // Drive on ceiling (inverted)
    { start: 0.6, end: 0.8, twist: Math.PI / 6 },  // Drive on right wall
  ],
};

/** Every playable track, keyed by id. Add new tracks here. */
export const TRACKS: Readonly<Record<string, TrackDefinition>> = {
  [HAWKINS_STREETS.id]: HAWKINS_STREETS,
  [UPSIDE_DOWN.id]: UPSIDE_DOWN,
};

export function getTrackDefinition(id: string): TrackDefinition {
  return TRACKS[id] ?? HAWKINS_STREETS;
}
