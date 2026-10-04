export function TrackPreview({ trackId }: { trackId: string }) {
  return (
    <div className="track-preview" style={{ position: 'relative', overflow: 'hidden' }} aria-hidden="true">
      <img
        src={`/assets/tracks/${trackId}.png`}
        alt={`Preview of ${trackId}`}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  );
}
