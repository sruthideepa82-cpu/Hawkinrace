import { useCallback, useEffect, useState } from 'react';
import { NeonButton } from '../components/NeonButton';
import { ScreenFrame } from '../components/ScreenFrame';
import { TRACKS } from '../data/tracks';
import { formatRaceTime } from '../game/utils/geometry';
import { usePlayerProfile } from '../hooks/usePlayerProfile';
import { useRouter } from '../router/RouterProvider';
import {
  getLeaderboard,
  getPlayerRaces,
  type LeaderboardEntry,
  type RaceRecord,
} from '../services/api';
import { useGameStore } from '../store/GameStore';

type Status = 'loading' | 'ready' | 'error';

/** One rendered leaderboard row. The time is always for the track in scope. */
interface BoardRow {
  key: string;
  playerId: string;
  displayName: string;
  carId: string;
  timeMs: number;
  racesCompleted: number;
}

const ALL_TRACKS = 'all';
const PAGE_SIZE = 10;

/**
 * Database-backed leaderboard and the player's own race history.
 *
 * Three rules this screen follows:
 *
 *  - **Never invent rows.** If the API fails, the screen says so. A hardcoded
 *    or local fallback board would look identical to a real one and quietly
 *    misrepresent who has actually driven what.
 *  - **Never show a time that is not the one it claims to be.** When Phase 7
 *    locked race history to its owner, the old per-track filter -- which read
 *    every visible player's history to find their best on that track -- stopped
 *    working, and would have been wrong to re-enable by loosening the API. So
 *    the track buttons now choose a *scope for the board itself*, and each row
 *    shows that player's own overall best. A player whose quickest lap is
 *    elsewhere on the board is showing a real number for a real time, which is
 *    the most that public data can honestly support.
 *  - **Refetch after a save.** `leaderboardVersion` bumps when a race is
 *    confirmed stored, so the player's own new time appears without a manual
 *    refresh. Otherwise a successful save would look like it had failed.
 */
