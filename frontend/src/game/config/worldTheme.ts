/**
 * Per-track visual identity.
 *
 * Everything here is appearance only. Geometry -- where the road goes, how wide
 * it is, where the checkpoints fall -- lives in `config/tracks`, and collision
 * reads that. Keeping the two apart is what stops the road you can see and the
 * road you can drive on drifting apart when a theme is retuned.
 *
 * The props are described as BANDS rather than as a scatter field. A band is a
 * row of props placed at a lateral offset from the centerline, spaced along it.
 * Two reasons:
 *
 *  - It is O(samples x bands) instead of O(candidates x samples). The old
 *    renderer rejected random scatter by measuring every candidate against the
 *    whole centerline -- 2,500 candidates x ~900 samples, about 2.25 million
 *    iterations per bake, per track.
 *  - A band cannot land on the road. Props start beyond the drivable corridor
 *    by construction, so there is nothing to reject and the racing surface is
 *    guaranteed clear.
 */

import type { PropKind } from '../world/propKit';

/** Colours are 0xRRGGBB. */
export interface RoadPalette {
  /** Deepest ground colour, behind everything. */
  void: number;
  /** Slightly lifted ground, used for the soft blotches that break up the void. */
  voidAlt: number;
  /** Asphalt. */
  road: number;
  /** Patches worn into the asphalt. */
  roadWear: number;
  /** Kerb band outside the asphalt. */
  kerb: number;
  /** The stripes painted on the kerb. */
  kerbStripe: number;
  /** Pavement outside the kerb. */
  pavement: number;
  /** Drivable run-off, out to where the scenery starts. */
  runoff: number;
  /** Solid line at the edge of the asphalt. */
  edgeLine: number;
  /** Dashed centre line. */
  laneLine: number;
  /** Finish-line chequer. */
  finishLine: number;
}

export interface PropBand {
  kind: PropKind;
  /**
   * Gap between props along the centerline, measured in centerline samples. A
   * large number is a sparse band, 2 is dense.
   */
  spacing: number;
  /** How far beyond the drivable corridor this band sits (px), min..max. */
  offset: [number, number];
  /** Chance any given slot is actually filled, so the row is not mechanical. */
  fill: number;
  /** Mirror on both sides of the road. */
  bothSides: boolean;
  /** Uniform size multiplier range. */
  scale: [number, number];
  /** Per-prop random size jitter on top of that, 0..1. */
  jitter: number;
}

export interface FogLayer {
  /** Tinted sheet laid over the world. */
  color: number;
  /** 0..1. Kept low: fog must never hide the road. */
  alpha: number;
  /** Screen-space band this sheet covers, 0 = top of the view, 1 = bottom. */
  band: [number, number];
  /** Extra sheets stacked on top for depth. */
  layers: number;
}

export interface AmbientMotes {
  /** Particle texture tint. */
  tint: number;
  /** Particles alive at once. Deliberately small: this runs every frame. */
  count: number;
  /** Screen band the motes drift in, as a fraction of the view height. */
  spreadY: [number, number];
  speedY: [number, number];
  speedX: [number, number];
  /** 0 = falls, 1 = rises. */
  rise: boolean;
  scale: [number, number];
  alpha: number;
  lifespanMs: [number, number];
}

export interface WorldTheme {
  /** Must match the track id in `config/tracks`. */
  id: string;
  /** Shown on the track-select card. The id never changes. */
  displayName: string;
  /** One-line flavour used on the card and the intro overlay. */
  tagline: string;
  palette: RoadPalette;
  /** Whether the road carries painted lane markings. The Upside Down does not. */
  laneMarkings: boolean;
  /** Props, ordered near-road to far so the depth reads correctly. */
  bands: readonly PropBand[];
  fog: FogLayer;
  motes: AmbientMotes;
  /** Ambient light the camera clears to, matching the ground colour. */
  cameraBackground: number;
  /** Road shoulders get a soft dark shadow so the tarmac sits above the ground. */
  roadShadow: boolean;
}

