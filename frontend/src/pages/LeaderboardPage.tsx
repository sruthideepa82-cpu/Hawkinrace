import { useEffect, useState } from 'react';
import { NeonButton } from '../components/NeonButton';
import { ScreenFrame } from '../components/ScreenFrame';
import { TRACKS } from '../data/tracks';
import { formatRaceTime } from '../game/utils/geometry';
import { useRouter } from '../router/RouterProvider';
import { getLeaderboard, type LeaderboardEntry } from '../services/api';
import { loadReferenceData } from '../services/backend';
import { useGameStore } from '../store/GameStore';

type Status = 'loading' | 'ready' | 'error';

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Online leaderboard, served by GET /api/leaderboard/{trackId}.
 *
 * The local track list provides the labels; the backend provides the times.
 * A player appears once with their fastest run per track.
 */
export function LeaderboardPage() {
  const { navigate } = useRouter();
  const { state } = useGameStore();
  const [trackId, setTrackId] = useState(state.selectedTrackId ?? TRACKS[0].id);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setEntries([]);

    const local = TRACKS.find((t) => t.id === trackId) ?? TRACKS[0];
    (async () => {
      try {
        const { tracks } = await loadReferenceData();
        const remote = tracks.find((t) => sameName(t.name, local.name));
        if (!remote) throw new Error(`Track "${local.name}" is not in the backend`);
        const board = await getLeaderboard(remote.id);
        if (active) {
          setEntries(board);
          setStatus('ready');
        }
      } catch (error) {
        console.warn('[backend] Leaderboard unavailable:', error);
        if (active) setStatus('error');
      }
    })();

    return () => {
      active = false;
    };
  }, [trackId]);

  return (
    <ScreenFrame title="LEADERBOARD" onBack={() => navigate('menu')}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
        {TRACKS.map((t) => (
          <NeonButton
            key={t.id}
            variant={t.id === trackId ? 'primary' : 'ghost'}
            onClick={() => setTrackId(t.id)}
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

      {status === 'ready' && entries.length === 0 && (
        <div className="placeholder">
          <div className="placeholder-icon" aria-hidden="true">🏁</div>
          <p>NO TIMES YET</p>
          <small>Finish a race on this track to set the first time.</small>
        </div>
      )}

      {status === 'ready' && entries.length > 0 && (
        <div className="telemetry-panel">
          <h3 className="telemetry-title">
            {TRACKS.find((t) => t.id === trackId)?.name ?? 'TRACK'} — FASTEST TIMES
          </h3>
          <div className="telemetry-list">
            {entries.map((entry) => (
              <div key={entry.playerId} className="telemetry-row">
                <span className="t-pos">{String(entry.position).padStart(2, '0')}</span>
                <span className="t-name">{entry.username}</span>
                <span className="t-time" style={{ marginRight: '16px' }}>{entry.carName}</span>
                <span className="t-time">{formatRaceTime(entry.totalTime * 1000)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </ScreenFrame>
  );
}
