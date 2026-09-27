import { useId, useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";

export function MiniSpark({
  values,
  className = "",
}: {
  values: number[];
  className?: string;
}) {
  const gradId = useId().replace(/:/g, "");
  const geometry = useMemo(() => {
    if (values.length < 2) return null;
    const max = Math.max(...values, 1e-9);
    const w = 132;
    const h = 40;
    const pts = values.map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - (v / max) * (h - 8) - 4;
      return { x, y };
    });
    const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const area = [
      `0,${h}`,
      ...pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`),
      `${w},${h}`,
    ].join(" ");
    return { line, area, pts, w, h };
  }, [values]);
  if (!geometry) return null;
  const last = geometry.pts[geometry.pts.length - 1]!;
  return (
    <div
      className={`pg-kpi__spark-wrap${className ? ` ${className}` : ""}`}
      aria-hidden
    >
      <svg
        className="pg-kpi__spark"
        viewBox={`0 0 ${geometry.w} ${geometry.h}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient
            id={`pg-spark-${gradId}`}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
            gradientUnits="objectBoundingBox"
          >
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.45" />
            <stop offset="50%" stopColor="currentColor" stopOpacity="0.16" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon
          className="pg-kpi__spark-fill"
          points={geometry.area}
          fill={`url(#pg-spark-${gradId})`}
        />
        <polyline
          className="pg-kpi__spark-line"
          points={geometry.line}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.85"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="nonScalingStroke"
        />
      </svg>
      {/* CSS dots stay circular — SVG circles stretch with preserveAspectRatio=none */}
      <div className="pg-kpi__spark-dots">
        {geometry.pts.map((p, i) => {
          const isLast = i === geometry.pts.length - 1;
          return (
            <span
              key={i}
              className={
                isLast ? "pg-kpi__spark-dot is-end" : "pg-kpi__spark-dot"
              }
              style={{
                left: `${(p.x / geometry.w) * 100}%`,
                top: `${(p.y / geometry.h) * 100}%`,
              }}
            />
          );
        })}
        <span
          className="pg-kpi__spark-dot-ring"
          style={{
            left: `${(last.x / geometry.w) * 100}%`,
            top: `${(last.y / geometry.h) * 100}%`,
          }}
        />
      </div>
    </div>
  );
}

export type KpiAccent = "blue" | "teal" | "gold" | "violet" | "ok" | "danger" | "warn" | "slate";

export function DashKpiCard({
  accent,
  label,
  value,
  hint,
  trend,
  spark,
  href,
  linkLabel,
  linkWithTitle = false,
}: {
  accent: KpiAccent;
  label: string;
  value: ReactNode;
  hint?: string;
  trend?: number | null;
  spark?: number[];
  href?: string;
  linkLabel?: string;
  /** Put the action link on the title row (status cards). */
  linkWithTitle?: boolean;
}) {
  const meta =
    trend != null ? (
      <span className={`pg-kpi__trend${trend >= 0 ? " is-up" : " is-down"}`}>
        <span className="pg-kpi__trend-pct">
          {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}%
        </span>
        <span className="pg-kpi__trend-sub">vs prior</span>
      </span>
    ) : hint ? (
      <span className="pg-kpi__hint">{hint}</span>
    ) : null;
  const hasSpark = Boolean(spark && spark.length > 1);
  const link =
    href && linkLabel ? (
      <Link to={href} className="pg-kpi__link">
        <span className="pg-kpi__link-text">{linkLabel}</span>
        <span className="pg-kpi__link-arrow" aria-hidden>
          →
        </span>
      </Link>
    ) : null;

  return (
    <div className={`pg-kpi is-${accent}${linkWithTitle ? " pg-kpi--title-link" : ""}`}>
      <div className="pg-kpi__top">
        <span className="pg-kpi__icon" aria-hidden>
          <DashKpiIcon accent={accent} />
        </span>
        <span className="pg-kpi__label">{label}</span>
        {linkWithTitle ? link : null}
      </div>
      <div className="pg-kpi__metrics">
        <span className="pg-kpi__value">{value}</span>
        {!hasSpark && meta ? <div className="pg-kpi__meta-inline">{meta}</div> : null}
      </div>
      {hasSpark ? (
        <div className="pg-kpi__spark-block">
          {meta ? <div className="pg-kpi__meta">{meta}</div> : null}
          <MiniSpark values={spark!} />
        </div>
      ) : null}
      {!linkWithTitle ? link : null}
    </div>
  );
}

function DashKpiIcon({ accent }: { accent: KpiAccent }) {
  const p = {
    width: 36,
    height: 36,
    viewBox: "0 0 24 24",
    fill: "currentColor" as const,
    "aria-hidden": true,
  };
  if (accent === "blue") {
    /* Merchants — bank building asset */
    return (
      <img
        className="pg-kpi__icon-img"
        src="/brand/merchants-icon.png"
        alt=""
        width={36}
        height={36}
        draggable={false}
      />
    );
  }
  if (accent === "teal") {
    /* Agents — people outline (original) */
    return (
      <svg
        width={36}
        height={36}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }
  if (accent === "gold") {
    /* Transactions — stacked coins asset */
    return (
      <img
        className="pg-kpi__icon-img"
        src="/brand/transactions-icon.png"
        alt=""
        width={36}
        height={36}
        draggable={false}
      />
    );
  }
  if (accent === "violet") {
    /* Volume — filled trending-up */
    return (
      <svg {...p}>
        <path d="M21.5 6.2v5.6h-1.9V9.45l-6.55 6.55-3.4-3.4-5.9 5.9-1.35-1.35 7.25-7.25 3.4 3.4 5.2-5.2H15.9V6.2h5.6Z" />
      </svg>
    );
  }
  if (accent === "ok") {
    return (
      <svg {...p}>
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1.05 13.55-3.55-3.55 1.45-1.45 2.1 2.1 4.55-4.55 1.45 1.45-6 6Z" />
      </svg>
    );
  }
  if (accent === "danger") {
    /* Overdue — outline warning triangle (no filled plate) */
    return (
      <svg
        width={36}
        height={36}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
    );
  }
  if (accent === "warn") {
    return (
      <svg {...p}>
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-.95 5.4v5.6h1.9V7.4h-1.9Zm.95 9.35a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z" />
      </svg>
    );
  }
  return (
    <svg {...p}>
      <path d="M12 2.8 20.2 7.4v9.2L12 21.2 3.8 16.6V7.4L12 2.8Zm0 2.2L5.7 8.55 12 12.1l6.3-3.55L12 5ZM5.7 10.65v5.2L11.05 19V13.8L5.7 10.65Zm7.35 3.15V19l5.35-3.15v-5.2L13.05 13.8Z" />
    </svg>
  );
}
