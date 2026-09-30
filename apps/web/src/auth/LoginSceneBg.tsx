import { useEffect, useRef } from "react";

/**
 * Decorative login hero background: flowing gradient wave lines, coins of the
 * supported chains riding the waves, and drifting "block" shapes linked like a chain.
 * Everything is driven by one requestAnimationFrame loop writing SVG attributes.
 */
const WAVES = [
  { y: 590, w: 1.6, o: 0.9 },
  { y: 628, w: 1.2, o: 0.7 },
  { y: 666, w: 1, o: 0.55 },
  { y: 704, w: 0.9, o: 0.42 },
  { y: 742, w: 0.8, o: 0.32 },
  { y: 780, w: 0.7, o: 0.24 },
  { y: 818, w: 0.6, o: 0.18 },
];

type CoinId = "usdt" | "usdc" | "eth" | "trx" | "sol";

const COINS: { id: CoinId; wave: number; x0: number; speed: number; size: number; lift: number }[] = [
  { id: "usdt", wave: 0, x0: 120, speed: 38, size: 1.5, lift: 26 },
  { id: "trx", wave: 0, x0: 470, speed: 38, size: 1.3, lift: 26 },
  { id: "eth", wave: 0, x0: 820, speed: 38, size: 1.3, lift: 26 },
  { id: "sol", wave: 1, x0: 480, speed: 32, size: 1.2, lift: 24 },
  { id: "usdc", wave: 1, x0: 1180, speed: 32, size: 1.2, lift: 24 },
  { id: "trx", wave: 2, x0: 1100, speed: 27, size: 1.05, lift: 22 },
  { id: "usdc", wave: 2, x0: 260, speed: 27, size: 1.05, lift: 22 },
  { id: "eth", wave: 2, x0: 680, speed: 27, size: 1.05, lift: 22 },
  { id: "sol", wave: 3, x0: 150, speed: 24, size: 0.95, lift: 21 },
  { id: "usdt", wave: 3, x0: 850, speed: 24, size: 0.95, lift: 21 },
  { id: "usdt", wave: 4, x0: 700, speed: 21, size: 0.9, lift: 20 },
  { id: "eth", wave: 5, x0: 40, speed: 17, size: 0.8, lift: 18 },
  { id: "trx", wave: 6, x0: 400, speed: 15, size: 0.7, lift: 16 },
];

const SHAPES: { kind: "hex" | "cube"; x: number; y: number; r: number; spin: number; phase: number }[] = [
  { kind: "cube", x: 860, y: 170, r: 34, spin: 6, phase: 0 },
  { kind: "hex", x: 1010, y: 300, r: 22, spin: -9, phase: 1.3 },
  { kind: "cube", x: 760, y: 360, r: 24, spin: 8, phase: 2.1 },
  { kind: "hex", x: 560, y: 250, r: 16, spin: 12, phase: 3.4 },
  { kind: "cube", x: 330, y: 400, r: 20, spin: -7, phase: 4.2 },
  { kind: "hex", x: 1120, y: 120, r: 14, spin: 10, phase: 5.1 },
];

const LINKS: [number, number][] = [
  [0, 1],
  [0, 2],
  [2, 3],
  [3, 4],
  [1, 5],
];

const X_START = -100;
const X_END = 1300;
const STEP = 25;
const SPAN = X_END - X_START;
const DEG = 180 / Math.PI;

function waveY(index: number, x: number, t: number): number {
  const lag = index * 0.35;
  return (
    WAVES[index].y +
    70 * Math.sin(x * 0.0055 - t * 0.45 + lag) +
    28 * Math.sin(x * 0.011 + t * 0.3 + lag * 1.7) +
    12 * Math.sin(x * 0.019 - t * 0.8 + lag * 0.6)
  );
}

