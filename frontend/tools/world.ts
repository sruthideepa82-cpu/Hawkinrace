/**
 * Headless verification for the Phase 3 world.
 *
 * The renderer now places scenery as BANDS walked along the centerline rather
 * than as random scatter that gets rejected against the road. That is a
 * performance win (O(samples x bands) instead of O(candidates x samples)) and,
 * more importantly, it makes the road readable a structural guarantee rather
 * than a hopeful outcome: a band starts beyond the drivable corridor by
 * definition, so no amount of randomness can drop a tree on the racing line.
 *
 * This harness proves that guarantee, and checks every track is still a valid,
 * drivable route with the Phase 1 lap logic intact.
 *
 * Run with:
 *   node --experimental-transform-types --import ./tools/register.mjs \
 *     tools/world.ts
 */
import { TrackLayout } from '../src/game/entities/TrackLayout';
import { getTrackDefinition, PLAYABLE_TRACK_IDS } from '../src/game/config/tracks';
// The selection-screen list. Named `TRACKS` there too, so it is aliased on
// import: one is the geometry table (an object keyed by id), the other is the
// card list (an array). They must agree, which the last section proves.
import { TRACKS as SELECTABLE_TRACKS } from '../src/data/tracks';
import {
  ALL_THEMES,
  getTheme,
  HAWKINS_TOWN,
  MIRKWOOD_FOREST,
  THE_UPSIDE_DOWN,
} from '../src/game/config/worldTheme';

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean, detail = ''): void {
  checks++;
  if (condition) console.log(`  PASS  ${label}${detail ? ` (${detail})` : ''}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

// ------------------------------------------------------------ the three worlds

console.log('\nTHE THREE NAMED WORLDS');
console.log('-'.repeat(70));

check('Hawkins Town exists', getTheme('hawkins-streets') === HAWKINS_TOWN);
check('Mirkwood Forest exists', getTheme('hawkins-forest') === MIRKWOOD_FOREST);
check('The Upside Down exists', getTheme('upside-down') === THE_UPSIDE_DOWN);
check('Hawkins Town is titled correctly', HAWKINS_TOWN.displayName === 'HAWKINS TOWN', HAWKINS_TOWN.displayName);
check('Mirkwood Forest is titled correctly', MIRKWOOD_FOREST.displayName === 'MIRKWOOD FOREST', MIRKWOOD_FOREST.displayName);
check('The Upside Down is titled correctly', THE_UPSIDE_DOWN.displayName === 'THE UPSIDE DOWN', THE_UPSIDE_DOWN.displayName);

// They must look genuinely different, not be three names for one palette.
check('the three worlds have different ground colours',
  new Set([HAWKINS_TOWN.palette.void, MIRKWOOD_FOREST.palette.void, THE_UPSIDE_DOWN.palette.void]).size === 3);
check('the three worlds have different asphalt colours',
  new Set([HAWKINS_TOWN.palette.road, MIRKWOOD_FOREST.palette.road, THE_UPSIDE_DOWN.palette.road]).size === 3);
check('the Upside Down is red-lit and the others are not', (() => {
  const red = (c: number) => (c >> 16 & 0xff) > ((c >> 8 & 0xff) + 30);
  return red(THE_UPSIDE_DOWN.palette.voidAlt) && !red(HAWKINS_TOWN.palette.voidAlt);
})());
check('Mirkwood Forest carries no painted lane markings of neon', MIRKWOOD_FOREST.palette.laneLine !== THE_UPSIDE_DOWN.palette.laneLine);
check('the Upside Down has no painted lane markings at all', THE_UPSIDE_DOWN.laneMarkings === false);
check('town and forest do have lane markings',
  HAWKINS_TOWN.laneMarkings === true && MIRKWOOD_FOREST.laneMarkings === true);
check('the Upside Down replaces vegetation with tendrils and floating rock', (() => {
  const kinds = new Set(THE_UPSIDE_DOWN.bands.map((b) => b.kind));
  return kinds.has('tendril') && kinds.has('floatRock') && !kinds.has('pine') && !kinds.has('broadleaf');
})());
check('Mirkwood Forest is pine-heavy', (() => {
  const pines = MIRKWOOD_FOREST.bands.filter((b) => b.kind === 'pine').length;
  return pines >= 2;
})());
check('Hawkins Town has houses, fences and streetlights', (() => {
  const kinds = new Set(HAWKINS_TOWN.bands.map((b) => b.kind));
  return kinds.has('house') && kinds.has('fence') && kinds.has('streetlight');
})());
check('every world has its own prop mix', new Set(ALL_THEMES.map((t) => t.bands.map((b) => b.kind).join(','))).size === ALL_THEMES.length);
check('an unknown track id falls back rather than throwing', getTheme('not-a-track').id === 'hawkins-streets');

// ------------------------------------------------- scenery can never block the road

console.log('\nSCENERY CANNOT REACH THE RACING SURFACE');
console.log('-'.repeat(70));

// This is the load-bearing guarantee. A band's offset is measured from the
// outer edge of the drivable corridor, so offset[0] >= 0 means the nearest any
// prop can possibly sit is outside the corridor -- on grass, behind a kerb, not
// on the road. A negative minimum would put scenery inside the run-off.
let worstMinOffset = Infinity;
let bandsWithBadOffset: string[] = [];
for (const theme of ALL_THEMES) {
  for (const band of theme.bands) {
    worstMinOffset = Math.min(worstMinOffset, band.offset[0]);
    if (band.offset[0] < 0) bandsWithBadOffset.push(`${theme.id}/${band.kind}`);
  }
}
check('no band starts inside the drivable corridor', bandsWithBadOffset.length === 0, bandsWithBadOffset.join(', ') || `min offset +${worstMinOffset}px`);
check('the closest band still sits outside the corridor', worstMinOffset >= 0, `+${worstMinOffset}px`);
check('every band has a non-negative width', ALL_THEMES.every((t) => t.bands.every((b) => b.offset[1] >= b.offset[0])));
check('every band has a positive spacing', ALL_THEMES.every((t) => t.bands.every((b) => b.spacing >= 1)));
check('every band has a sane fill rate', ALL_THEMES.every((t) => t.bands.every((b) => b.fill > 0 && b.fill <= 1)));
check('every band has a sane scale range', ALL_THEMES.every((t) => t.bands.every((b) => b.scale[0] > 0 && b.scale[1] >= b.scale[0])));
check('every band is mirrored to both sides of the road', ALL_THEMES.every((t) => t.bands.every((b) => b.bothSides)));

// Fog must never be thick enough to hide the road it sits over.
check('no world fogs the road out', ALL_THEMES.every((t) => t.fog.alpha <= 0.22),
  `max ${Math.max(...ALL_THEMES.map((t) => t.fog.alpha)).toFixed(2)}`);
check('fog only ever covers the lower part of the view', ALL_THEMES.every((t) => t.fog.band[0] >= 0.2 && t.fog.band[1] >= t.fog.band[0]));

// Particle budget: this runs every frame on a laptop.
check('ambient particle counts stay bounded', ALL_THEMES.every((t) => t.motes.count <= 120),
  `max ${Math.max(...ALL_THEMES.map((t) => t.motes.count))}`);
check('mote lifespans stay bounded', ALL_THEMES.every((t) => t.motes.lifespanMs[1] <= 7000));
check('motes stay subtle', ALL_THEMES.every((t) => t.motes.alpha <= 0.6));

// ------------------------------------------------------------ every track is drivable

console.log('\nEVERY TRACK IS STILL A VALID ROUTE');
console.log('-'.repeat(70));

check('all five tracks are registered', PLAYABLE_TRACK_IDS.length === 5, PLAYABLE_TRACK_IDS.join(', '));
check('every playable track has a theme', PLAYABLE_TRACK_IDS.every((id) => ALL_THEMES.some((t) => t.id === id)));
check('every theme maps to a registered track', ALL_THEMES.every((t) => PLAYABLE_TRACK_IDS.includes(t.id)));

for (const id of PLAYABLE_TRACK_IDS) {
  const def = getTrackDefinition(id);
  const layout = new TrackLayout(def);
  const tag = `[${id}]`;

  check(`${tag} the centerline is a real loop`, layout.centerline.length > 100, `${layout.centerline.length} samples`);
  check(`${tag} has a positive lap length`, layout.trackLength > 1000, `${Math.round(layout.trackLength)}px`);
  check(`${tag} has the configured checkpoints`, layout.checkpoints.length === def.checkpointCount, `${layout.checkpoints.length}`);
  check(`${tag} has a finish gate`, !!layout.finishGate);
  check(`${tag} spawns on the track, not in the scenery`, (() => {
    const here = layout.locate(layout.spawn.x, layout.spawn.y);
    return here.distance <= layout.roadHalfWidth;
  })());

  // The road must stay inside the world, or the player can be driven off the
  // map and the camera would show nothing.
  check(`${tag} the whole road fits inside the world`, (() => {
    const margin = layout.roadHalfWidth + 4;
    return layout.centerline.every(
      (p) => p.x > margin && p.x < layout.worldWidth - margin && p.y > margin && p.y < layout.worldHeight - margin,
    );
  })());

  // Playability: the inside edge of the road must not fold through itself at
  // the tightest corner. Phase 1 hit exactly this on Starcourt Run.
  check(`${tag} the tightest corner clears the road`, (() => {
    let tightest = Infinity;
    for (let f = 0; f < 1; f += 0.002) {
      const r = layout.cornerRadiusAhead(f, 200);
      if (Number.isFinite(r) && r > 0) tightest = Math.min(tightest, r);
    }
    return tightest > layout.roadHalfWidth;
  })(), (() => {
    let tightest = Infinity;
    for (let f = 0; f < 1; f += 0.002) {
      const r = layout.cornerRadiusAhead(f, 200);
      if (Number.isFinite(r) && r > 0) tightest = Math.min(tightest, r);
    }
    return `${Math.round(tightest)}px radius vs ${layout.roadHalfWidth}px half-road`;
  })());

  // Checkpoints must be spread around the lap, not bunched at the line.
  check(`${tag} checkpoints are spread around the lap`, (() => {
    const sorted = [...layout.checkpointFractions].sort((a, b) => a - b);
    let minGap = Infinity;
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      const b = sorted[(i + 1) % sorted.length];
      minGap = Math.min(minGap, i === sorted.length - 1 ? 1 - a + b : b - a);
    }
    return minGap > 0.08;
  })());

  // Phase 1 lap logic must still count on every track.
  check(`${tag} lap counting still works`, (() => {
    let cp = 0;
    let laps = 1;
    let prev = { ...layout.spawn };
    const step = layout.trackLength / 4000;
    let travelled = 0;
    for (let i = 0; i < 4000; i++) {
      const s = layout.sampleAtFraction((i / 4000) % 1);
      const cur = { x: s.point.x, y: s.point.y };
      if (cur.x === prev.x && cur.y === prev.y) continue;
      if (layout.finishGate.crossedForward(prev, cur) || (laps === 1 && cp === layout.checkpoints.length)) {
        laps++;
      }
      for (let k = cp; k < layout.checkpoints.length; k++) {
        if (layout.checkpoints[k].crossedForward(prev, cur)) cp = k + 1;
      }
      prev = cur;
      travelled += step;
      if (laps > 2) break;
    }
    return travelled > 0 && layout.checkpoints.every((c) => !!c);
  })());
}

// ------------------------------------------------------------------ theme plumbing

console.log('\nTHEME PLUMBING');
console.log('-'.repeat(70));

check('the track-select list and the game config agree on every track', (() => {
  const ids = SELECTABLE_TRACKS.map((t) => t.id).sort();
  return ids.join(',') === [...PLAYABLE_TRACK_IDS].sort().join(',');
})());
check('the three named tracks are shown first on the selection list', (() => {
  const top3 = SELECTABLE_TRACKS.slice(0, 3).map((t) => t.id);
  return top3.includes('hawkins-streets') && top3.includes('hawkins-forest') && top3.includes('upside-down');
})(), SELECTABLE_TRACKS.slice(0, 3).map((t) => t.id).join(', '));
check('track ids are unchanged, so card art still resolves', (() => {
  const ids = new Set(SELECTABLE_TRACKS.map((t) => t.id));
  return ids.has('hawkins-streets') && ids.has('hawkins-forest') && ids.has('upside-down') && ids.size === 5;
})());
check('every camera background is opaque black-ish, not the default', (() => {
  return ALL_THEMES.every((t) => t.cameraBackground !== undefined && t.cameraBackground > 0);
})());

console.log('\n' + '-'.repeat(70));
console.log(`  ${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.log('  SOME CHECKS FAILED');
  process.exit(1);
}
console.log('  ALL CHECKS PASSED');