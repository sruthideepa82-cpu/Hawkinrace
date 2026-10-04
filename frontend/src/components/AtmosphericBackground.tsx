import { Particles } from './Particles';

export function AtmosphericBackground() {
  return (
    <div className="atmospheric-background" aria-hidden="true">
      <div className="sky"></div>
      <div className="stars"></div>
      <Particles count={60} />
      <div className="fog"></div>
      <div className="distant-city">
        <div className="water-tower"></div>
        <div className="trees"></div>
      </div>
      <div className="vignette"></div>
      <div className="crt-overlay"></div>
      <div className="scanlines"></div>
      <div className="grain"></div>
    </div>
  );
}
