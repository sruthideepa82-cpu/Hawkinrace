import { useEffect, useRef } from 'react';

interface Particle { x: number; y: number; r: number; vy: number; vx: number; a: number; hue: number }

/** Slow rising embers. Cheap: no blur, ~70 dots, stops on unmount. */
export function Particles({ count = 70 }: { count?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let w = 0;
    let h = 0;
    const resize = () => {
      w = canvas.width = canvas.clientWidth;
      h = canvas.height = canvas.clientHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const make = (initial: boolean): Particle => ({
      x: Math.random() * w,
      y: initial ? Math.random() * h : h + 10,
      r: 0.8 + Math.random() * 2.2,
      vy: -(8 + Math.random() * 22),
      vx: (Math.random() - 0.5) * 8,
      a: 0.15 + Math.random() * 0.5,
      hue: Math.random() < 0.65 ? 345 : 270,
    });
    const ps = Array.from({ length: count }, () => make(true));

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y < -10) ps[i] = make(false);
        ctx.fillStyle = `hsla(${p.hue}, 100%, 62%, ${p.a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [count]);

  return <canvas ref={ref} className="particles" aria-hidden="true" />;
}
