/**
 * Controller trace: why is a car sitting on the barrier?
 *
 * Dumps the AI's own decision variables for one car over a window, so a car that
 * is pinned on the barrier can be traced back to the value that put it there
 * (lane target, cross-track error, corner radius, blocked-by-traffic, reversing)
 * instead of being guessed at.
 *
 *   node --experimental-transform-types --import ./tools/register.mjs \
 *        tools/aiTrace.ts [trackId] [driverName] [fromSeconds] [toSeconds]
 */
import { AiDriver } from '../src/game/systems/AiDriver';
import { RaceSession } from '../src/game/systems/RaceSession';
import { TrackLayout } from '../src/game/entities/TrackLayout';
import { buildGrid, getAiProfile } from '../src/game/config/racers';
import { getTrackDefinition } from '../src/game/config/tracks';
import { CHARACTERS } from '../src/data/characters';
import { CARS } from '../src/data/cars';
import type { InputState } from '../src/game/entities/CarPhysics';

const STEP = 1 / 120;
const trackId = process.argv[2] ?? 'hawkins-streets';
const driverName = (process.argv[3] ?? 'MAX').toUpperCase();
const from = Number(process.argv[4] ?? 0);
const to = Number(process.argv[5] ?? 40);

const layout = new TrackLayout(getTrackDefinition(trackId));
const session = new RaceSession(layout, buildGrid(CHARACTERS[0], CARS[0]));
const player = session.player;
const playerBot = new AiDriver(getAiProfile(player.config.characterId), player.tuning);

let captured: import('../src/game/systems/AiDriver').AiDebug | null = null;
const subject = session.racers.find((r) => r.config.characterName.toUpperCase() === driverName);
if (!subject || !subject.ai) throw new Error(`no AI driver named ${driverName}`);
subject.ai.onDebug = (s) => {
  captured = s;
};

const halfRoad = layout.roadWidth / 2;
console.log(
  `track=${trackId} driver=${driverName} car=${subject.config.carId} ` +
    `maxSpeed=${subject.tuning.maxSpeed.toFixed(0)} grip=${subject.tuning.lateralGrip.toFixed(2)}\n`,
);
console.log(
  '    t    frac  off  laneTg laneOff  cross   nose   steer  radius tgtV    v  brake rev blk  flags',
);

let steps = 0;
const maxSteps = 120 * 60 * 6;
let nextReport = from;
while (steps < maxSteps) {
  const rivals = session.racers
    .filter((r) => r !== player)
    .map((r) => ({ physics: r.physics, aheadInRace: r.laps.totalRaceProgress > player.laps.totalRaceProgress }));
  const input: InputState = playerBot.update(STEP, layout, player.physics, rivals, !player.nitro.isEmpty);

  captured = null;
  session.step(STEP, input);
  steps++;

  const t = steps * STEP;
  if (t < from) continue;
  if (t > to) break;
  if (t < nextReport) continue;
  nextReport += 0.25;

  const s = captured;
  if (!s) continue;
  const flags = [
    s.onRoad ? '' : 'OFFROAD',
    s.roadDistance > halfRoad + 24 ? 'WALL' : '',
    s.blockedBy ? 'TRAFFIC' : '',
    s.reversing ? 'REVERSE' : '',
    Math.abs(s.crossTrack) > 90 ? 'DRIFT' : '',
  ]
    .filter(Boolean)
    .join(',');

  console.log(
    `${t.toFixed(2).padStart(6)} ${s.fraction.toFixed(3)} ${s.roadDistance.toFixed(0).padStart(5)} ` +
      `${s.laneTarget.toFixed(0).padStart(7)} ${s.laneOffset.toFixed(0).padStart(8)} ` +
      `${s.crossTrack.toFixed(0).padStart(6)} ${((s.noseError * 180) / Math.PI).toFixed(0).padStart(6)} ` +
      `${s.steer.toFixed(2).padStart(6)} ${(Number.isFinite(s.radius) ? s.radius.toFixed(0) : 'inf').padStart(7)} ` +
      `${s.targetSpeed.toFixed(0).padStart(4)} ${s.speed.toFixed(0).padStart(4)} ` +
      `${s.braking ? ' Y' : ' .'}  ${s.reversing ? 'Y' : '.'}   ${s.blockedBy}   ${flags}`,
  );
}