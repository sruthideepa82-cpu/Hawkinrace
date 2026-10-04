/** Diagnostic: why do cars fail to finish / leave the road? */
import { TrackLayout } from '../src/game/entities/TrackLayout';
import { getTrackDefinition } from '../src/game/config/tracks';
import { buildGrid, getAiProfile } from '../src/game/config/racers';
import { RaceSession } from '../src/game/systems/RaceSession';
import { AiDriver } from '../src/game/systems/AiDriver';
import { CHARACTERS } from '../src/data/characters';
import { CARS } from '../src/data/cars';
import type { InputState } from '../src/game/entities/CarPhysics';

const STEP = 1 / 120;
const trackId = process.argv[2] ?? 'hawkins-streets';
const seconds = Number(process.argv[3] ?? 120);

const layout = new TrackLayout(getTrackDefinition(trackId));
console.log(`track=${trackId} trackLength=${layout.trackLength.toFixed(0)} samples=${layout.centerline.length} roadWidth=${layout.roadWidth}`);
console.log(`gatesPerLap=${layout.gatesPerLap} finishFraction=${layout.finishFraction.toFixed(4)} cpFractions=${layout.checkpointFractions.map((f) => f.toFixed(3)).join(',')}`);

// Tightest corner radius over the whole lap.
let minRadius = Infinity;
let minRadiusAt = 0;
for (let f = 0; f < 1; f += 0.002) {
  const r = layout.cornerRadiusAhead(f, 400);
  if (r < minRadius) { minRadius = r; minRadiusAt = f; }
}
console.log(`tightest corner radius=${minRadius.toFixed(0)}px at fraction ${minRadiusAt.toFixed(3)}`);

const session = new RaceSession(layout, buildGrid(CHARACTERS[0], CARS[0]));
const player = session.player;
const bot = new AiDriver(getAiProfile('steve'), player.tuning);

const steps = Math.floor(seconds / STEP);
let lastReport = 0;

for (let step = 0; step < steps; step++) {
  if (session.race.isFinished) break;

  const rivals = session.racers.filter((r) => r !== player)
    .map((r) => ({ physics: r.physics, aheadInRace: r.laps.totalRaceProgress > player.laps.totalRaceProgress }));
  const input: InputState = session.race.isRacing
    ? bot.update(STEP, layout, player.physics, rivals, !player.nitro.isEmpty)
    : { accelerate: false, brake: false, steer: 0, nitro: false };

  session.step(STEP, input);
  const t = step * STEP;

  if (t - lastReport >= 15) {
    lastReport = t;
    const rows = session.standings().map((s) =>
      `${s.position}.${s.characterName} L${s.lap} cp${s.checkpoint}/${s.totalCheckpoints} p${s.progress.toFixed(2)}` +
      ` v${Math.round(session.racers.find((r) => r.config.characterId === s.characterId)!.physics.speed)}` +
      ` off${Math.round(layout.locate(session.racers.find((r) => r.config.characterId === s.characterId)!.physics.x, session.racers.find((r) => r.config.characterId === s.characterId)!.physics.y).distance)}`);
    console.log(`t=${t.toFixed(0)}s  ${rows.join('  ')}`);
  }
}

console.log('--- final ---');
for (const r of session.racers) {
  const f = layout.fractionAt(r.physics.x, r.physics.y);
  console.log(`${r.config.characterName}: lap=${r.laps.currentLap} cp=${r.laps.currentCheckpoint} finished=${r.finished} pos=${r.finishPosition} progress=${r.laps.totalRaceProgress.toFixed(2)} frac=${f.toFixed(3)} speed=${r.physics.speed.toFixed(0)} offTrack=${layout.locate(r.physics.x, r.physics.y).distance.toFixed(0)}`);
}
console.log(`race finished: ${session.race.isFinished} elapsed=${(session.race.elapsed / 1000).toFixed(1)}s`);