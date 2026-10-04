/**
 * Corner-speed sweep.
 *
 * `tools/lapModel.ts` shows what the AI's corner-speed constants *predict*. This
 * shows what the closed-loop car actually manages, by running real races at
 * increasing corner-speed multipliers and reporting both the resulting lap times
 * and how far cars stray off the centerline.
 *
 * The point is to find the most aggressive setting cars can hold: the
 * conservative one made grip the only thing that mattered, which left the fast
 * chassis corner-limited 100% of the lap and therefore worthless.
 */
import { AiDriver } from '../src/game/systems/AiDriver';
import { RaceSession } from '../src/game/systems/RaceSession';
import { TrackLayout } from '../src/game/entities/TrackLayout';
import { buildGrid, getAiProfile, type AiProfile } from '../src/game/config/racers';
import { getTrackDefinition } from '../src/game/config/tracks';
import { CHARACTERS } from '../src/data/characters';
import { CARS } from '../src/data/cars';

const STEP = 1 / 120;
const HALF_ROAD_RATIO = 1.0; // count a frame as "off road" past the asphalt

const trackId = process.argv[2] ?? 'hawkins-streets';
const layout = new TrackLayout(getTrackDefinition(trackId));
const halfRoad = layout.roadWidth / 2;

/** How hard the "player" drives, so the player slot is not idle. */
const PLAYER_PROFILE: AiProfile = {
  cornerConfidence: 0.98, pace: 0.98, nitroEagerness: 0.45,
  overtaking: 0.75, stuckSeconds: 0.9, lineBias: 0, seed: 0.5,
};

function raceWith(scale: number, playerScale: number) {
  const configs = buildGrid(CHARACTERS[0], CARS[0]);
  const playerBotHolder: { bot: AiDriver | null } = { bot: null };

  const session = new RaceSession(layout, configs, (config, tuning) => {
    const profile = getAiProfile(config.characterId);
    if (config.isPlayer) {
      playerBotHolder.bot = new AiDriver(profile, tuning);
      return null; // the player is driven from outside, as in the real game
    }
    // Scale corner confidence: it multiplies both corner limits, so this is
    // exactly equivalent to scaling aggression for the whole corner model.
    return new AiDriver({ ...profile, cornerConfidence: profile.cornerConfidence * scale }, tuning);
  });

  let worstOffRoad = 0;
  let offRoadFrames = 0;
  let totalFrames = 0;
  const perCarWorst: string[] = [];
  let steps = 0;
  const maxSteps = 120 * 60 * 6;

  while (steps < maxSteps) {
    const player = session.player;
    const rivals = session.racers
      .filter((r) => r !== player)
      .map((r) => ({ physics: r.physics, aheadInRace: r.laps.totalRaceProgress > player.laps.totalRaceProgress }));
    const bot = playerBotHolder.bot;
    const input = bot
      ? bot.update(STEP, layout, player.physics, rivals, !player.nitro.isEmpty)
      : { accelerate: true, brake: false, steer: 0, nitro: false };

    session.step(STEP, input);
    totalFrames++;

    for (let i = 0; i < session.racers.length; i++) {
      const racer = session.racers[i];
      const d = layout.locate(racer.physics.x, racer.physics.y).distance;
      if (d > worstOffRoad) worstOffRoad = d;
      if (d > halfRoad * HALF_ROAD_RATIO) {
        offRoadFrames++;
        const prev = perCarWorst[i];
        if (!prev || d > Number(prev.split('=')[1])) {
          perCarWorst[i] = `${racer.config.characterName}=${d.toFixed(0)}`;
        }
      }
    }
    steps++;
    if (session.result()) break;
  }

  const result = session.result();
  return {
    finished: result !== null,
    worstOffRoad,
    offRoadPct: totalFrames ? (offRoadFrames / (totalFrames * session.racers.length)) * 100 : 0,
    perCarWorst,
    result,
  };
}

console.log(`track=${trackId} asphalt half-width=${halfRoad}px, barrier at ${(halfRoad + 40).toFixed(0)}px\n`);
console.log('scale  finished  worstOffRoad  offRoad%   per-car worst    classification');
for (const scale of [1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.3]) {
  const r = raceWith(scale, scale);
  const times = r.result
    ? r.result.standings
        .map((s) => `${s.position}.${s.characterName} ${((s.finishTimeMs ?? 0) / 1000).toFixed(1)}s`)
        .join('  ')
    : 'DNF';
  console.log(
    `${scale.toFixed(2).padStart(5)}  ${String(r.finished).padStart(8)}  ` +
      `${r.worstOffRoad.toFixed(0).padStart(9)}px  ${r.offRoadPct.toFixed(1).padStart(6)}%  ` +
      `${r.perCarWorst.filter(Boolean).join(' ').padEnd(28)}  ${times}`,
  );
}