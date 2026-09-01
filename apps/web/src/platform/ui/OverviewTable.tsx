import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Link } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  ChartMaximizeButton,
  ChartMaximizeOverlay,
} from "./ChartMaximize";
import {
  ChartHoverTip,
  formatChartDateTime,
  formatChartDay,
  useLineChartHover,
} from "./ChartHover";
import { formatAxisNumber, niceAxisTicks, chartScaleTop } from "./chartAxis";
import { hexToRgba } from "./chartColors";

export type OverviewChartCard = {
  id: string;
  title: string;
  category?: string;
  help?: string;
  value: ReactNode;
  compareLabel?: string;
  series: number[];
  seriesLabels?: string[];
  /** Tooltip metric label (e.g. Volume, Fees). */
  seriesMetric?: string;
  /** Format series point value in the hover tooltip. */
  formatSeriesValue?: (n: number) => string;
  /** Line / fill / hover accent for this metric spark. */
  chartColor?: string;
  empty?: boolean;
  /** Lazy history: pending until series is resolved for Add-modal cards. */
  seriesStatus?: "ready" | "pending" | "error";
  updatedLabel?: string;
  moreHref?: string;
  moreLabel?: string;
};

type Props = {
  title?: string;
  filters?: ReactNode;
  action?: ReactNode;
  cards: OverviewChartCard[];
  className?: string;
  /** Stripe Edit: remove / reorder on the overview grid (not the Add modal). */
  editMode?: boolean;
  onRemoveCard?: (id: string) => void;
  onReorderCards?: (orderedIds: string[]) => void;
};

type DragState = {
  id: string;
  /** Fixed position of the floating ghost */
  x: number;
  y: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
};

function shortDay(label: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(label);
  if (!m) return label.length > 10 ? label.slice(5) : label;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[Number(m[2]) - 1] ?? m[2];
  return `${month} ${Number(m[3])}`;
}

function moveIdBefore(ids: string[], fromId: string, toId: string): string[] {
  if (fromId === toId) return ids;
  const fromIdx = ids.indexOf(fromId);
  const toIdx = ids.indexOf(toId);
  if (fromIdx < 0 || toIdx < 0) return ids;
  const next = [...ids];
  next.splice(fromIdx, 1);
  next.splice(toIdx, 0, fromId);
  return next;
}

