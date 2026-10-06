/**
 * Designs and validates the track layouts for the locked maps.
 *
 * Loops are generated as polar perturbations, which are star-shaped about the
 * centre and therefore cannot self-intersect. Each candidate is then built into
 * a real TrackLayout and checked for the things that actually stop a race from
 * being completable: a self-crossing, a corner tighter than a car can drive,
 * or road running off the edge of the world.
 *
 * Run with: npx tsx tools/designTracks.ts
 */
import { TrackLayout } from '../src/game/entities/TrackLayout';
import type { Point, TrackDefinition } from '../src/game/config/tracks';

interface Profile {
  key: string;
  name: string;
  worldWidth: number;
  worldHeight: number;
  roadWidth: number;
  /** Base loop radius, before harmonics and aspect scaling. */
  base: number;
  /** Stretch on x / y to stop every track being a circle. */
  aspectX: number;
  aspectY: number;
  /** Harmonics: [frequency, amplitude, phase]. */
  harmonics: [number, number, number][];
  controlPoints: number;
  samplesPerSegment: number;
}

/**
 * Character per map:
 *  mall    tight, busy, two lobes + a faster triple -> technical, few straights
 *  forest  wide sweeping pairs, narrower road -> winding and blind
 *  lab     high-frequency square-ish -> geometric, 90-degree-ish corners
 */
const PROFILES: Profile[] = [
  {
    key: 'starcourt-run',
    name: 'Starcourt Run',
    worldWidth: 3200,
    worldHeight: 2800,
    roadWidth: 320,
    base: 1010,
    aspectX: 1.06,
    aspectY: 0.9,
    harmonics: [[3, 0.16, 0], [5, 0.1, 1.1], [2, 0.05, 2.2]],
    controlPoints: 22,
    samplesPerSegment: 26,
  },
  {
    key: 'hawkins-forest',
    name: 'Hawkins Forest',
    worldWidth: 3400,
    worldHeight: 3200,
    roadWidth: 260,
    base: 930,
    aspectX: 1.1,
    aspectY: 0.95,
    harmonics: [[2, 0.24, 0.4], [4, 0.13, 2.0], [3, 0.06, 0.8]],
    controlPoints: 24,
    samplesPerSegment: 26,
  },
  {
    key: 'hawkins-lab',
    name: 'Hawkins Lab',
    worldWidth: 3200,
    worldHeight: 2800,
    roadWidth: 300,
    base: 1010,
    aspectX: 1.04,
    aspectY: 0.92,
    harmonics: [[4, 0.13, 0], [6, 0.04, 0.9], [2, 0.04, 1.4]],
    controlPoints: 28,
    samplesPerSegment: 26,
  },
];

function buildLoop(p: Profile): Point[] {
  const cx = p.worldWidth / 2;
  const cy = p.worldHeight / 2;
  const pts: Point[] = [];
  for (let i = 0; i < p.controlPoints; i++) {
    const th = (i / p.controlPoints) * Math.PI * 2;
    let k = 1;
    for (const [freq, amp, phase] of p.harmonics) k += amp * Math.sin(freq * th + phase);
    const r = p.base * k;
    // Start at the bottom of the loop (theta = pi/2) so the start/finish line
    // sits on the main straight rather than mid-corner.
    pts.push({ x: cx + Math.cos(th) * r * p.aspectX, y: cy - Math.sin(th) * r * p.aspectY });
  }
  return pts;
}

/** True if any two non-adjacent segments of the loop cross. */
function selfIntersects(pts: Point[]): boolean {
  const seg = (i: number) => [pts[i], pts[(i + 1) % pts.length]] as const;
  const cross = (a: Point, b: Point, c: Point, d: Point): boolean => {
    const o = (p: Point, q: Point, r: Point) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
    return o1 !== o2 && o3 !== o4;
  };
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const [a, b] = seg(i);
      const [c, d] = seg(j);
      if (cross(a, b, c, d)) return true;
    }
  }
  return false;
}

/** Corner radius along the built centerline, sampled by fraction. */
function minCornerRadius(layout: TrackLayout): number {
  let min = Infinity;
  let at = 0;
  for (let f = 0; f < 1; f += 0.002) {
    const r = layout.cornerRadiusAhead(f, 400);
    if (r < min) { min = r; at = f; }
  }
  void at;
  return min;
}

