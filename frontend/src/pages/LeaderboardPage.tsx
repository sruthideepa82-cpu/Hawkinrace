import { useEffect, useState } from 'react';
import { NeonButton } from '../components/NeonButton';
import { ScreenFrame } from '../components/ScreenFrame';
import { TRACKS } from '../data/tracks';
import { formatRaceTime } from '../game/utils/geometry';
import { useRouter } from '../router/RouterProvider';
import { getLeaderboard, getPlayerRaces, type LeaderboardEntry } from '../services/api';

type Status = 'loading' | 'ready' | 'error';

/** One rendered row. The time is always for the track in scope, never overall. */
interface BoardRow {
  key: string;
  playerId: string;
  displayName: string;
  carId: string;
  timeMs: number;
  racesCompleted: number;
}

/** Rows are shown at most this many, which also bounds the history fetches. */
const BOARD_SIZE = 25;

const ALL_TRACKS = 'all';

/**
 * Online leaderboard, from GET /api/leaderboard.
 *
 * The backend ranks **players overall**, scored across every race they have on
 * record. This screen is per-track, so when a track is selected each visible
 * player's best time *on that track* is read from their race history instead.
 * Showing the overall best under a track tab would misreport it as a time on
 * that track.
 *
 * A per-track ranking computed server-side is a Phase 5/6 item -- see the
 * backend README. Until then this is the honest version, at the cost of one
 * small request per visible player, which is bounded by BOARD_SIZE.
 */
export function LeaderboardPage() {
  const { navigate } = useRouter();
  const [scope, setScope] = useState<string>(ALL_TRACKS);
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setRows([]);

    (async () => {
      try {
        const board = await getLeaderboard({ sortBy: 'bestTimeMs', order: 'asc', size: BOARD_SIZE });

        if (scope === ALL_TRACKS) {
          if (!active) return;
          setRows(board.entries.map(toRow));
          setStatus('ready');
          return;
        }

        // Per-track: keep only players who have actually raced here, and show
        // their quickest lap-level total on this track.
        const entries = await Promise.all(
          board.entries.map(async (entry) => {
            const races = await getPlayerRaces(entry.playerId);
            const best = races
              .filter((race) => race.trackId === scope)
              .reduce<number | null>(
                (lowest, race) => (lowest === null || race.elapsedTimeMs < lowest ? race.elapsedTimeMs : lowest),
                null,
              );
            return best === null ? null : toRow(entry, best);
          }),
        );

        if (!active) return;
        setRows(entries.filter((row): row is BoardRow => row !== null));
        setStatus('ready');
      } catch (error) {
        console.warn('[backend] Leaderboard unavailable:', error);
        if (active) setStatus('error');
      }
    })();

    return () => {
      active = false;
    };
  }, [scope]);

  const scopeLabel =
    scope === ALL_TRACKS ? 'ALL TRACKS' : (TRACKS.find((t) => t.id === scope)?.name ?? 'TRACK');

  return (
    <ScreenFrame title="LEADERBOARD" onBack={() => navigate('menu')}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <NeonButton
          variant={scope === ALL_TRACKS ? 'primary' : 'ghost'}
          onClick={() => setScope(ALL_TRACKS)}
        >
          ALL
        </NeonButton>
        {TRACKS.map((t) => (
          <NeonButton
            key={t.id}
            variant={t.id === scope ? 'primary' : 'ghost'}
            onClick={() => setScope(t.id)}
          >
            {t.name}
          </NeonButton>
        ))}
      </div>

      {status === 'loading' && <p className="muted">LOADING TIMES…</p>}

      {status === 'error' && (
        <div className="placeholder">
          <div className="placeholder-icon" aria-hidden="true">⚠</div>
          <p>BACKEND OFFLINE</p>
          <small>Start the Spring Boot server on http://localhost:8080 and try again.</small>
        </div>
      )}

      {status === 'ready' && rows.length === 0 && (
        <div className="placeholder">
          <div className="placeholder-icon" aria-hidden="true">🏁</div>
          <p>NO TIMES YET</p>
          <small>Finish a race to set the first time.</small>
        </div>
      )}

      {status === 'ready' && rows.length > 0 && (
        <div className="telemetry-panel">
          <h3 className="telemetry-title">{scopeLabel} — FASTEST TIMES</h3>
          <div className="telemetry-list">
            {rows.map((row, index) => (
              <div key={row.key} className="telemetry-row">
                <span className="t-pos">{String(index + 1).padStart(2, '0')}</span>
                <span className="t-name">{row.displayName}</span>
                <span className="t-time" style={{ marginRight: '16px' }}>{row.carId}</span>
                <span className="t-time">{formatRaceTime(row.timeMs)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </ScreenFrame>
  );
}

/** Uses an explicit per-track time when one was supplied. */
function toRow(entry: LeaderboardEntry, trackBestMs: number = entry.bestTimeMs): BoardRow {
  return {
    key: entry.playerId,
    playerId: entry.playerId,
    displayName: entry.displayName,
    carId: entry.carId,
    timeMs: trackBestMs,
    racesCompleted: entry.racesCompleted,
  };
}