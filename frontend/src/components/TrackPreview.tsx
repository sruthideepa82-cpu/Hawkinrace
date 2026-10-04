export function TrackPreview({ trackId }: { trackId: string }) {
  const getScenery = () => {
    switch(trackId) {
      case 'hawkins-streets':
        return (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, #070612, #1a0b26)' }}>
            <div style={{ position: 'absolute', bottom: '20px', left: 0, right: 0, height: '40px', background: '#111', transform: 'perspective(100px) rotateX(60deg)' }} />
            <div style={{ position: 'absolute', bottom: '40px', left: '20%', width: '10px', height: '40px', background: '#333' }} />
            <div style={{ position: 'absolute', bottom: '80px', left: '15%', width: '20px', height: '20px', background: 'radial-gradient(circle, #ff5c8a, transparent)', borderRadius: '50%' }} />
          </div>
        );
      case 'starcourt-run':
        return (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, #110515, #220a2a)' }}>
            <div style={{ position: 'absolute', top: '30%', left: '10%', right: '10%', height: '30px', background: '#1a1a1a', border: '1px solid #ff2e63', boxShadow: '0 0 10px #ff2e63', display: 'grid', placeItems: 'center', color: '#ff2e63', fontSize: '10px', fontFamily: 'var(--display)' }}>STARCOURT</div>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '30px', background: '#0a0a0a' }} />
          </div>
        );
      case 'hawkins-forest':
        return (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, #020a05, #0a1a10)' }}>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '100%', background: 'linear-gradient(to right, #000 10%, transparent 40%, transparent 60%, #000 90%)' }} />
            <div style={{ position: 'absolute', bottom: '0', left: '10%', width: '20px', height: '80px', background: '#0a0a0a' }} />
            <div style={{ position: 'absolute', bottom: '0', right: '15%', width: '15px', height: '60px', background: '#0a0a0a' }} />
          </div>
        );
      case 'hawkins-lab':
        return (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, #050a12, #101a26)' }}>
            <div style={{ position: 'absolute', bottom: 0, left: '20%', right: '20%', height: '60px', background: '#111', borderTop: '2px solid #333' }} />
            <div style={{ position: 'absolute', top: '20px', right: '30%', width: '10px', height: '10px', background: 'red', borderRadius: '50%', boxShadow: '0 0 10px red', animation: 'blink 1s infinite' }} />
          </div>
        );
      case 'upside-down':
        return (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, #260505, #120202)' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '100%', background: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22 opacity=%220.1%22/%3E%3C/svg%3E")' }} />
            <div style={{ position: 'absolute', bottom: 0, left: '30%', width: '40px', height: '100px', background: '#0a0000', clipPath: 'polygon(50% 0, 100% 100%, 0 100%)', transform: 'rotate(180deg)' }} />
          </div>
        );
      default:
        return <div className="track-preview empty">?</div>;
    }
  };

  return (
    <div className="track-preview" style={{ position: 'relative', overflow: 'hidden' }} aria-hidden="true">
      {getScenery()}
    </div>
  );
}
