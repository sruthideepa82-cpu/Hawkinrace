/**
 * Verifies that a map shown as unlocked is genuinely selectable and reachable
 * for a race -- the path from the track-select screen through to "START RACE"
 * being enabled. Run with: npx tsx tools/trackAccess.ts
 */
import { gameReducer, getSelections, initialState, isRaceReady } from '../src/store/GameStore';
import { TRACKS } from '../src/data/tracks';
import { GAME_MODES } from '../src/data/gameModes';
import { CARS } from '../src/data/cars';
import { CHARACTERS } from '../src/data/characters';
import { getTrackDefinition, TRACKS as TRACK_DEFS } from '../src/game/config/tracks';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  checks++;
  if (ok) console.log(`  PASS  ${label}`);
  else { failures++; console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ''}`); }
}

function pickAll() {
  let s = initialState;
  s = gameReducer(s, { type: 'SELECT_CHARACTER', id: CHARACTERS[0].id });
  s = gameReducer(s, { type: 'SELECT_CAR', id: CARS[0].id });
  s = gameReducer(s, { type: 'SELECT_GAME_MODE', id: GAME_MODES[0].id });
  return s;
}

console.log('\n[tracks] every unlocked map is selectable and raceable');
for (const t of TRACKS) {
  const s = gameReducer(pickAll(), { type: 'SELECT_TRACK', id: t.id });
  const selected = getSelections(s).track;
  const ready = isRaceReady(s);

  if (t.playable) {
    check(`${t.id}: selectable`, selected?.id === t.id, `got ${selected?.id ?? 'null'}`);
    check(`${t.id}: race can be started`, ready);
    // The map must have real geometry, or the race silently loads a different
    // track: getTrackDefinition falls back to Hawkins Streets for unknown ids.
    const def = getTrackDefinition(t.id);
    check(`${t.id}: has its own geometry`, TRACK_DEFS[t.id] !== undefined);
    check(`${t.id}: definition id matches`, def.id === t.id, `got ${def.id}`);
    check(`${t.id}: definition has control points`, def.controlPoints.length >= 4,
      `${def.controlPoints.length} points`);
    check(`${t.id}: has checkpoints`, def.checkpointCount > 0, `${def.checkpointCount}`);
  } else {
    check(`${t.id}: stays locked`, selected === null, `got ${selected?.id}`);
  }
}

console.log('\n[tracks] no map is unlocked without geometry');
for (const t of TRACKS.filter((x) => x.playable)) {
  check(`${t.id}: unlocked implies buildable`, TRACK_DEFS[t.id] !== undefined);
}
for (const id of Object.keys(TRACK_DEFS)) {
  const listed = TRACKS.some((t) => t.id === id);
  check(`${id}: buildable implies listed in select`, listed);
}

console.log('\n[tracks] the lock is enforced, not just drawn');
{
  const noTrack = pickAll();
  check('no track -> not raceable', !isRaceReady(noTrack));

  // A locked track must stay unselectable, whichever one that currently is.
  for (const t of TRACKS.filter((x) => !x.playable)) {
    const s = gameReducer(noTrack, { type: 'SELECT_TRACK', id: t.id });
    check(`${t.id}: locked track is rejected`, getSelections(s).track === null);
    check(`${t.id}: locked track does not unlock a race`, !isRaceReady(s));
  }

  // An id that is not in the track list at all (a stale URL or a bad payload)
  // must be rejected rather than silently accepted.
  const bogus = gameReducer(noTrack, { type: 'SELECT_TRACK', id: 'not-a-track' as never });
  check('unknown track id is rejected', getSelections(bogus).track === null);
  check('unknown track id does not unlock a race', !isRaceReady(bogus));
}

console.log('\n[modes] a playable mode is reachable');
for (const m of GAME_MODES.filter((x) => x.playable)) {
  const s = gameReducer(pickAll(), { type: 'SELECT_GAME_MODE', id: m.id });
  check(`${m.id}: selectable`, getSelections(s).mode?.id === m.id);
}

console.log(`\n=== ${checks - failures}/${checks} checks passed ===`);
if (failures) process.exit(1);