/**
 * Time-loss breakdown per car.
 *
 * Classifies every physics frame into bucket -- on the asphalt, on the shoulder,
 * or pinned against the barrier -- and reports how long each car spends in each
 * along with its average speed in each. This is where the gap between the
 * predicted lap time and the real one actually comes from.
 */
import { AiDriver } from '../src/game/systems/AiDriver';
import { RaceSession } from '../src/game/systems/RaceSession';
import { TrackLayout } from '../src/game/entities/TrackLayout';
import { buildGrid } from '../src/game/config/racers';
import { getTrackDefinition } from '../src/game/config/tracks';
import { CHARACTERS } from '../src/data/characters';
import { CARS } from '../src/data/cars';
import type { InputState } from '../src/game/entities/CarPhysics';

const STEP = 1 / 120;
const trackId = process.argv[2] ?? 'hawkins-streets';
const layout = new TrackLayout(getTrackDefinition(trackId));
const halfRoad = layout.roadWidth / 2;
const barrier = halfRoad + 40 - 16;

const session = new RaceSession(layout, buildGrid(CHARACTERS[0], CARS[0]));

const stats = session.racers.map((r) => ({
  name: r.config.characterName,
  car: r.config.carId,
  onRoad: { frames: 0, dist: 0 },
  shoulder: { frames: 0, dist: 0 },
  barrier: { frames: 0, dist: 0 },
  slowOnRoad: { frames: 0, dist: 0 },
  /** Seconds coasting after taking the flag, when nobody is driving any more. */
  cooldownOffRoad: 0,
  worstOff: 0,
  /** Seconds off the asphalt per 1/20th of the lap, while still racing. */
  offRoadByFraction: new Array(20).fill(0),
}));

const player = session.player;
const playerBot = new AiDriver(
  { cornerConfidence: 0.98, pace: 0.98, nitroEagerness: 0.45, overtaking: 0.75, stuckSeconds: 0.9, lineBias: 0, seed: 0.5 },
  player.tuning,
);

let steps = 0;
const maxSteps = 120 * 60 * 6;
while (steps < maxSteps) {
  const rivals = session.racers
    .filter((r) => r !== player)
    .map((r) => ({ physics: r.physics, aheadInRace: r.laps.totalRaceProgress > player.laps.totalRaceProgress }));
  const input: InputState = playerBot.update(STEP, layout, player.physics, rivals, !player.nitro.isEmpty);
  session.step(STEP, input);
  steps++;

  session.racers.forEach((racer, i) => {
    const s = stats[i];
    const d = layout.locate(racer.physics.x, racer.physics.y).distance;

    // Once a car has taken the flag nobody is driving it any more; it just coasts
    // to a stop. Measuring that as "off track" hides what the racing actually did,
    // so the cooldown is counted separately.
    if (racer.finished) {
      if (d > halfRoad) s.cooldownOffRoad += STEP;
      return;
    }

    const moved = racer.physics.forwardSpeed;
    if (d > s.worstOff) s.worstOff = d;
    if (d > barrier - 2) {
      s.barrier.frames++;
      s.barrier.dist += Math.abs(moved) * STEP;
    } else if (d > halfRoad) {
      s.shoulder.frames++;
      s.shoulder.dist += Math.abs(moved) * STEP;
    } else {
      s.onRoad.frames++;
      s.onRoad.dist += Math.abs(moved) * STEP;
      if (Math.abs(moved) < 60) {
        s.slowOnRoad.frames++;
        s.slowOnRoad.dist += Math.abs(moved) * STEP;
      }
    }
    // Off-road time bucketed by lap position, one bucket per 1/20th of the lap.
    if (d > halfRoad) {
      const bin = Math.min(19, Math.floor(layout.fractionAt(racer.physics.x, racer.physics.y) * 20));
      s.offRoadByFraction[bin] += STEP;
    }
  });

  if (session.result()) break;
}

const sec = (frames: number) => (frames * STEP).toFixed(1);
console.log(`track=${trackId} asphalt 0..${halfRoad}px, barrier at ${barrier}px, race=${(steps * STEP).toFixed(1)}s\n`);
for (const s of stats) {
  console.log(
    `${s.name.padEnd(7)} ${s.car.padEnd(13)} onRoad=${sec(s.onRoad.frames).padStart(6)}s ` +
      `shoulder=${sec(s.shoulder.frames).padStart(5)}s  barrier=${sec(s.barrier.frames).padStart(5)}s ` +
      `slowOnRoad=${sec(s.slowOnRoad.frames).padStart(5)}s  worstOff=${s.worstOff.toFixed(0).padStart(4)}px ` +
      `coastOffRoad=${s.cooldownOffRoad.toFixed(1)}s`,
  );
}

console.log('\nseconds off the asphalt per 1/20th of the lap (0 = start line, scale ~1s per block):');
console.log(`  ${''.padEnd(7)} |${'0         1         2'.slice(0, 0)}`.trimEnd());
for (const s of stats) {
  const cells = s.offRoadByFraction.map((v) => {
    const n = Math.min(9, Math.floor(v));
    return n === 0 ? (v > 0.05 ? '+' : '.') : String(n);
  });
  console.log(`  ${s.name.padEnd(7)} |${cells.join('')}| total=${s.offRoadByFraction.reduce((a, b) => a + b, 0).toFixed(1)}s`);
}
console.log(`  ${''.padEnd(7)} |${'01234567890123456789'}|  (lap fraction x 0.05)`);