function wavePath(index: number, t: number): string {
  const pts: [number, number][] = [];
  for (let x = X_START; x <= X_END; x += STEP) pts.push([x, waveY(index, x, t)]);

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

function coinFrame(i: number, t: number) {
  const c = COINS[i];
  const x = X_START + ((((c.x0 + c.speed * t - X_START) % SPAN) + SPAN) % SPAN);
  const y = waveY(c.wave, x, t) - c.lift * c.size;
  const slope = (waveY(c.wave, x + 4, t) - waveY(c.wave, x - 4, t)) / 8;
  const tilt = Math.atan(slope) * DEG * 0.7;
  const flip = 0.25 + 0.75 * Math.abs(Math.cos(t * 0.9 + i * 1.7));
  const edge = Math.min(x - X_START, X_END - x);
  const fade = Math.max(0, Math.min(1, edge / 160));
  return {
    transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${tilt.toFixed(1)}) scale(${(c.size * flip).toFixed(3)} ${c.size})`,
    opacity: (fade * Math.min(1, 0.35 + 0.5 * c.size)).toFixed(3),
  };
}

function shapePos(i: number, t: number): [number, number] {
  const s = SHAPES[i];
  return [s.x + 14 * Math.sin(t * 0.25 + s.phase), s.y + 18 * Math.sin(t * 0.4 + s.phase * 1.3)];
}

function shapeTransform(i: number, t: number): string {
  const [x, y] = shapePos(i, t);
  const a = SHAPES[i].spin * t + SHAPES[i].phase * 20;
  return `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${a.toFixed(1)})`;
}

function hexPoints(r: number): string {
  return Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 3) * k - Math.PI / 2;
    return `${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

function CoinDefs() {
  const face = (color: string) => (
    <>
      <circle r="22" fill={color} />
      <circle r="22" fill="url(#login-coin-shine)" />
      <circle r="19.5" fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="1" />
    </>
  );
  return (
    <>
      <radialGradient id="login-coin-shine" cx="0.32" cy="0.28" r="0.8">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.45" />
        <stop offset="55%" stopColor="#fff" stopOpacity="0.06" />
        <stop offset="100%" stopColor="#000" stopOpacity="0.25" />
      </radialGradient>
      <radialGradient id="login-coin-halo">
        <stop offset="0%" stopColor="var(--wave-a)" stopOpacity="0.35" />
        <stop offset="100%" stopColor="var(--wave-a)" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="login-coin-sol-grad" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0%" stopColor="#9945ff" />
        <stop offset="100%" stopColor="#14f195" />
      </linearGradient>

      <g id="login-coin-usdt">
        {face("#26a17b")}
        <path d="M-11 -12h22v5.5h-8V13h-6V-6.5h-8z" fill="#fff" />
        <ellipse rx="12" ry="3.4" fill="none" stroke="#fff" strokeWidth="2.2" />
      </g>
      <g id="login-coin-usdc">
        {face("#2775ca")}
        <path
          d="M-6 -14.5A15.5 15.5 0 0 0 -6 14.5M6 -14.5A15.5 15.5 0 0 1 6 14.5"
          fill="none"
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <text y="7.5" textAnchor="middle" fontSize="21" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">
          $
        </text>
      </g>
      <g id="login-coin-eth">
        {face("#627eea")}
        <path d="M0 -15L9 0.5L0 5.5L-9 0.5Z" fill="#fff" />
        <path d="M0 -15L9 0.5L0 5.5Z" fill="#c9d3f8" />
        <path d="M0 7.5L9 2.5L0 15L-9 2.5Z" fill="#fff" />
        <path d="M0 7.5L9 2.5L0 15Z" fill="#c9d3f8" />
      </g>
      <g id="login-coin-trx">
        {face("#eb0029")}
        <path
          d="M-12 -11L13 -5L-1 14ZM-12 -11L3 2L13 -5M3 2L-1 14"
          fill="none"
          stroke="#fff"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
      </g>
      <g id="login-coin-sol">
        {face("#14161f")}
        <path d="M-9 -10H13L9 -5.5H-13Z M-13 -2.25H9L13 2.25H-9Z M-9 5.5H13L9 10H-13Z" fill="url(#login-coin-sol-grad)" />
      </g>
    </>
  );
}

export function LoginSceneBg() {
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const haloRef = useRef<SVGPathElement | null>(null);
  const coinRefs = useRef<(SVGGElement | null)[]>([]);
  const shapeRefs = useRef<(SVGGElement | null)[]>([]);
  const linkRefs = useRef<(SVGLineElement | null)[]>([]);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      WAVES.forEach((_, i) => {
        const d = wavePath(i, t);
        pathRefs.current[i]?.setAttribute("d", d);
        if (i === 0) haloRef.current?.setAttribute("d", d);
      });
      COINS.forEach((_, i) => {
        const el = coinRefs.current[i];
        if (!el) return;
        const f = coinFrame(i, t);
        el.setAttribute("transform", f.transform);
        el.setAttribute("opacity", f.opacity);
      });
      SHAPES.forEach((_, i) => shapeRefs.current[i]?.setAttribute("transform", shapeTransform(i, t)));
      LINKS.forEach(([a, b], i) => {
        const el = linkRefs.current[i];
        if (!el) return;
        const [x1, y1] = shapePos(a, t);
        const [x2, y2] = shapePos(b, t);
        el.setAttribute("x1", x1.toFixed(1));
        el.setAttribute("y1", y1.toFixed(1));
        el.setAttribute("x2", x2.toFixed(1));
        el.setAttribute("y2", y2.toFixed(1));
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="login-scene login-scene--waves" aria-hidden>
      <div className="login-scene__sun">
        <div className="login-scene__sun-rays" />
        <div className="login-scene__sun-core" />
      </div>
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
          <linearGradient id="login-block-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--wave-a)" />
            <stop offset="100%" stopColor="var(--wave-b)" />
          </linearGradient>
          <filter id="login-wave-blur" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <filter id="login-coin-shadow" x="-60%" y="-60%" width="220%" height="240%">
            <feDropShadow className="login-scene__coin-shadow" dx="0" dy="5" stdDeviation="4" />
          </filter>
          <CoinDefs />
        </defs>

        <g className="login-scene__blocks">
          {LINKS.map(([a, b], i) => {
            const [x1, y1] = shapePos(a, 0);
            const [x2, y2] = shapePos(b, 0);
            return (
              <line
                key={i}
                ref={(el) => {
                  linkRefs.current[i] = el;
                }}
                className="login-scene__link"
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
              />
            );
          })}
          {SHAPES.map((s, i) => (
            <g
              key={i}
              ref={(el) => {
                shapeRefs.current[i] = el;
              }}
              className="login-scene__block"
              transform={shapeTransform(i, 0)}
            >
              <polygon points={hexPoints(s.r)} />
              {s.kind === "cube" && (
                <path d={`M0 0V${s.r} M0 0L${(-s.r * 0.866).toFixed(1)} ${(-s.r / 2).toFixed(1)} M0 0L${(s.r * 0.866).toFixed(1)} ${(-s.r / 2).toFixed(1)}`} />
              )}
            </g>
          ))}
        </g>

        <path
          ref={haloRef}
          className="login-scene__wave-halo"
          d={wavePath(0, 0)}
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
            d={wavePath(i, 0)}
            stroke="url(#login-wave-grad)"
            strokeWidth={wave.w}
            strokeOpacity={wave.o}
            strokeLinecap="round"
            fill="none"
          />
        ))}

        <g className="login-scene__coins">
          {COINS.map((c, i) => {
            const f = coinFrame(i, 0);
            return (
              <g
                key={i}
                ref={(el) => {
                  coinRefs.current[i] = el;
                }}
                className="login-scene__coin"
                transform={f.transform}
                opacity={f.opacity}
              >
                <circle className="login-scene__coin-halo" r="36" fill="url(#login-coin-halo)" />
                <use href={`#login-coin-${c.id}`} filter="url(#login-coin-shadow)" />
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