export function LeaderboardPage() {
  const { navigate } = useRouter();
  const { state } = useGameStore();
  const { profile } = usePlayerProfile();

  const [scope, setScope] = useState<string>(ALL_TRACKS);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [status, setStatus] = useState<Status>('loading');
  const [history, setHistory] = useState<RaceRecord[] | null>(null);

  // Changing the scope invalidates the current page number; keeping page 3 while
  // switching to a track with one page of results would show an empty board.
  const changeScope = useCallback((next: string) => {
    setScope(next);
    setPage(0);
  }, []);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setRows([]);

    (async () => {
      try {
        const board = await getLeaderboard({
          sortBy: 'bestTimeMs',
          order: 'asc',
          page,
          size: PAGE_SIZE,
        });
        if (!active) return;
        setTotalPages(board.totalPages);

        // One request for the whole board. Previously this fanned out to
        // `GET /api/players/{id}/races` for every visible player to find their
        // time on the selected track. That endpoint is now owner-only, which is
        // the correct behaviour -- so the fan-out is gone rather than the API
        // being loosened to suit a screen.
        if (!active) return;
        setRows(
            board.entries
              .filter((entry) => scope === ALL_TRACKS || entry.trackId === scope)
              .map((entry) => toRow(entry)),
        );
        setStatus('ready');
      } catch (error) {
        console.warn('[backend] Leaderboard unavailable:', error);
        if (active) setStatus('error');
      }
    })();

    return () => {
      active = false;
    };
    // `state.leaderboardVersion` is a deliberate dependency: it is how a
    // confirmed save makes this screen refetch.
  }, [scope, page, state.leaderboardVersion]);

  // The player's own history, refreshed on the same signal as the board.
  useEffect(() => {
    if (!profile) {
      setHistory(null);
      return;
    }
    let active = true;
    getPlayerRaces(profile.id)
      .then((races) => {
        if (active) setHistory(races);
      })
      .catch((error) => {
        console.warn('[backend] Race history unavailable:', error);
        if (active) setHistory(null);
      });
    return () => {
      active = false;
    };
  }, [profile, state.leaderboardVersion]);

  const scopeLabel =
    scope === ALL_TRACKS ? 'ALL TRACKS' : (TRACKS.find((t) => t.id === scope)?.name ?? 'TRACK');

  return (
    <ScreenFrame title="LEADERBOARD" onBack={() => navigate('menu')}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <NeonButton
          variant={scope === ALL_TRACKS ? 'primary' : 'ghost'}
          onClick={() => changeScope(ALL_TRACKS)}
        >
          ALL
        </NeonButton>
        {TRACKS.map((t) => (
          <NeonButton
            key={t.id}
            variant={t.id === scope ? 'primary' : 'ghost'}
            onClick={() => changeScope(t.id)}
          >
            {t.name}
          </NeonButton>
        ))}
      </div>

      {status === 'loading' && <p className="muted">LOADING TIMES…</p>}

      {status === 'error' && (
        <div className="placeholder">
          <div className="placeholder-icon" aria-hidden="true">⚠</div>
          <p>LEADERBOARD UNAVAILABLE</p>
          <small>
            The backend could not be reached. Start it on http://localhost:8080 and try again. No times are
            shown rather than guessed.
          </small>
        </div>
      )}

      {status === 'ready' && rows.length === 0 && (
        <div className="placeholder">
          <div className="placeholder-icon" aria-hidden="true">🏁</div>
          <p>NO TIMES YET</p>
          <small>Finish a race on this track to set the first time.</small>
        </div>
      )}

      {status === 'ready' && rows.length > 0 && (
        <>
          <div className="telemetry-panel">
            <h3 className="telemetry-title">{scopeLabel} — FASTEST TIMES</h3>
            <div className="telemetry-list">
              {rows.map((row, index) => (
                <div key={row.key} className="telemetry-row">
                  <span className="t-pos">{String(page * PAGE_SIZE + index + 1).padStart(2, '0')}</span>
                  <span className="t-name">{row.displayName}</span>
                  <span className="t-time" style={{ marginRight: '16px' }}>{row.carId}</span>
                  <span className="t-time">{formatRaceTime(row.timeMs)}</span>
                </div>
              ))}
            </div>
          </div>

          {totalPages > 1 && (
            <div className="leaderboard-paging">
              <NeonButton variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                PREV
              </NeonButton>
              <span className="muted">
                PAGE {page + 1} / {totalPages}
              </span>
              <NeonButton
                variant="ghost"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                NEXT
              </NeonButton>
            </div>
          )}
        </>
      )}

      <PlayerHistory profileId={profile?.id ?? null} races={history} />
    </ScreenFrame>
  );
}

/**
 * This player's own races, newest first.
 *
 * Straight from the database, so it survives a reload and a cleared browser.
 * The empty state says what to do rather than just showing nothing, because
 * "no data" and "not loaded" look identical without it.
 */
function PlayerHistory({ profileId, races }: { profileId: string | null; races: RaceRecord[] | null }) {
  if (!profileId) return null;

  return (
    <div className="telemetry-panel leaderboard-history">
      <h3 className="telemetry-title">YOUR RACES</h3>

      {/* null means still loading or unavailable; [] means genuinely no races.
          The two are different and are not collapsed into one. */}
      {races === null ? (
        <p className="muted">Loading your races…</p>
      ) : races.length === 0 ? (
        <p className="muted">You have not completed a race yet. Finish one and it will appear here.</p>
      ) : (
        <div className="telemetry-list">
          {races.slice(0, 10).map((race) => (
            <div key={race.id} className="telemetry-row">
              <span className="t-pos">P{race.position}</span>
              <span className="t-name">{race.trackId}</span>
              <span className="t-time" style={{ marginRight: '16px' }}>{race.carId}</span>
              <span className="t-time">{formatRaceTime(race.elapsedTimeMs)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
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