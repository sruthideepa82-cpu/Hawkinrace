/** Fine-grained trace of a single car's first seconds. */
import { TrackLayout } from '../src/game/entities/TrackLayout';
import { getTrackDefinition } from '../src/game/config/tracks';
import { buildGrid, getAiProfile } from '../src/game/config/racers';
import { RaceSession } from '../src/game/systems/RaceSession';
import { AiDriver } from '../src/game/systems/AiDriver';
import { CHARACTERS } from '../src/data/characters';
import { CARS } from '../src/data/cars';
import type { InputState } from '../src/game/entities/CarPhysics';

const STEP = 1 / 120;
const layout = new TrackLayout(getTrackDefinition('hawkins-streets'));
const session = new RaceSession(layout, buildGrid(CHARACTERS[0], CARS[0]));
const player = session.player;
const bot = new AiDriver(getAiProfile('steve'), player.tuning);

console.log('spawn:', JSON.stringify(layout.spawn));
console.log('grid:');
for (const r of session.racers) {
  const loc = layout.locate(r.physics.x, r.physics.y);
  console.log(`  ${r.config.characterName.padEnd(7)} x=${r.physics.x.toFixed(0)} y=${r.physics.y.toFixed(0)} h=${(r.physics.heading * 180 / Math.PI).toFixed(1)}deg frac=${loc.fraction.toFixed(4)} off=${loc.distance.toFixed(0)}`);
}

// Where is the nearest centerline point and its tangent vs the car heading?
const loc0 = layout.locate(layout.spawn.x, layout.spawn.y);
console.log(`\nspawn nearest centerline: ${JSON.stringify(loc0.point)} tangentHeading=${(Math.atan2(layout.directionAt(loc0.index).y, layout.directionAt(loc0.index).x) * 180 / Math.PI).toFixed(1)}deg`);

let last = -1;
for (let step = 0; step < 120 * 25; step++) {
  const rivals = session.racers.filter((r) => r !== player)
    .map((r) => ({ physics: r.physics, aheadInRace: r.laps.totalRaceProgress > player.laps.totalRaceProgress }));
  const input: InputState = session.race.isRacing
    ? bot.update(STEP, layout, player.physics, rivals, !player.nitro.isEmpty)
    : { accelerate: false, brake: false, steer: 0, nitro: false };
  session.step(STEP, input);

  const t = step * STEP;
  if (t - last < 0.5) continue;
  last = t;
  const rows = session.racers.map((r) => {
    const l = layout.locate(r.physics.x, r.physics.y);
    return `${r.config.characterName.slice(0, 4)} f${l.fraction.toFixed(3)} off${l.distance.toFixed(0).padStart(3)} v${r.physics.speed.toFixed(0).padStart(3)} cp${r.laps.currentCheckpoint}`;
  });
  console.log(`t=${t.toFixed(1).padStart(5)}  ${rows.join(' | ')}`);
}