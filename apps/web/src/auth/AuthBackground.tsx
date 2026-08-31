import { useEffect, useRef, useState } from "react";
import { AuthBackgroundLeftInvoice } from "./AuthBackgroundLeftInvoice";
import { AuthBackgroundLeftQr } from "./AuthBackgroundLeftQr";

/** Gateway diagram center — shifted right so the login card sits in clearer space. */
const CX = 1250;
const CY = 500;
const R_GW = 50;
const R_FR = 120;
const R_C1 = 172;
const R_C2 = 232;
const R_C3 = 295;
const R_SP = 335;
const R_SN = 380;

function polar(r: number, deg: number): { x: number; y: number } {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function dir(deg: number): { dx: number; dy: number } {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { dx: Math.cos(rad), dy: Math.sin(rad) };
}

const SPOKES = [0, 45, 90, 135, 180, 225, 270, 315];
const CONF_RINGS = [R_C1, R_C2, R_C3];

const SENTINELS = Array.from({ length: 12 }, (_, i) => ({
  ...polar(R_SN, i * 30),
  isSettlement: i === 6,
}));

const S_EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [7, 8],
  [8, 9],
  [9, 10],
  [10, 11],
  [11, 0],
  [1, 11],
  [2, 10],
  [4, 8],
  [5, 7],
];

const STATS_BASE = {
  block: 8_429_149,
  validators: 524_288,
};

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

function getLiveStats(elapsedSec: number) {
  const block = STATS_BASE.block + Math.floor(elapsedSec / 0.6);
  const validators = STATS_BASE.validators + Math.floor(elapsedSec / 0.9) * 5;
  const confDepth = 12 + (Math.floor(elapsedSec / 0.7) % 5);
  const finalityMin = 2.0 + (Math.sin(elapsedSec * 2.4) + 1) * 0.15;
  const uptime = 99.965 + Math.sin(elapsedSec * 1.6) * 0.025;

  return [
    { k: "NETWORK", v: "MAINNET" },
    { k: "VALIDATORS", v: formatCount(validators) },
    { k: "BLOCK", v: formatCount(block) },
    { k: "CONF. DEPTH", v: String(confDepth) },
    { k: "FINALITY", v: `~${finalityMin.toFixed(1)} min` },
    { k: "UPTIME", v: `${uptime.toFixed(2)}%` },
  ];
}

function getFooterTicker(elapsedSec: number) {
  const block = STATS_BASE.block + Math.floor(elapsedSec / 0.6);
  const confDepth = 12 + (Math.floor(elapsedSec / 0.7) % 5);
  const txn = `0x${(0x7f3a9b2d + Math.floor(elapsedSec * 2)).toString(16).padStart(8, "0")}`;

  return {
    left: `BLOCK ${formatCount(block)} · MAINNET · CONF. DEPTH: ${confDepth} · FINALITY: PROB. · NODE: CG-PRD-07`,
    right: `TXN ${txn} · SETTLEMENT COMPLETE`,
  };
}

const FONT_UI = "'Outfit', system-ui, sans-serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, monospace";

/** Decorative labels — brighter for legibility; wordmark keeps its own gradient. */
const TEXT = {
  tagline: "#8a9bb0",
  statKey: "#8a9bb0",
  statVal: "#5eead4",
  statHeader: "#5a6a7a",
  mono: "#94a3b8",
  monoDim: "#64748b",
  footer: "#5a6a7a",
  live: "#52D8B0",
} as const;

/** Wordmark baseline + cap height in viewBox units. */
const WORDMARK_ICON = 72;
const WORDMARK_ICON_X = 12;
const WORDMARK_X = 92;
const WORDMARK_Y = 104;
const WORDMARK_SIZE = 58;
const WORDMARK_ICON_Y = WORDMARK_Y - WORDMARK_SIZE * 0.92;