export function Sparkline({
  values,
  labels,
  label,
  size = "default",
  metric = "Value",
  formatValue,
  color = "#34d399",
}: {
  values: number[];
  labels?: string[];
  label: string;
  size?: "default" | "fullscreen";
  metric?: string;
  formatValue?: (n: number) => string;
  /** Series accent (line, fill, hover). */
  color?: string;
}) {
  const reactId = useId().replace(/:/g, "");
  const fillId = `metricFill-${reactId}`;
  const fullscreen = size === "fullscreen";
  const h = fullscreen ? 360 : 256;
  const padLeft = fullscreen ? 68 : 56;
  const padRight = fullscreen ? 14 : 10;
  const padTop = fullscreen ? 16 : 12;
  const padBottom = fullscreen ? 32 : 28;
  const plotRef = useRef<HTMLDivElement>(null);
  const [vbW, setVbW] = useState(fullscreen ? 960 : 320);
  const [layoutReady, setLayoutReady] = useState(false);

  useLayoutEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const sync = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width < 40 || height < 40) return;
      setVbW(Math.max(240, Math.round((width / height) * h)));
      setLayoutReady(true);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [h]);

  const w = vbW;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;
  const baseline = h - padBottom;
  const safe = values.length ? values : [0, 0];
  const max = Math.max(...safe, 0);
  const yTicks = niceAxisTicks(max, fullscreen ? 5 : 4);
  const yTop = chartScaleTop(max, fullscreen ? 5 : 4);
  const moneyAxis = /fee|volume|\$|usd/i.test(metric);
  const pts = safe.map((v, i) => {
    const x =
      safe.length <= 1
        ? padLeft + plotW / 2
        : padLeft + (i / (safe.length - 1)) * plotW;
    const y = baseline - (v / yTop) * plotH;
    return { x, y };
  });
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const area =
    pts.length > 0
      ? `${line} L ${pts[pts.length - 1]!.x} ${baseline} L ${pts[0]!.x} ${baseline} Z`
      : "";
  // Cap label count by plot width so dates stay readable (avoid "08-2108-22").
  const approxXLabelW = fullscreen ? 48 : 40;
  const maxXLabels = Math.max(
    2,
    Math.min(fullscreen ? 10 : 5, Math.floor(plotW / approxXLabelW)),
  );
  const xLabelStep = Math.max(1, Math.ceil(pts.length / maxXLabels));
  const showXAt = (idx: number) =>
    idx === 0 || idx === pts.length - 1 || idx % xLabelStep === 0;
  const { svgRef, hover, onMouseMove, onMouseLeave } = useLineChartHover(pts);
  const seriesAnimKey = `${labels?.[0] ?? ""}|${labels && labels.length > 0 ? labels[labels.length - 1] : ""}|${safe.length}|${Math.round(safe[0] ?? 0)}|${Math.round(safe[safe.length - 1] ?? 0)}|${size}`;
  const prevSeriesAnimKey = useRef("");
  const [revealPhase, setRevealPhase] = useState<"axis" | "series" | "idle">(
    "idle",
  );
  const AXIS_REVEAL_MS = 520;
  const SERIES_REVEAL_MS = 900;

  useLayoutEffect(() => {
    if (!layoutReady || !line) {
      if (!line) setRevealPhase("idle");
      return;
    }

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prevSeriesAnimKey.current === seriesAnimKey || reduceMotion) {
      setRevealPhase("idle");
      if (reduceMotion) prevSeriesAnimKey.current = seriesAnimKey;
      return;
    }

    let cancelled = false;
    setRevealPhase("axis");

    const startSeries = window.setTimeout(() => {
      if (!cancelled) setRevealPhase("series");
    }, AXIS_REVEAL_MS);

    const done = window.setTimeout(() => {
      if (cancelled) return;
      setRevealPhase("idle");
      prevSeriesAnimKey.current = seriesAnimKey;
    }, AXIS_REVEAL_MS + SERIES_REVEAL_MS + 50);

    return () => {
      cancelled = true;
      window.clearTimeout(startSeries);
      window.clearTimeout(done);
      setRevealPhase("idle");
    };
  }, [seriesAnimKey, layoutReady]);

  const active =
    revealPhase === "idle" && hover ? pts[hover.index] : null;
  const activeValue = hover != null ? safe[hover.index] : undefined;
  const activeLabel =
    hover != null ? labels?.[hover.index] ?? undefined : undefined;
  const fmt =
    formatValue ??
    ((n: number) =>
      n.toLocaleString(undefined, {
        maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
      }));

  const focusDateTime =
    active && activeLabel
      ? formatChartDateTime(activeLabel)
      : labels && labels.length > 0
        ? `${formatChartDay(labels[0]!)} – ${formatChartDay(labels[labels.length - 1]!)}`
        : null;

  return (
    <div
      className="chart-hover overview-chart-card__chart"
      style={
        {
          "--chart-accent": color,
          "--chart-accent-soft": hexToRgba(color, 0.45),
          "--chart-accent-fill": hexToRgba(color, 0.18),
        } as CSSProperties
      }
    >
      <div
        ref={plotRef}
        className={`overview-chart-card__plot${fullscreen ? " overview-chart-card__plot--lg" : ""}`}
      >
        <svg
          ref={svgRef}
          className={`overview-chart-card__spark volume-chart--plat-ref${fullscreen ? " overview-chart-card__spark--lg" : ""}${revealPhase === "axis" ? " is-axis-revealing" : ""}`}
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={label}
          onMouseMove={revealPhase === "idle" ? onMouseMove : undefined}
          onMouseLeave={onMouseLeave}
        >
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={hexToRgba(color, 0.18)} />
              <stop offset="100%" stopColor={hexToRgba(color, 0)} />
            </linearGradient>
          </defs>
          {yTicks.map((tick) => {
            const y = baseline - (tick / yTop) * plotH;
            return (
              <g key={`yt-${tick}`}>
                <line
                  className="volume-chart__grid volume-chart__grid--y"
                  x1={padLeft}
                  x2={w - padRight}
                  y1={y}
                  y2={y}
                />
                <text
                  className="volume-chart__ylabel"
                  x={padLeft - 6}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={fullscreen ? 11 : 9}
                  fontFamily="var(--font-mono)"
                >
                  {formatAxisNumber(tick, moneyAxis)}
                </text>
              </g>
            );
          })}
          {pts.map((p, idx) => {
            if (!showXAt(idx)) return null;
            return (
              <line
                key={`xg-${idx}`}
                className="volume-chart__grid volume-chart__grid--x"
                x1={p.x}
                x2={p.x}
                y1={padTop}
                y2={baseline}
              />
            );
          })}
          <g
            className={[
              "volume-chart__series",
              revealPhase === "axis" ? "volume-chart__series--hidden" : "",
              revealPhase === "series" ? "volume-chart__series--drawing" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {area ? (
              <path
                className="volume-chart__history-fill"
                d={area}
                fill={`url(#${fillId})`}
                stroke="none"
              />
            ) : null}
            <path
              className="volume-chart__line overview-chart-card__spark-line"
              d={line}
              fill="none"
              strokeWidth={fullscreen ? 3 : 2.5}
              vectorEffect="non-scaling-stroke"
            />
            {pts.map((p) => (
              <circle
                key={`pt-${p.x}-${p.y}`}
                className="volume-chart__point"
                cx={p.x}
                cy={p.y}
                r={fullscreen ? 5 : 4.25}
              />
            ))}
          </g>
          {active ? (
            <>
              <line
                className="chart-hover__crosshair"
                x1={active.x}
                x2={active.x}
                y1={padTop}
                y2={baseline}
              />
              <circle
                className="chart-hover__dot-ring"
                cx={active.x}
                cy={active.y}
                r={fullscreen ? 11 : 9}
              />
              <circle
                className="chart-hover__dot"
                cx={active.x}
                cy={active.y}
                r={fullscreen ? 5.5 : 4.5}
              />
            </>
          ) : null}
          {pts.map((p, idx) => {
            if (!showXAt(idx) || !labels?.[idx]) return null;
            const nearLeft = p.x <= padLeft + 16;
            const nearRight = p.x >= w - padRight - 16;
            return (
              <text
                key={`xl-${idx}`}
                className="volume-chart__xlabel"
                x={nearLeft ? padLeft : nearRight ? w - padRight : p.x}
                y={h - 8}
                textAnchor={nearLeft ? "start" : nearRight ? "end" : "middle"}
                fontSize={fullscreen ? 11 : 9}
                fontFamily="var(--font-mono)"
              >
                {/^(\d{4})-(\d{2})-(\d{2})$/.test(labels[idx]!)
                  ? labels[idx]!.slice(5)
                  : shortDay(labels[idx]!)}
              </text>
            );
          })}
        </svg>
      </div>
      {focusDateTime ? (
        <p className="volume-chart__datetime overview-chart-card__datetime">
          {focusDateTime}
        </p>
      ) : null}
      {revealPhase === "idle" && hover && active && activeValue != null ? (
        <ChartHoverTip clientX={hover.clientX} clientY={hover.clientY}>
          <p className="chart-hover__tip-row">
            <span className="chart-hover__tip-k">{metric}</span>
            <span className="chart-hover__tip-v">{fmt(activeValue)}</span>
          </p>
        </ChartHoverTip>
      ) : null}
    </div>
  );
}

export function OverviewChartCardView({
  card,
  selectMode,
  selected,
  onToggle,
  editMode,
  onRemove,
  placeholder,
  ghost,
  onPointerDownDrag,
}: {
  card: OverviewChartCard;
  selectMode?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  editMode?: boolean;
  onRemove?: () => void;
  /** Empty dashed hole left while this card is being dragged. */
  placeholder?: boolean;
  /** Floating clone that follows the pointer. */
  ghost?: boolean;
  onPointerDownDrag?: (e: ReactPointerEvent<HTMLElement>) => void;
}) {
  const [maximized, setMaximized] = useState(false);

  if (placeholder) {
    return (
      <div
        className="overview-chart-card overview-chart-card--slot"
        data-chart-id={card.id}
        aria-hidden="true"
      />
    );
  }

  return (
    <>
      <article
        className={[
          "overview-chart-card",
          selectMode ? "overview-chart-card--selectable" : "",
          selected ? "is-selected" : "",
          editMode ? "overview-chart-card--editing" : "",
          ghost ? "overview-chart-card--ghost" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        data-chart-id={ghost ? undefined : card.id}
        onPointerDown={editMode && !ghost ? onPointerDownDrag : undefined}
      >
        <div
          className={`overview-chart-card__top${selectMode ? " overview-chart-card__top--select" : ""}`}
        >
          <div className="overview-chart-card__title-row">
            {editMode ? (
              <span className="overview-chart-card__grip" aria-hidden="true">
                ⋮⋮
              </span>
            ) : null}
            <h3 className="overview-chart-card__title">{card.title}</h3>
            {card.help && !editMode ? (
              <span className="overview-chart-card__info" title={card.help}>
                i
              </span>
            ) : null}
          </div>
          {card.seriesStatus !== "pending" &&
          card.seriesStatus !== "error" &&
          !card.empty ? (
            <p className="overview-chart-card__value">{card.value}</p>
          ) : (
            <span className="overview-chart-card__value-spacer" aria-hidden="true" />
          )}
          <div className="overview-chart-card__actions">
            {card.compareLabel &&
            card.seriesStatus !== "pending" &&
            card.seriesStatus !== "error" &&
            !card.empty ? (
              <p className="overview-chart-card__compare">{card.compareLabel}</p>
            ) : null}
            {!selectMode &&
            !editMode &&
            !ghost &&
            !card.empty &&
            card.seriesStatus !== "pending" &&
            card.seriesStatus !== "error" ? (
              <ChartMaximizeButton
                label={`Maximize ${card.title} chart`}
                onClick={() => setMaximized(true)}
              />
            ) : null}
            {selectMode ? (
              <button
                type="button"
                className={`overview-chart-card__pick${selected ? " is-on" : ""}`}
                aria-pressed={selected}
                aria-label={
                  selected ? `Remove ${card.title}` : `Add ${card.title}`
                }
                onClick={onToggle}
              >
                {selected ? "✓" : "+"}
              </button>
            ) : null}
            {editMode && !ghost ? (
              <button
                type="button"
                className="overview-chart-card__remove"
                aria-label={`Remove ${card.title}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onRemove}
              >
                ×
              </button>
            ) : null}
          </div>
        </div>

        {card.seriesStatus === "pending" ? (
          <div className="overview-chart-card__pending" aria-busy="true">
            <div className="overview-chart-card__pending-chart" aria-hidden>
              <span className="overview-chart-card__pending-axis" />
              <span className="overview-chart-card__pending-sweep" />
            </div>
            <span>Loading history…</span>
          </div>
        ) : card.seriesStatus === "error" ? (
          <div className="overview-chart-card__error" role="alert">
            Something went wrong. Please try again later.
          </div>
        ) : card.empty ? (
          <div className="overview-chart-card__empty">No data</div>
        ) : (
          <Sparkline
            values={card.series}
            labels={card.seriesLabels}
            label={`${card.title} trend`}
            metric={card.seriesMetric ?? card.title}
            formatValue={card.formatSeriesValue}
            color={card.chartColor}
          />
        )}

        <footer className="overview-chart-card__foot">
          <span className="overview-chart-card__updated">
            {card.seriesStatus === "pending"
              ? "Fetching series…"
              : (card.updatedLabel ?? "Updated just now")}
          </span>
          {card.moreHref && !selectMode && !editMode && card.seriesStatus !== "pending" ? (
            <Link to={card.moreHref} className="overview-chart-card__more">
              {card.moreLabel ?? "More details"}
            </Link>
          ) : (
            <span className="overview-chart-card__more overview-chart-card__more--muted">
              {editMode ? "Drag to reorder" : (card.moreLabel ?? "More details")}
            </span>
          )}
        </footer>
      </article>

      {!ghost && !card.empty && card.seriesStatus !== "pending" && card.seriesStatus !== "error" ? (
        <ChartMaximizeOverlay
          open={maximized}
          title={card.title}
          onClose={() => setMaximized(false)}
        >
          <div className="chart-maximize-overlay__meta">
            <p className="overview-chart-card__value overview-chart-card__value--lg">
              {card.value}
            </p>
            {card.compareLabel ? (
              <p className="overview-chart-card__compare">{card.compareLabel}</p>
            ) : null}
          </div>
          <div className="chart-maximize-overlay__spark-wrap">
            <Sparkline
              values={card.series}
              labels={card.seriesLabels}
              label={`${card.title} trend`}
              size="fullscreen"
              metric={card.seriesMetric ?? card.title}
              formatValue={card.formatSeriesValue}
              color={card.chartColor}
            />
          </div>
          <p className="muted">
            {card.updatedLabel ?? "Updated just now"}
          </p>
        </ChartMaximizeOverlay>
      ) : null}
    </>
  );
}

/**
 * Customizable metrics grid (chart cards).
 * - Add charts → modal (parent)
 * - Edit → on-grid remove + pointer drag reorder (floating card + dashed slot)
 */
export function OverviewTable({
  title = "Metrics",
  filters,
  action,
  cards,
  className,
  editMode = false,
  onRemoveCard,
  onReorderCards,
}: Props) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [orderIds, setOrderIds] = useState<string[]>(() => cards.map((c) => c.id));
  const orderRef = useRef(orderIds);
  const dragRef = useRef<DragState | null>(null);
  const pendingRef = useRef<DragState | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  // Sync order when cards change from outside (Add / remove) — not mid-drag.
  useEffect(() => {
    if (dragRef.current || pendingRef.current) return;
    const next = cards.map((c) => c.id);
    setOrderIds(next);
    orderRef.current = next;
  }, [cards]);

  useEffect(() => {
    if (!editMode) {
      dragRef.current = null;
      pendingRef.current = null;
      setDrag(null);
    }
  }, [editMode]);

  const cardById = useCallback(
    (id: string) => cards.find((c) => c.id === id),
    [cards],
  );

  const orderedCards = orderIds
    .map((id) => cardById(id))
    .filter((c): c is OverviewChartCard => Boolean(c));

  const hitTestReorder = useCallback(
    (clientX: number, clientY: number, draggingId: string) => {
      const grid = gridRef.current;
      if (!grid) return;
      const nodes = grid.querySelectorAll<HTMLElement>("[data-chart-id]");
      for (const node of nodes) {
        const id = node.dataset.chartId;
        if (!id || id === draggingId) continue;
        const r = node.getBoundingClientRect();
        if (
          clientX >= r.left &&
          clientX <= r.right &&
          clientY >= r.top &&
          clientY <= r.bottom
        ) {
          const next = moveIdBefore(orderRef.current, draggingId, id);
          if (next.join() === orderRef.current.join()) return;
          orderRef.current = next;
          setOrderIds(next);
          return;
        }
      }
    },
    [],
  );

  const endDrag = useCallback(
    (commit: boolean) => {
      const wasDragging = Boolean(dragRef.current);
      dragRef.current = null;
      pendingRef.current = null;
      setDrag(null);
      if (commit && wasDragging) onReorderCards?.(orderRef.current);
    },
    [onReorderCards],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const pending = pendingRef.current;
      if (pending && !dragRef.current) {
        const dx = e.clientX - (pending.x + pending.offsetX);
        const dy = e.clientY - (pending.y + pending.offsetY);
        if (Math.hypot(dx, dy) < 5) return;
        dragRef.current = pending;
        setDrag(pending);
      }

      const d = dragRef.current;
      if (!d) return;
      e.preventDefault();
      const next = {
        ...d,
        x: e.clientX - d.offsetX,
        y: e.clientY - d.offsetY,
      };
      dragRef.current = next;
      setDrag(next);
      hitTestReorder(e.clientX, e.clientY, d.id);
    };

    const onUp = () => endDrag(true);

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [endDrag, hitTestReorder]);

  const startDrag = (cardId: string, e: ReactPointerEvent<HTMLElement>) => {
    if (!editMode || !onReorderCards) return;
    if ((e.target as HTMLElement).closest("button, a")) return;
    if (e.button !== 0) return;

    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    pendingRef.current = {
      id: cardId,
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };
  };

  const draggingCard = drag ? cardById(drag.id) : undefined;

  return (
    <section
      className={`overview-charts${editMode ? " overview-charts--editing" : ""}${
        drag ? " overview-charts--dragging" : ""
      }${className ? ` ${className}` : ""}`}
      aria-label={title}
    >
      <header className="overview-charts__head">
        <h2 className="overview-charts__title">{title}</h2>
        <div className="overview-charts__toolbar">
          {filters ? <div className="overview-charts__filters">{filters}</div> : null}
          {action ? <div className="overview-charts__actions">{action}</div> : null}
        </div>
        {editMode ? (
          <p className="overview-charts__edit-hint">
            Remove charts with ×, or drag cards to reorder. Click Done when finished.
          </p>
        ) : null}
      </header>

      {orderedCards.length === 0 ? (
        <p className="muted">No charts selected. Click + Add to choose charts.</p>
      ) : (
        <div className="overview-charts__grid" ref={gridRef}>
          {orderedCards.map((card) => (
            <OverviewChartCardView
              key={card.id}
              card={card}
              editMode={editMode}
              placeholder={drag?.id === card.id}
              onRemove={() => onRemoveCard?.(card.id)}
              onPointerDownDrag={(e) => startDrag(card.id, e)}
            />
          ))}
        </div>
      )}

      {drag && draggingCard
        ? createPortal(
            <div
              className="overview-chart-ghost-layer"
              style={{
                width: drag.width,
                height: drag.height,
                transform: `translate(${drag.x}px, ${drag.y}px)`,
              }}
            >
              <OverviewChartCardView card={draggingCard} editMode ghost />
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
