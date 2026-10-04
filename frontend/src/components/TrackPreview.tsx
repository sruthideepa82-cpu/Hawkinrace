import { getTrackDefinition, TRACKS as PLAYABLE_TRACKS } from '../game/config/tracks';
import { smoothClosedLoop } from '../game/utils/geometry';

/** Outline of a playable track, drawn from the same data the race uses. */
export function TrackPreview({ trackId }: { trackId: string }) {
  if (!PLAYABLE_TRACKS[trackId]) return <div className="track-preview empty">?</div>;
  const def = getTrackDefinition(trackId);
  const pts = smoothClosedLoop(def.controlPoints, 8);
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(' ') + ' Z';
  return (
    <svg className="track-preview" viewBox={`0 0 ${def.worldWidth} ${def.worldHeight}`} aria-hidden="true">
      <path d={d} fill="none" stroke="var(--red)" strokeOpacity="0.25" strokeWidth={def.roadWidth + 40} strokeLinejoin="round" />
      <path d={d} fill="none" stroke="#2a2a3a" strokeWidth={def.roadWidth} strokeLinejoin="round" />
      <path d={d} fill="none" stroke="var(--pink)" strokeWidth="14" strokeDasharray="40 50" strokeLinejoin="round" />
    </svg>
  );
}