/** Index of the straightest stretch, so the finish line lands on a straight. */
function straightestIndex(layout: TrackLayout): number {
  let best = 0;
  let bestR = -Infinity;
  for (let i = 0; i < layout.centerline.length; i++) {
    const r = layout.cornerRadiusAhead(i / layout.centerline.length, 400);
    if (r > bestR) { bestR = r; best = i; }
  }
  return best;
}

console.log('\n[design] generated track layouts\n');

const emitted: Record<string, TrackDefinition> = {};

for (const p of PROFILES) {
  const controlPoints = buildLoop(p);
  const probe: TrackDefinition = {
    id: p.key,
    name: p.name,
    worldWidth: p.worldWidth,
    worldHeight: p.worldHeight,
    roadWidth: p.roadWidth,
    controlPoints,
    samplesPerSegment: p.samplesPerSegment,
    finishSampleOffset: 0,
    spawnSamplesBehind: 12,
    checkpointCount: 4,
  };
  const probeLayout = new TrackLayout(probe);
  probe.finishSampleOffset = straightestIndex(probeLayout);
  probe.spawnSamplesBehind = Math.round(p.samplesPerSegment / 3);
  // Rebuilt so every number below reflects the finish line we actually ship.
  const layout = new TrackLayout(probe);

  const margin = Math.min(
    ...layout.centerline.map((q) => Math.min(q.x, q.y, p.worldWidth - q.x, p.worldHeight - q.y)),
  );
  const radius = minCornerRadius(layout);
  const crossing = selfIntersects(controlPoints);

  console.log(`${p.name} (${p.key})`);
  console.log(`  lap length      ${layout.trackLength.toFixed(0)}px over ${layout.centerline.length} samples`);
  console.log(`  tightest corner ${radius.toFixed(0)}px`);
  console.log(`  edge margin     ${margin.toFixed(0)}px (road half-width is ${p.roadWidth / 2})`);
  console.log(`  finish index    ${probe.finishSampleOffset} @ fraction ${layout.finishFraction.toFixed(3)}`);
  console.log(`  spawn behind    ${probe.spawnSamplesBehind} samples`);
  console.log(`  self-crossing   ${crossing}`);

  const problems: string[] = [];
  if (crossing) problems.push('self-crossing');
  if (margin < p.roadWidth / 2 + 60) problems.push(`road too close to edge (${margin.toFixed(0)}px)`);
  // hawkins-streets, the reference playable track, is 202px at a 360px road.
  if (radius < 130) problems.push(`corner too tight (${radius.toFixed(0)}px)`);
  if (layout.trackLength < 5000) problems.push(`lap too short (${layout.trackLength.toFixed(0)}px)`);

  if (problems.length) {
    console.log(`  REJECTED: ${problems.join('; ')}\n`);
  } else {
    console.log('  OK\n');
    emitted[p.key] = probe;
  }
}

console.log(`\n${Object.keys(emitted).length}/${PROFILES.length} layouts accepted`);
console.log('\n--- emit ---\n');
for (const [key, def] of Object.entries(emitted)) {
  console.log(`\n// ${def.name}`);
  console.log(`export const ${key.replace(/-/g, '_').toUpperCase()}: TrackDefinition = {`);
  console.log(`  id: '${def.id}',`);
  console.log(`  name: '${def.name}',`);
  console.log(`  worldWidth: ${def.worldWidth},`);
  console.log(`  worldHeight: ${def.worldHeight},`);
  console.log(`  roadWidth: ${def.roadWidth},`);
  console.log('  controlPoints: [');
  for (const q of def.controlPoints) console.log(`    { x: ${Math.round(q.x)}, y: ${Math.round(q.y) } },`);
  console.log('  ],');
  console.log(`  samplesPerSegment: ${def.samplesPerSegment},`);
  console.log(`  finishSampleOffset: ${def.finishSampleOffset},`);
  console.log(`  spawnSamplesBehind: ${def.spawnSamplesBehind},`);
  console.log(`  checkpointCount: ${def.checkpointCount},`);
  console.log('};');
}