const TOWN: RoadPalette = {
  void: 0x05060f,
  voidAlt: 0x0a0d1c,
  road: 0x14161f,
  roadWear: 0x1b1e2a,
  kerb: 0x2b2f3d,
  kerbStripe: 0x8d93a6,
  pavement: 0x1a1d28,
  runoff: 0x101319,
  edgeLine: 0xb9bfd0,
  laneLine: 0xd8dcea,
  finishLine: 0xf2f4ff,
};

const FOREST: RoadPalette = {
  void: 0x040a09,
  voidAlt: 0x08160f,
  road: 0x14171b,
  roadWear: 0x1b2024,
  kerb: 0x2a3128,
  kerbStripe: 0x4a5a48,
  pavement: 0x141d17,
  runoff: 0x0b130e,
  edgeLine: 0x7d8a78,
  laneLine: 0x9aa894,
  finishLine: 0xe6f0e4,
};

const UPSIDE: RoadPalette = {
  void: 0x0d0206,
  voidAlt: 0x240510,
  road: 0x12060c,
  roadWear: 0x1c0a12,
  kerb: 0x2a0d16,
  kerbStripe: 0x7a1a2c,
  pavement: 0x1a0810,
  runoff: 0x120409,
  edgeLine: 0x8c2136,
  laneLine: 0xb03048,
  finishLine: 0xff5a72,
};

const MALL: RoadPalette = {
  void: 0x08061a,
  voidAlt: 0x120c2c,
  road: 0x14141d,
  roadWear: 0x1c1d2a,
  kerb: 0x123a44,
  kerbStripe: 0x00e5ff,
  pavement: 0x0f1430,
  runoff: 0x0a0d20,
  edgeLine: 0x00d9f0,
  laneLine: 0xff4df0,
  finishLine: 0xffffff,
};

const LAB: RoadPalette = {
  void: 0x05070b,
  voidAlt: 0x0c1119,
  road: 0x16181d,
  roadWear: 0x1e2128,
  kerb: 0x2c2f36,
  kerbStripe: 0xd8b23a,
  pavement: 0x191c22,
  runoff: 0x0f1116,
  edgeLine: 0x9aa2b4,
  laneLine: 0xd8b23a,
  finishLine: 0xf0f2f7,
};

/**
 * HAWKINS TOWN -- suburban streets at night. Warm sodium streetlights against a
 * cold midnight-blue ground, houses set back behind driveways, picket fences on
 * the pavement edge. The bands are deliberately uneven so the road reads as a
 * street with blocks in it rather than a corridor with trees beside it.
 */
export const HAWKINS_TOWN: WorldTheme = {
  id: 'hawkins-streets',
  displayName: 'HAWKINS TOWN',
  tagline: 'Neon-lit suburban streets. Classic night racing.',
  palette: TOWN,
  laneMarkings: true,
  cameraBackground: 0x05060f,
  roadShadow: true,
  bands: [
    { kind: 'streetlight', spacing: 26, offset: [6, 18], fill: 0.92, bothSides: true, scale: [1, 1], jitter: 0 },
    { kind: 'fence', spacing: 5, offset: [10, 26], fill: 0.55, bothSides: true, scale: [1, 1], jitter: 0.15 },
    { kind: 'house', spacing: 30, offset: [78, 150], fill: 0.62, bothSides: true, scale: [0.9, 1.2], jitter: 0.2 },
    { kind: 'shopfront', spacing: 40, offset: [60, 110], fill: 0.3, bothSides: true, scale: [0.9, 1.1], jitter: 0.2 },
    { kind: 'broadleaf', spacing: 9, offset: [30, 90], fill: 0.5, bothSides: true, scale: [0.8, 1.3], jitter: 0.3 },
    { kind: 'pine', spacing: 14, offset: [170, 340], fill: 0.68, bothSides: true, scale: [1, 1.5], jitter: 0.35 },
    { kind: 'rock', spacing: 22, offset: [120, 300], fill: 0.18, bothSides: true, scale: [0.7, 1.1], jitter: 0.4 },
  ],
  fog: { color: 0x1b2740, alpha: 0.13, band: [0.45, 1], layers: 2 },
  motes: {
    tint: 0x8fa8d8,
    count: 70,
    spreadY: [0.15, 1],
    speedY: [420, 720],
    speedX: [-40, 40],
    rise: false,
    scale: [0.12, 0.3],
    alpha: 0.5,
    lifespanMs: [700, 1300],
  },
};

