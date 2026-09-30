import { useEffect, useRef } from "react";

/**
 * Soft gradient wave lines — decorative background for the login hero.
 * Each line is a sum of travelling sine waves, redrawn per animation frame.
 */
const WAVES = [
  { y: 540, w: 1.6, o: 0.9 },
  { y: 580, w: 1.2, o: 0.7 },
  { y: 620, w: 1, o: 0.55 },
  { y: 660, w: 0.9, o: 0.42 },
  { y: 700, w: 0.8, o: 0.32 },
  { y: 740, w: 0.7, o: 0.24 },
  { y: 780, w: 0.6, o: 0.18 },
];

const X_START = -100;
const X_END = 1300;
const STEP = 25;

function wavePath(baseY: number, index: number, t: number): string {
  const lag = index * 0.35;
  const yAt = (x: number) =>
    baseY +
    70 * Math.sin(x * 0.0055 - t * 0.45 + lag) +
    28 * Math.sin(x * 0.011 + t * 0.3 + lag * 1.7) +
    12 * Math.sin(x * 0.019 - t * 0.8 + lag * 0.6);

  const pts: [number, number][] = [];
  for (let x = X_START; x <= X_END; x += STEP) pts.push([x, yAt(x)]);

  // Quadratic segments through midpoints keep the line smooth with few points.
  let d = `M${pts[0][0]} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [cx, cy] = pts[i];
    const mx = (cx + pts[i + 1][0]) / 2;
    const my = (cy + pts[i + 1][1]) / 2;
    d += ` Q${cx} ${cy.toFixed(1)} ${mx} ${my.toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  d += ` L${last[0]} ${last[1].toFixed(1)}`;
  return d;
}

export function LoginSceneBg() {
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const haloRef = useRef<SVGPathElement | null>(null);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      WAVES.forEach((wave, i) => {
        const d = wavePath(wave.y, i, t);
        pathRefs.current[i]?.setAttribute("d", d);
        if (i === 0) haloRef.current?.setAttribute("d", d);
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="login-scene login-scene--waves" aria-hidden>
      <div className="login-scene__glow" />
      <svg
        className="login-scene__waves"
        viewBox="0 0 1200 900"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="login-wave-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--wave-a)" stopOpacity="0" />
            <stop offset="25%" stopColor="var(--wave-a)" />
            <stop offset="60%" stopColor="var(--wave-b)" />
            <stop offset="100%" stopColor="var(--wave-b)" stopOpacity="0" />
          </linearGradient>
          <filter id="login-wave-blur" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        <path
          ref={haloRef}
          className="login-scene__wave-halo"
          d={wavePath(WAVES[0].y, 0, 0)}
          stroke="url(#login-wave-grad)"
          strokeWidth={10}
          fill="none"
          filter="url(#login-wave-blur)"
        />
        {WAVES.map((wave, i) => (
          <path
            key={i}
            ref={(el) => {
              pathRefs.current[i] = el;
            }}
            className="login-scene__wave"
            d={wavePath(wave.y, i, 0)}
            stroke="url(#login-wave-grad)"
            strokeWidth={wave.w}
            strokeOpacity={wave.o}
            strokeLinecap="round"
            fill="none"
          />
        ))}
      </svg>
    </div>
  );
}
