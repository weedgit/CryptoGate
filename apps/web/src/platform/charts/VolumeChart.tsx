import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ChartHoverTip,
  formatChartDateTime,
  useLineChartHover,
} from "../ui/ChartHover";
import { formatAxisNumber, niceAxisTicks, chartScaleTop } from "../ui/chartAxis";

function formatAxisUsd(n: number): string {
  return formatAxisNumber(n, true);
}

function formatMoneyFigure(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatUsd(n: number): string {
  return `${formatMoneyFigure(n)} USD`;
}

function clientToSvgX(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): number | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  return pt.matrixTransform(ctm.inverse()).x;
}

type ChartViewWindow = { start: number; end: number };

export type VolumeChartZoomApi = {
  reset: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

function clampViewWindow(
  start: number,
  end: number,
  lastIndex: number,
  minSpan: number,
): ChartViewWindow {
  let span = Math.max(end - start, minSpan);
  span = Math.min(span, Math.max(lastIndex, minSpan));
  let nextStart = start;
  let nextEnd = start + span;
  if (nextStart < 0) {
    nextStart = 0;
    nextEnd = span;
  }
  if (nextEnd > lastIndex) {
    nextEnd = lastIndex;
    nextStart = Math.max(0, lastIndex - span);
  }
  return { start: nextStart, end: nextEnd };
}

export function VolumeChart({
  values,
  labels,
  size = "default",
  showZoomBar = true,
  onZoomedChange,
  zoomApiRef,
}: {
  values: number[];
  labels: string[];
  size?: "default" | "fullscreen";
  /** When false, parent renders zoom controls (e.g. beside chart help). */
  showZoomBar?: boolean;
  onZoomedChange?: (zoomed: boolean) => void;
  zoomApiRef?: { current: VolumeChartZoomApi | null };
}) {
  const reactId = useId().replace(/:/g, "");
  const fillId = `platVolFill-${reactId}`;
  const fullscreen = size === "fullscreen";
  const h = fullscreen ? 360 : 360;
  const padLeft = fullscreen ? 78 : 68;
  const padRight = fullscreen ? 16 : 14;
  const padTop = fullscreen ? 14 : 14;
  const padBottom = fullscreen ? 36 : 28;
  const baseline = h - padBottom;
  const lastIndex = Math.max(values.length - 1, 0);
  const minSpan = Math.min(2, Math.max(lastIndex, 1));

  const wrapRef = useRef<HTMLDivElement>(null);
  const [vbW, setVbW] = useState(fullscreen ? 1120 : 680);
  const [layoutReady, setLayoutReady] = useState(false);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const sync = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width < 40 || height < 40) return;
      // Match viewBox aspect to the painted box so the chart fills width
      // without letterboxing or stretching axis text.
      setVbW(Math.max(280, Math.round((width / height) * h)));
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

  const [view, setView] = useState<ChartViewWindow>({ start: 0, end: lastIndex });
  const viewRef = useRef(view);
  viewRef.current = view;
  const dragRef = useRef<{
    pointerId: number;
    svgX: number;
    start: number;
    end: number;
    moved: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setView({ start: 0, end: Math.max(values.length - 1, 0) });
  }, [values.length, labels[0], labels[labels.length - 1]]);

  const zoomed = view.start > 0.01 || view.end < lastIndex - 0.01;

  useEffect(() => {
    onZoomedChange?.(zoomed);
  }, [zoomed, onZoomedChange]);

  const resetView = useCallback(() => {
    setView({ start: 0, end: lastIndex });
  }, [lastIndex]);

  const zoomBy = useCallback(
    (factor: number) => {
      if (lastIndex <= 0) return;
      const { start, end } = viewRef.current;
      const span = Math.max(end - start, 1e-6);
      const focus = (start + end) / 2;
      setView(
        clampViewWindow(
          focus - (span * factor) / 2,
          focus + (span * factor) / 2,
          lastIndex,
          minSpan,
        ),
      );
    },
    [lastIndex, minSpan],
  );

  useEffect(() => {
    if (!zoomApiRef) return;
    zoomApiRef.current = {
      reset: resetView,
      zoomIn: () => zoomBy(1 / 1.35),
      zoomOut: () => zoomBy(1.35),
    };
    return () => {
      zoomApiRef.current = null;
    };
  }, [zoomApiRef, resetView, zoomBy]);

  const visible = useMemo(() => {
    if (values.length === 0) {
      return { idxs: [] as number[], max: 1 };
    }
    const lo = Math.max(0, Math.floor(view.start));
    const hi = Math.min(lastIndex, Math.ceil(view.end));
    const idxs: number[] = [];
    for (let i = lo; i <= hi; i++) idxs.push(i);
    if (idxs.length === 0) idxs.push(0);
    let max = 1;
    for (const i of idxs) max = Math.max(max, values[i] ?? 0);
    return { idxs, max };
  }, [values, view.start, view.end, lastIndex]);

  const yTicks = useMemo(
    () => niceAxisTicks(visible.max, fullscreen ? 5 : 4),
    [visible.max, fullscreen],
  );
  const yTop = chartScaleTop(visible.max, fullscreen ? 5 : 4);

  const indexToX = useCallback(
    (i: number) => {
      const span = Math.max(view.end - view.start, 1e-6);
      if (lastIndex === 0) return padLeft + plotW / 2;
      return padLeft + ((i - view.start) / span) * plotW;
    },
    [view.start, view.end, lastIndex, padLeft, plotW],
  );

  const valueToY = useCallback(
    (v: number) => baseline - (v / yTop) * plotH,
    [baseline, yTop, plotH],
  );

  const pts = useMemo(
    () =>
      visible.idxs.map((i) => ({
        i,
        x: indexToX(i),
        y: valueToY(values[i] ?? 0),
      })),
    [visible.idxs, indexToX, valueToY, values],
  );

  const hoverPts = useMemo(() => pts.map((p) => ({ x: p.x, y: p.y })), [pts]);
  const { svgRef, hover, onMouseMove, onMouseLeave } = useLineChartHover(hoverPts);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (e: WheelEvent) => {
      if (lastIndex <= 0) return;
      const { start, end } = viewRef.current;
      const isZoomed = start > 0.01 || end < lastIndex - 0.01;
      if (!isZoomed) return;

      // Trackpad horizontal scroll / shift+wheel → pan when already zoomed.
      // Vertical wheel does not zoom (use +/- controls).
      const panDelta =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (panDelta === 0) return;

      e.preventDefault();
      e.stopPropagation();
      const span = Math.max(end - start, 1e-6);
      const dIndex = (panDelta / Math.max(plotW, 1)) * span * 0.0025 * plotW;
      setView(
        clampViewWindow(start + dIndex, end + dIndex, lastIndex, minSpan),
      );
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", onWheel);
  }, [lastIndex, minSpan, plotW]);

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const area =
    pts.length > 0
      ? `${line} L ${pts[pts.length - 1].x} ${baseline} L ${pts[0].x} ${baseline} Z`
      : "";
  const frame =
    pts.length > 0
      ? `M ${pts[0].x} ${pts[0].y} L ${pts[0].x} ${baseline} L ${pts[pts.length - 1].x} ${baseline} L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`
      : "";

  const seriesAnimKey = `${labels[0] ?? ""}|${labels[labels.length - 1] ?? ""}|${values.length}|${Math.round(values[0] ?? 0)}|${Math.round(values[values.length - 1] ?? 0)}`;
  const prevSeriesAnimKey = useRef("");
  /** axis = X wipe first; series = clip wipe of line/fill; idle = done */
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

    // Zoom/pan rewrite path coords — only replay when the series itself changes.
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

  const active = !dragging && revealPhase === "idle" && hover ? pts[hover.index] : null;
  const activeValue =
    active != null ? values[active.i] : undefined;
  const activeLabel =
    active != null ? labels[active.i] : undefined;

  /** Points whose X sits inside the plot — grids/labels must not spill into gutters when zoomed. */
  const inPlotPts = useMemo(
    () => pts.filter((p) => p.x >= padLeft - 0.01 && p.x <= w - padRight + 0.01),
    [pts, padLeft, w, padRight],
  );

  const xLabelStep = Math.max(1, Math.ceil(inPlotPts.length / (fullscreen ? 10 : 7)));

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || lastIndex <= 0) return;
    const { start, end } = viewRef.current;
    const isZoomed = start > 0.01 || end < lastIndex - 0.01;
    if (!isZoomed) return;
    const svg = svgRef.current;
    if (!svg) return;
    const localX = clientToSvgX(svg, e.clientX, e.clientY);
    if (localX == null) return;
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    svg.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      svgX: localX,
      start,
      end,
      moved: false,
    };
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) {
      if (!dragging) onMouseMove(e);
      return;
    }
    const svg = svgRef.current;
    if (!svg) return;
    const localX = clientToSvgX(svg, e.clientX, e.clientY);
    if (localX == null) return;
    const dx = localX - drag.svgX;
    if (!drag.moved && Math.abs(dx) < 3) {
      onMouseMove(e);
      return;
    }
    e.preventDefault();
    if (!drag.moved) {
      drag.moved = true;
      setDragging(true);
      window.getSelection()?.removeAllRanges();
    }
    const span = Math.max(drag.end - drag.start, 1e-6);
    const dIndex = -(dx / plotW) * span;
    setView(
      clampViewWindow(
        drag.start + dIndex,
        drag.end + dIndex,
        lastIndex,
        minSpan,
      ),
    );
  };

  const endDrag = (e: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    try {
      svgRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  const focusDateTime = useMemo(() => {
    if (active && activeLabel) return formatChartDateTime(activeLabel);
    if (pts.length === 0 || labels.length === 0) return "—";
    const first = labels[pts[0]!.i];
    const last = labels[pts[pts.length - 1]!.i];
    if (!first || !last) return "—";
    if (first === last) return formatChartDateTime(first);
    return `${formatChartDateTime(first)} – ${formatChartDateTime(last)}`;
  }, [active, activeLabel, pts, labels]);

  return (
    <div
      ref={wrapRef}
      className={`chart-hover${zoomed ? " chart-hover--zoomed" : ""}`}
    >
      {showZoomBar && zoomed ? (
        <div className="volume-chart__zoom-bar">
          <span className="volume-chart__zoom-hint">Drag to pan</span>
          <button type="button" className="volume-chart__zoom-reset" onClick={resetView}>
            Reset
          </button>
        </div>
      ) : null}
      <svg
        ref={svgRef}
        className={`volume-chart volume-chart--plat-ref${fullscreen ? " volume-chart--fullscreen" : ""}${dragging ? " is-dragging" : ""}${zoomed ? " is-zoomed" : ""}${revealPhase === "axis" ? " is-axis-revealing" : ""}`}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Volume. Use plus and minus to zoom, drag to pan, double-click to reset."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onMouseLeave={() => {
          if (!dragRef.current) {
            setDragging(false);
            onMouseLeave();
          }
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          resetView();
        }}
      >
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(52, 211, 153, 0.18)" />
            <stop offset="100%" stopColor="rgba(52, 211, 153, 0)" />
          </linearGradient>
          <clipPath id={`platVolClip-${reactId}`}>
            <rect x={padLeft} y={padTop - 2} width={plotW} height={plotH + 4} />
          </clipPath>
          <clipPath id={`platVolLabelClip-${reactId}`}>
            <rect x={padLeft} y={baseline} width={plotW} height={padBottom} />
          </clipPath>
        </defs>
        {yTicks.map((tick) => {
          const y = valueToY(tick);
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
                x={padLeft - 8}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={fullscreen ? 11 : 9}
                fontFamily="var(--font-mono)"
              >
                {formatAxisUsd(tick)}
              </text>
            </g>
          );
        })}
        <g clipPath={`url(#platVolClip-${reactId})`}>
          {inPlotPts.map((p, idx) => {
            const show =
              inPlotPts.length <= 8 ||
              idx === 0 ||
              idx === inPlotPts.length - 1 ||
              idx % xLabelStep === 0;
            if (!show) return null;
            return (
              <line
                key={`xg-${p.i}`}
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
            {frame ? (
              <path className="volume-chart__frame" d={frame} fill="none" />
            ) : null}
            <path
              className="volume-chart__line"
              d={line}
              fill="none"
              strokeWidth={fullscreen ? 3 : 2.5}
            />
            {pts.map((p) => (
              <circle
                key={p.i}
                className="volume-chart__point"
                cx={p.x}
                cy={p.y}
                r={fullscreen ? 5.5 : 4.75}
                opacity={
                  revealPhase === "idle" && active && active.i !== p.i ? 0.4 : 1
                }
              />
            ))}
          </g>
          {active &&
          active.x >= padLeft &&
          active.x <= w - padRight ? (
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
                r={fullscreen ? 12 : 10}
              />
              <circle
                className="chart-hover__dot"
                cx={active.x}
                cy={active.y}
                r={fullscreen ? 6 : 5}
              />
            </>
          ) : null}
        </g>
        <g clipPath={`url(#platVolLabelClip-${reactId})`}>
          {inPlotPts.map((p, idx) => {
            const show =
              inPlotPts.length <= 8 ||
              idx === 0 ||
              idx === inPlotPts.length - 1 ||
              idx % xLabelStep === 0;
            if (!show) return null;
            const label = labels[p.i] ?? "";
            const nearLeft = p.x <= padLeft + 18;
            const nearRight = p.x >= w - padRight - 18;
            const anchor = nearLeft ? "start" : nearRight ? "end" : "middle";
            const x = nearLeft ? padLeft : nearRight ? w - padRight : p.x;
            return (
              <text
                key={`xl-${p.i}`}
                className="volume-chart__xlabel"
                x={x}
                y={h - 8}
                textAnchor={anchor}
                fontSize={fullscreen ? 11 : 9}
                fontFamily="var(--font-mono)"
              >
                {label.slice(5)}
              </text>
            );
          })}
        </g>
      </svg>
      <p className="volume-chart__datetime" aria-live="polite">
        {focusDateTime}
      </p>
      {active && activeLabel != null && activeValue != null && hover ? (
        <ChartHoverTip clientX={hover.clientX} clientY={hover.clientY}>
          <p className="chart-hover__tip-row">
            <span className="chart-hover__tip-k">Volume</span>
            <span className="chart-hover__tip-v">{formatUsd(activeValue)}</span>
          </p>
        </ChartHoverTip>
      ) : null}
    </div>
  );
}