/**
 * MIRKWOOD FOREST -- the forest is the track's defining constraint. The bands
 * start close (pines right at the verge) and go deep, so the road sits in a
 * corridor of trunks. Fog is heaviest here but is capped low on purpose: the
 * road has to stay readable in a race you cannot see the exit of.
 */
export const MIRKWOOD_FOREST: WorldTheme = {
  id: 'hawkins-forest',
  displayName: 'MIRKWOOD FOREST',
  tagline: 'Fog-bound trails. Narrow, blind, unforgiving.',
  palette: FOREST,
  laneMarkings: true,
  cameraBackground: 0x040a09,
  roadShadow: true,
  bands: [
    { kind: 'rock', spacing: 12, offset: [4, 16], fill: 0.4, bothSides: true, scale: [0.7, 1.2], jitter: 0.4 },
    { kind: 'pine', spacing: 4, offset: [10, 70], fill: 0.82, bothSides: true, scale: [0.9, 1.5], jitter: 0.35 },
    { kind: 'deadTree', spacing: 11, offset: [60, 180], fill: 0.5, bothSides: true, scale: [0.9, 1.4], jitter: 0.4 },
    { kind: 'bush', spacing: 7, offset: [8, 46], fill: 0.45, bothSides: true, scale: [0.8, 1.3], jitter: 0.3 },
    { kind: 'lantern', spacing: 34, offset: [26, 60], fill: 0.24, bothSides: true, scale: [1, 1], jitter: 0 },
    { kind: 'pine', spacing: 3, offset: [190, 420], fill: 0.9, bothSides: true, scale: [1.1, 1.8], jitter: 0.4 },
  ],
  fog: { color: 0x16342c, alpha: 0.2, band: [0.35, 1], layers: 3 },
  motes: {
    tint: 0x6fe0b0,
    count: 90,
    spreadY: [0.1, 1],
    speedY: [-14, 14],
    speedX: [-22, 22],
    rise: true,
    scale: [0.14, 0.4],
    alpha: 0.42,
    lifespanMs: [2600, 5200],
  },
};

/**
 * THE UPSIDE DOWN -- corrupted ground, no lane markings at all (a painted road
 * would be a lie here), and vegetation replaced by tendrils and floating rock.
 * The deep bands go much further out and much denser so the horizon is a wall of
 * wrongness rather than an empty red field.
 */
export const THE_UPSIDE_DOWN: WorldTheme = {
  id: 'upside-down',
  displayName: 'THE UPSIDE DOWN',
  tagline: 'Corrupted earth. Tendrils where trees should be.',
  palette: UPSIDE,
  laneMarkings: false,
  cameraBackground: 0x0d0206,
  roadShadow: false,
  bands: [
    { kind: 'tendril', spacing: 5, offset: [6, 60], fill: 0.6, bothSides: true, scale: [0.8, 1.5], jitter: 0.4 },
    { kind: 'floatRock', spacing: 6, offset: [14, 130], fill: 0.55, bothSides: true, scale: [0.7, 1.6], jitter: 0.5 },
    { kind: 'sporePod', spacing: 13, offset: [10, 90], fill: 0.45, bothSides: true, scale: [0.8, 1.4], jitter: 0.35 },
    { kind: 'deadTree', spacing: 8, offset: [70, 200], fill: 0.62, bothSides: true, scale: [1, 1.6], jitter: 0.45 },
    { kind: 'tendril', spacing: 3, offset: [220, 520], fill: 0.85, bothSides: true, scale: [1.1, 1.9], jitter: 0.5 },
    { kind: 'floatRock', spacing: 4, offset: [240, 560], fill: 0.7, bothSides: true, scale: [0.9, 2], jitter: 0.5 },
  ],
  fog: { color: 0x5a0a1c, alpha: 0.19, band: [0.3, 1], layers: 3 },
  motes: {
    tint: 0xff4a6a,
    count: 100,
    spreadY: [0.05, 1],
    speedY: [-26, 26],
    speedX: [-34, 34],
    rise: true,
    scale: [0.16, 0.5],
    alpha: 0.55,
    lifespanMs: [3000, 6400],
  },
};