/** Background typography — slightly larger for legibility. */
const FS = {
  wordmark: WORDMARK_SIZE,
  tagline: 10.5,
  statHeader: 8.2,
  statKey: 7.8,
  statVal: 14.5,
  statRow: 46,
  footer: 9,
  footerMeta: 8.4,
  monoLg: 9,
  monoMd: 7.8,
  monoSm: 7.3,
  monoXs: 7,
  degree: 7,
} as const;

const PULSE_PERIOD = 3.6;
const STATS_TICK_MS = 400;

import { useReducedMotion } from "./useReducedMotion";

export function AuthBackground() {
  const reducedMotion = useReducedMotion();
  const [time, setTime] = useState(0);
  const [statsTick, setStatsTick] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setStatsTick((tick) => tick + STATS_TICK_MS / 1000);
    }, STATS_TICK_MS);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      return undefined;
    }

    const t0 = Date.now();
    const loop = () => {
      setTime((Date.now() - t0) / 1000);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [reducedMotion]);

  const pulses = SPOKES.map((angle, i) => {
    const phase = (time + i * (PULSE_PERIOD / SPOKES.length)) % PULSE_PERIOD;
    const progress = phase / PULSE_PERIOD;
    const r = R_FR + progress * (R_SP - R_FR);
    const { x, y } = polar(r, angle);
    return {
      i,
      x,
      y,
      opacity: reducedMotion ? 0 : Math.sin(progress * Math.PI) * 0.92,
    };
  });

  const origin = polar(R_SP, 270);
  const liveMark = polar(R_FR, 356);
  const stats = getLiveStats(statsTick);
  const footer = getFooterTicker(statsTick);

  return (
    <div className="auth-background" aria-hidden>
      <svg
        viewBox="0 0 1600 1000"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <pattern
            id="auth-bg-dots"
            x="0"
            y="0"
            width="44"
            height="44"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="22" cy="22" r="0.9" fill="#2A3140" opacity="0.5" />
          </pattern>

          <radialGradient id="auth-bg-fill" cx="50%" cy="50%" r="56%">
            <stop offset="0%" stopColor="#12161F" />
            <stop offset="100%" stopColor="#070A10" />
          </radialGradient>

          <radialGradient id="auth-bg-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00D4C8" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#00D4C8" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="auth-bg-inner" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00D4C8" stopOpacity="0.44" />
            <stop offset="65%" stopColor="#00D4C8" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#00D4C8" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="auth-bg-pulse" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#99F6E4" stopOpacity="1" />
            <stop offset="40%" stopColor="#00D4C8" stopOpacity="0.62" />
            <stop offset="100%" stopColor="#00D4C8" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="auth-bg-settle" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00D4C8" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#00D4C8" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="auth-bg-vignette" cx="50%" cy="50%" r="72%">
            <stop offset="50%" stopColor="#070A10" stopOpacity="0" />
            <stop offset="100%" stopColor="#070A10" stopOpacity="0.72" />
          </radialGradient>

          <filter id="auth-bg-wide" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="16" />
          </filter>
          <filter id="auth-bg-mid" x="-45%" y="-45%" width="190%" height="190%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
          <filter id="auth-bg-tight" x="-28%" y="-28%" width="156%" height="156%">
            <feGaussianBlur stdDeviation="5" />
          </filter>

          {/* Wordmark: teal accent with stronger top-to-bottom contrast. */}
          <linearGradient
            id="auth-bg-wordmark"
            x1={WORDMARK_X}
            y1={WORDMARK_Y - WORDMARK_SIZE * 0.78}
            x2={WORDMARK_X}
            y2={WORDMARK_Y}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#5EEAD4" />
            <stop offset="40%" stopColor="#00D4C8" />
            <stop offset="100%" stopColor="#0F766E" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width="1600" height="1000" fill="url(#auth-bg-fill)" />
        <rect x="0" y="0" width="1600" height="1000" fill="url(#auth-bg-dots)" />

        <circle
          cx={CX}
          cy={CY}
          r={R_SN}
          fill="none"
          stroke="#1E3A3A"
          strokeWidth="0.52"
          strokeDasharray="5 22"
          strokeOpacity="0.3"
        />

        {S_EDGES.map(([a, b], i) => (
          <line
            key={`se-${i}`}
            x1={SENTINELS[a].x}
            y1={SENTINELS[a].y}
            x2={SENTINELS[b].x}
            y2={SENTINELS[b].y}
            stroke="#1E3A44"
            strokeWidth="0.52"
            strokeOpacity="0.28"
          />
        ))}

        {SENTINELS.map(({ x, y, isSettlement }, i) =>
          isSettlement ? (
            <g key={`sn-${i}`}>
              <circle
                cx={x}
                cy={y}
                r={16}
                fill="url(#auth-bg-settle)"
                filter="url(#auth-bg-tight)"
                className="auth-bg-settle"
              />
              <circle
                cx={x}
                cy={y}
                r={5.5}
                fill="#0F151C"
                stroke="#00D4C8"
                strokeWidth="0.92"
                strokeOpacity="0.7"
              />
              <circle cx={x} cy={y} r={2.2} fill="#00D4C8" className="auth-bg-settle" />
              <text
                x={x}
                y={y + 22}
                textAnchor="middle"
                fontSize={FS.monoSm}
                fontFamily={FONT_MONO}
                fill={TEXT.mono}
                letterSpacing="1.5"
              >
                SETTLED
              </text>
            </g>
          ) : (
            <g key={`sn-${i}`}>
              <circle cx={x} cy={y} r={7} fill="#00D4C8" opacity="0.046" />
              <circle
                cx={x}
                cy={y}
                r={3.2}
                fill="#0F151C"
                stroke="#2A4A52"
                strokeWidth="0.72"
                strokeOpacity="0.55"
              />
              <circle cx={x} cy={y} r={1.2} fill="#00D4C8" opacity="0.65" />
            </g>
          ),
        )}

        {SPOKES.map((angle, i) => {
          const inner = polar(R_FR, angle);
          const outer = polar(R_SP, angle);
          return (
            <line
              key={`sp-${i}`}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="#1E3A44"
              strokeWidth="0.65"
              strokeDasharray="2.5 6.5"
              strokeOpacity="0.42"
            />
          );
        })}

        <circle
          cx={CX}
          cy={CY}
          r={R_C1}
          fill="none"
          stroke="#2A4A52"
          strokeWidth="0.56"
          strokeDasharray="14 8"
          className="auth-bg-r1"
        />
        <circle
          cx={CX}
          cy={CY}
          r={R_C2}
          fill="none"
          stroke="#1E3A44"
          strokeWidth="0.52"
          strokeDasharray="9 11"
          className="auth-bg-r2"
        />
        <circle
          cx={CX}
          cy={CY}
          r={R_C3}
          fill="none"
          stroke="#163038"
          strokeWidth="0.50"
          strokeDasharray="6 14"
          className="auth-bg-r3"
        />

        <text
          x={CX + R_C1 + 8}
          y={CY - 11}
          fontSize={FS.monoSm}
          fontFamily={FONT_MONO}
          fill={TEXT.monoDim}
          letterSpacing="0.4"
        >
          CONF·01
        </text>
        <text
          x={CX + R_C2 + 8}
          y={CY - 11}
          fontSize={FS.monoSm}
          fontFamily={FONT_MONO}
          fill={TEXT.monoDim}
          letterSpacing="0.4"
        >
          CONF·06
        </text>
        <text
          x={CX + R_C3 + 8}
          y={CY - 11}
          fontSize={FS.monoSm}
          fontFamily={FONT_MONO}
          fill={TEXT.monoDim}
          letterSpacing="0.4"
        >
          CONF·14
        </text>

        {SPOKES.map((angle, si) => {
          const { dx, dy } = dir(angle);
          const px = -dy;
          const py = dx;
          return CONF_RINGS.map((r, ri) => {
            const bx = CX + r * dx;
            const by = CY + r * dy;
            const tick = 5.5;
            return (
              <g key={`bm-${si}-${ri}`}>
                <line
                  x1={bx + tick * px}
                  y1={by + tick * py}
                  x2={bx - tick * px}
                  y2={by - tick * py}
                  stroke="#2DD4BF"
                  strokeWidth="0.92"
                  strokeOpacity="0.55"
                />
                <circle cx={bx} cy={by} r={1.4} fill="#00D4C8" opacity="0.45" />
              </g>
            );
          });
        })}

        {pulses.map(({ i, x, y, opacity }) => (
          <g key={`p-${i}`} opacity={opacity}>
            <circle
              cx={x}
              cy={y}
              r={14}
              fill="#00D4C8"
              opacity="0.065"
              filter="url(#auth-bg-tight)"
            />
            <circle cx={x} cy={y} r={4} fill="url(#auth-bg-pulse)" opacity="0.94" />
            <circle cx={x} cy={y} r={1.5} fill="#CCFBF1" opacity="0.97" />
          </g>
        ))}

        <circle
          cx={CX}
          cy={CY}
          r={R_FR + 42}
          fill="url(#auth-bg-halo)"
          filter="url(#auth-bg-wide)"
          className="auth-bg-breathe"
        />
        <circle
          cx={CX}
          cy={CY}
          r={R_GW + 24}
          fill="url(#auth-bg-inner)"
          filter="url(#auth-bg-mid)"
          className="auth-bg-breathe"
        />

        <circle
          cx={CX}
          cy={CY}
          r={R_FR}
          fill="none"
          stroke="#2DD4BF"
          strokeWidth="0.8"
          strokeOpacity="0.56"
        />
        <circle
          cx={CX}
          cy={CY}
          r={R_FR - 10}
          fill="none"
          stroke="#163038"
          strokeWidth="0.42"
          strokeOpacity="0.28"
          strokeDasharray="3 10"
        />

        {SPOKES.map((angle, i) => {
          const pt = polar(R_FR, angle);
          const lp = polar(R_FR + 20, angle);
          const { dx, dy } = dir(angle);
          const px = -dy;
          const py = dx;
          return (
            <g key={`dm-${i}`}>
              <line
                x1={pt.x + 8 * px}
                y1={pt.y + 8 * py}
                x2={pt.x - 8 * px}
                y2={pt.y - 8 * py}
                stroke="#00D4C8"
                strokeWidth="1.25"
                strokeOpacity="0.72"
              />
              <text
                x={lp.x}
                y={lp.y + 2.5}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={FS.degree}
                fill={TEXT.monoDim}
                fontFamily={FONT_MONO}
              >
                {String(angle).padStart(3, "0")}°
              </text>
            </g>
          );
        })}

        <circle
          cx={CX}
          cy={CY}
          r={R_GW}
          fill="#0B0F14"
          stroke="#2DD4BF"
          strokeWidth="0.82"
          strokeOpacity="0.6"
        />
        <circle
          cx={CX}
          cy={CY}
          r={R_GW - 12}
          fill="none"
          stroke="#163038"
          strokeWidth="0.4"
          strokeOpacity="0.3"
        />
        <circle
          cx={CX}
          cy={CY}
          r={R_GW - 24}
          fill="none"
          stroke="#12202A"
          strokeWidth="0.35"
          strokeOpacity="0.2"
          strokeDasharray="2 5"
        />

        <line
          x1={CX - R_GW}
          y1={CY}
          x2={CX + R_GW}
          y2={CY}
          stroke="#12202A"
          strokeWidth="0.42"
          strokeOpacity="0.28"
        />
        <line
          x1={CX}
          y1={CY - R_GW}
          x2={CX}
          y2={CY + R_GW}
          stroke="#12202A"
          strokeWidth="0.42"
          strokeOpacity="0.28"
        />
        <line
          x1={CX - 35}
          y1={CY - 35}
          x2={CX + 35}
          y2={CY + 35}
          stroke="#0F1A22"
          strokeWidth="0.34"
          strokeOpacity="0.2"
        />
        <line
          x1={CX + 35}
          y1={CY - 35}
          x2={CX - 35}
          y2={CY + 35}
          stroke="#0F1A22"
          strokeWidth="0.34"
          strokeOpacity="0.2"
        />

        <circle
          cx={CX}
          cy={CY}
          r={12}
          fill="#12181F"
          stroke="#00D4C8"
          strokeWidth="1.08"
          strokeOpacity="0.74"
          className="auth-bg-core"
        />
        <circle cx={CX} cy={CY} r={5} fill="#00D4C8" className="auth-bg-core" />
        <circle cx={CX} cy={CY} r={1.8} fill="#CCFBF1" opacity="0.97" />

        <circle
          cx={liveMark.x}
          cy={liveMark.y}
          r={3.2}
          fill="#42C8A0"
          className="auth-bg-blink"
        />
        <text
          x={liveMark.x - 6}
          y={liveMark.y - 11}
          textAnchor="middle"
          fontSize={FS.monoSm}
          fontFamily={FONT_MONO}
          fill={TEXT.live}
          letterSpacing="0.5"
        >
          LIVE
        </text>

        <text
          x={CX}
          y={CY + R_GW + 23}
          textAnchor="middle"
          fontSize={FS.monoLg}
          fontFamily={FONT_MONO}
          fill={TEXT.mono}
          letterSpacing="1.8"
        >
          0x4F8A · 2C91 · B3E7
        </text>
        <text
          x={CX}
          y={CY + R_GW + 37}
          textAnchor="middle"
          fontSize={FS.monoMd}
          fontFamily={FONT_MONO}
          fill={TEXT.monoDim}
          letterSpacing="1.2"
        >
          EIP-712 · SIGNATURE VALID
        </text>

        <g opacity="0.62">
          {[22, 14, 8].map((r, i) => (
            <circle
              key={`orig-${i}`}
              cx={origin.x - 28}
              cy={CY}
              r={r}
              fill="none"
              stroke="#1E3A44"
              strokeWidth="0.45"
              strokeOpacity={0.12 + i * 0.08}
              strokeDasharray={i === 0 ? "3 5" : undefined}
            />
          ))}
          <circle
            cx={origin.x - 28}
            cy={CY}
            r={2.5}
            fill="#0F151C"
            stroke="#1E3A44"
            strokeWidth="0.6"
            strokeOpacity="0.52"
          />
          <circle cx={origin.x - 28} cy={CY} r={1} fill="#00D4C8" opacity="0.58" />
          <text
            x={origin.x - 28}
            y={CY + 36}
            textAnchor="middle"
            fontSize={FS.monoSm}
            fontFamily={FONT_MONO}
            fill={TEXT.mono}
            letterSpacing="2"
          >
            ORIGIN
          </text>
          <text
            x={origin.x - 28}
            y={CY + 47}
            textAnchor="middle"
            fontSize={FS.monoXs}
            fontFamily={FONT_MONO}
            fill={TEXT.monoDim}
            letterSpacing="0.4"
          >
            0x2A1F8E
          </text>
        </g>

        <rect x="0" y="0" width="1600" height="1000" fill="url(#auth-bg-vignette)" />

        {/* Text overlays — drawn after vignette so labels stay readable. */}
        <g className="auth-bg-labels">
          <image
            href="/brand/cryptogate-icon.png"
            x={WORDMARK_ICON_X}
            y={WORDMARK_ICON_Y}
            width={WORDMARK_ICON}
            height={WORDMARK_ICON}
            className="auth-bg-wordmark-icon"
          />
          <text
            x={WORDMARK_X}
            y={WORDMARK_Y}
            fontSize={FS.wordmark}
            fontWeight="600"
            fontFamily={FONT_UI}
            fill="url(#auth-bg-wordmark)"
            fillOpacity="0.92"
            letterSpacing="9"
            className="auth-bg-wordmark"
          >
            CRYPTOGATE
          </text>
          <text
            x={85}
            y={129}
            fontSize={FS.tagline}
            fontFamily={FONT_MONO}
            fill={TEXT.tagline}
            letterSpacing="3.8"
          >
            NON-CUSTODIAL BLOCKCHAIN PAYMENT INFRASTRUCTURE
          </text>
          <line
            x1={82}
            y1={138}
            x2={548}
            y2={138}
            stroke="#1E2A36"
            strokeWidth="0.5"
            strokeOpacity="0.7"
          />

          <foreignObject x="80" y="182" width="430" height="860">
            <div className="auth-left-decor">
              <AuthBackgroundLeftInvoice
                reducedMotion={reducedMotion}
                underWordmark
              />
              <AuthBackgroundLeftQr reducedMotion={reducedMotion} />
            </div>
          </foreignObject>

          <line
            x1={1335}
            y1={390}
            x2={1335}
            y2={656}
            stroke="#1E2A36"
            strokeWidth="0.5"
            strokeOpacity="0.55"
          />
          <text
            x={1348}
            y={380}
            fontSize={FS.statHeader}
            fontFamily={FONT_MONO}
            fill={TEXT.statHeader}
            letterSpacing="2.2"
          >
            NETWORK STATUS
          </text>
          <line
            x1={1335}
            y1={386}
            x2={1518}
            y2={386}
            stroke="#1E2A36"
            strokeWidth="0.45"
            strokeOpacity="0.5"
          />

          {stats.map(({ k, v }, i) => (
            <g key={`st-${i}`}>
              <text
                x={1348}
                y={406 + i * FS.statRow}
                fontSize={FS.statKey}
                fontFamily={FONT_MONO}
                fill={TEXT.statKey}
                letterSpacing="1.5"
              >
                {k}
              </text>
              <text
                x={1348}
                y={420 + i * FS.statRow}
                fontSize={FS.statVal}
                fontWeight="500"
                fontFamily={FONT_UI}
                fill={TEXT.statVal}
                letterSpacing="0.5"
              >
                {v}
              </text>
            </g>
          ))}

          <line
            x1={1335}
            y1={662}
            x2={1518}
            y2={662}
            stroke="#1E2A36"
            strokeWidth="0.45"
            strokeOpacity="0.5"
          />

          <text
            x={1518}
            y={76}
            textAnchor="end"
            fontSize={FS.footerMeta}
            fontFamily={FONT_MONO}
            fill={TEXT.footer}
            letterSpacing="1"
          >
            CG-STYLE-KEY-2025 · R02
          </text>

          <line
            x1={82}
            y1={954}
            x2={1518}
            y2={954}
            stroke="#1E2A36"
            strokeWidth="0.4"
            strokeOpacity="0.65"
          />
          <text
            x={82}
            y={968}
            fontSize={FS.monoLg}
            fontFamily={FONT_MONO}
            fill={TEXT.footer}
            letterSpacing="0.8"
          >
            {footer.left}
          </text>
          <text
            x={1518}
            y={968}
            textAnchor="end"
            fontSize={FS.monoLg}
            fontFamily={FONT_MONO}
            fill={TEXT.footer}
            letterSpacing="0.8"
          >
            {footer.right}
          </text>

          <path
            d="M22,42 L22,22 L42,22"
            fill="none"
            stroke="#1E2A36"
            strokeWidth="0.7"
            strokeOpacity="0.65"
          />
          <path
            d="M1558,22 L1578,22 L1578,42"
            fill="none"
            stroke="#1E2A36"
            strokeWidth="0.7"
            strokeOpacity="0.65"
          />
          <path
            d="M22,958 L22,978 L42,978"
            fill="none"
            stroke="#1E2A36"
            strokeWidth="0.7"
            strokeOpacity="0.65"
          />
          <path
            d="M1558,978 L1578,978 L1578,958"
            fill="none"
            stroke="#1E2A36"
            strokeWidth="0.7"
            strokeOpacity="0.65"
          />
        </g>
      </svg>
    </div>
  );
}
