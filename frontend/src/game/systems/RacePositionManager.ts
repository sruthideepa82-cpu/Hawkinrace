import type { Racer } from './RaceSession';
import type { StandingEntry } from '../bridge';

export class RacePositionManager {
  constructor(private readonly racers: readonly Racer[]) {}

  /** Live ranking. Finished cars hold their finish slot; the rest sort on progress. */
  standings(): StandingEntry[] {
    const rows = this.racers.map((racer, i) => ({
      racer,
      index: i,
      progress: racer.laps.totalRaceProgress,
      tiebreak: racer.laps.progressTiebreak,
    }));

    rows.sort((a, b) => {
      const aDone = a.racer.finishPosition !== null;
      const bDone = b.racer.finishPosition !== null;
      if (aDone && bDone) return (a.racer.finishPosition ?? 0) - (b.racer.finishPosition ?? 0);
      if (aDone) return -1;
      if (bDone) return 1;
      if (b.progress !== a.progress) return b.progress - a.progress;
      return b.tiebreak - a.tiebreak;
    });

    return rows.map((row, i) => row.racer.standing(i + 1));
  }

  playerPosition(): number {
    const board = this.standings();
    return board.find((s) => s.isPlayer)?.position ?? 1;
  }
}