/** Starcourt keeps its mall identity: neon kerbs, cyan and magenta. */
export const STARCOURT: WorldTheme = {
  id: 'starcourt-run',
  displayName: 'STARCOURT RUN',
  tagline: 'Mall lights and tight, technical turns.',
  palette: MALL,
  laneMarkings: true,
  cameraBackground: 0x08061a,
  roadShadow: true,
  bands: [
    { kind: 'streetlight', spacing: 18, offset: [6, 16], fill: 0.8, bothSides: true, scale: [1, 1], jitter: 0 },
    { kind: 'shopfront', spacing: 12, offset: [20, 90], fill: 0.72, bothSides: true, scale: [0.9, 1.3], jitter: 0.2 },
    { kind: 'warehouse', spacing: 34, offset: [140, 300], fill: 0.5, bothSides: true, scale: [1, 1.4], jitter: 0.25 },
    { kind: 'rock', spacing: 20, offset: [100, 260], fill: 0.2, bothSides: true, scale: [0.7, 1.1], jitter: 0.4 },
  ],
  fog: { color: 0x2a1a5a, alpha: 0.12, band: [0.5, 1], layers: 2 },
  motes: {
    tint: 0xff7ae0,
    count: 60,
    spreadY: [0.15, 1],
    speedY: [-18, 18],
    speedX: [-26, 26],
    rise: true,
    scale: [0.12, 0.3],
    alpha: 0.45,
    lifespanMs: [2200, 4400],
  },
};

/** The Lab: industrial, floodlit, geometric. */
export const HAWKINS_LAB: WorldTheme = {
  id: 'hawkins-lab',
  displayName: 'HAWKINS LAB',
  tagline: 'Floodlit restricted grounds. No room for error.',
  palette: LAB,
  laneMarkings: true,
  cameraBackground: 0x05070b,
  roadShadow: true,
  bands: [
    { kind: 'floodlight', spacing: 22, offset: [8, 22], fill: 0.85, bothSides: true, scale: [1, 1], jitter: 0 },
    { kind: 'fence', spacing: 4, offset: [12, 30], fill: 0.8, bothSides: true, scale: [1, 1], jitter: 0.1 },
    { kind: 'warehouse', spacing: 22, offset: [60, 160], fill: 0.66, bothSides: true, scale: [0.9, 1.3], jitter: 0.25 },
    { kind: 'rock', spacing: 16, offset: [80, 240], fill: 0.22, bothSides: true, scale: [0.7, 1.1], jitter: 0.4 },
  ],
  fog: { color: 0x1a2230, alpha: 0.12, band: [0.5, 1], layers: 2 },
  motes: {
    tint: 0xbcd0ff,
    count: 50,
    spreadY: [0.15, 1],
    speedY: [180, 340],
    speedX: [-30, 30],
    rise: false,
    scale: [0.1, 0.26],
    alpha: 0.4,
    lifespanMs: [900, 1700],
  },
};

const THEMES: Readonly<Record<string, WorldTheme>> = {
  'hawkins-streets': HAWKINS_TOWN,
  'hawkins-forest': MIRKWOOD_FOREST,
  'upside-down': THE_UPSIDE_DOWN,
  'starcourt-run': STARCOURT,
  'hawkins-lab': HAWKINS_LAB,
};

/**
 * Falls back to Hawkins Town. A missing theme must not break a race: an unknown
 * track id still has to produce a drivable world.
 */
export function getTheme(trackId: string): WorldTheme {
  return THEMES[trackId] ?? HAWKINS_TOWN;
}

export const ALL_THEMES: readonly WorldTheme[] = Object.values(THEMES);