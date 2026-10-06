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

/**
 * STARCOURT RUN: technical and busy, few real straights.
 * 22 points, 320px road. Tightest corner 151px.
 */
export const STARCOURT_RUN: TrackDefinition = {
  id: 'starcourt-run',
  name: 'Starcourt Run',
  worldWidth: 3200,
  worldHeight: 2800,
  roadWidth: 320,
  controlPoints: [
    { x: 2809, y: 1400 },
    { x: 2829, y: 1094 },
    { x: 2569, y: 871 },
    { x: 2282, y: 731 },
    { x: 2025, y: 609 },
    { x: 1737, y: 590 },
    { x: 1478, y: 680 },
    { x: 1221, y: 696 },
    { x: 825, y: 640 },
    { x: 429, y: 761 },
    { x: 364, y: 1092 },
    { x: 582, y: 1400 },
    { x: 738, y: 1615 },
    { x: 785, y: 1844 },
    { x: 929, y: 2057 },
    { x: 1179, y: 2182 },
    { x: 1447, y: 2305 },
    { x: 1774, y: 2425 },
    { x: 2107, y: 2343 },
    { x: 2260, y: 2047 },
    { x: 2309, y: 1787 },
    { x: 2521, y: 1630 },
  ],
  samplesPerSegment: 26,
  finishSampleOffset: 388,
  spawnSamplesBehind: 9,
  checkpointCount: 4,
};

/**
 * HAWKINS FOREST: winding and blind, with the narrowest road in the game at
 * 260px. 24 points. Tightest corner 169px.
 */
export const HAWKINS_FOREST: TrackDefinition = {
  id: 'hawkins-forest',
  name: 'Hawkins Forest',
  worldWidth: 3400,
  worldHeight: 3200,
  roadWidth: 260,
  controlPoints: [
    { x: 2984, y: 1600 },
    { x: 2949, y: 1311 },
    { x: 2740, y: 1081 },
    { x: 2497, y: 912 },
    { x: 2257, y: 766 },
    { x: 1985, y: 682 },
    { x: 1700, y: 732 },
    { x: 1482, y: 899 },
    { x: 1343, y: 1065 },
    { x: 1179, y: 1150 },
    { x: 916, y: 1209 },
    { x: 637, y: 1354 },
    { x: 504, y: 1600 },
    { x: 570, y: 1862 },
    { x: 734, y: 2082 },
    { x: 902, y: 2290 },
    { x: 1099, y: 2499 },
    { x: 1383, y: 2620 },
    { x: 1700, y: 2542 },
    { x: 1917, y: 2300 },
    { x: 2013, y: 2069 },
    { x: 2135, y: 1975 },
    { x: 2410, y: 1954 },
    { x: 2764, y: 1846 },
  ],
  samplesPerSegment: 26,
  finishSampleOffset: 356,
  spawnSamplesBehind: 9,
  checkpointCount: 4,
};

/**
 * HAWKINS LAB: geometric and unforgiving, close to a rounded square.
 * 28 points, 300px road. Tightest corner 183px.
 */
export const HAWKINS_LAB: TrackDefinition = {
  id: 'hawkins-lab',
  name: 'Hawkins Lab',
  worldWidth: 3200,
  worldHeight: 2800,
  roadWidth: 300,
  controlPoints: [
    { x: 2725, y: 1400 },
    { x: 2800, y: 1158 },
    { x: 2678, y: 941 },
    { x: 2448, y: 802 },
    { x: 2217, y: 716 },
    { x: 2007, y: 652 },
    { x: 1806, y: 600 },
    { x: 1600, y: 537 },
    { x: 1359, y: 465 },
    { x: 1092, y: 467 },
    { x: 893, y: 615 },
    { x: 823, y: 852 },
    { x: 792, y: 1056 },
    { x: 664, y: 1211 },
    { x: 475, y: 1400 },
    { x: 400, y: 1642 },
    { x: 522, y: 1859 },
    { x: 752, y: 1998 },
    { x: 983, y: 2084 },
    { x: 1193, y: 2148 },
    { x: 1394, y: 2200 },
    { x: 1600, y: 2263 },
    { x: 1841, y: 2335 },
    { x: 2108, y: 2333 },
    { x: 2307, y: 2185 },
    { x: 2377, y: 1948 },
    { x: 2408, y: 1744 },
    { x: 2536, y: 1589 },
  ],
  samplesPerSegment: 26,
  finishSampleOffset: 98,
  spawnSamplesBehind: 9,
  checkpointCount: 4,
};

/** Every playable track, keyed by id. Add new tracks here. */
export const TRACKS: Readonly<Record<string, TrackDefinition>> = {
  [HAWKINS_STREETS.id]: HAWKINS_STREETS,
  [STARCOURT_RUN.id]: STARCOURT_RUN,
  [HAWKINS_FOREST.id]: HAWKINS_FOREST,
  [HAWKINS_LAB.id]: HAWKINS_LAB,
  [UPSIDE_DOWN.id]: UPSIDE_DOWN,
};

export function getTrackDefinition(id: string): TrackDefinition {
  return TRACKS[id] ?? HAWKINS_STREETS;
}
