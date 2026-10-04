/** Dump the corner-radius profile of a track so AI corner speeds can be tuned. */
import { TrackLayout } from '../src/game/entities/TrackLayout';
import { getTrackDefinition } from '../src/game/config/tracks';

for (const id of ['hawkins-streets', 'upside-down']) {
  const layout = new TrackLayout(getTrackDefinition(id));
  console.log(`\n=== ${id}  length=${layout.trackLength.toFixed(0)} road=${layout.roadWidth} ===`);
  const rows: string[] = [];
  let worst = { r: Infinity, f: 0 };
  for (let f = 0; f < 1; f += 0.01) {
    // Local radius over a short window approximates the true corner tightness.
    const r = layout.cornerRadiusAhead(f, 120);
    if (r < worst.r) worst = { r, f };
    rows.push(`${f.toFixed(2)}:${Number.isFinite(r) ? r.toFixed(0) : 'inf'}`);
  }
  console.log('  local radius (120px window):', rows.join(' '));
  console.log(`  tightest local radius = ${worst.r.toFixed(0)}px at fraction ${worst.f.toFixed(2)}`);
  for (const [name, grip] of [['falcon-gt', 4.0]] as const) {
    for (const aLat of [90, 55, 40]) {
      const v = Math.sqrt(grip * aLat * worst.r);
      console.log(`  ${name} grip=${grip} aLat=${aLat} -> corner speed ${v.toFixed(0)} px/s`);
    }
  }
}
