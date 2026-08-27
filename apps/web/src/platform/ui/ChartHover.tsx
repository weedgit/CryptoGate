import {
  useCallback,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type ChartPoint = { x: number; y: number };

export function formatChartDay(label: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(label);
  if (!m) return label;
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
  return `${month} ${Number(m[3])}, ${m[1]}`;
}

/** Day-bucket labels → date + start-of-day time for chart footers. */
export function formatChartDateTime(label: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(label);
  if (!m) return label;
  const day = formatChartDay(label);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  return `${day} · ${time}`;
}

export function nearestPointIndex(localX: number, pts: ChartPoint[]): number {
  if (pts.length === 0) return 0;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.abs(pts[i].x - localX);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

export type ChartHoverState = {
  index: number;
  /** Viewport X for fixed tooltip. */
  clientX: number;
  /** Viewport Y for fixed tooltip. */
  clientY: number;
};

export function useLineChartHover(pts: ChartPoint[]) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<ChartHoverState | null>(null);

  const onMouseMove = useCallback(
    (e: ReactMouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg || pts.length === 0) return;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const local = pt.matrixTransform(ctm.inverse());
      const index = nearestPointIndex(local.x, pts);
      const p = pts[index];
      if (!p) return;
      // Map active point to screen so tip follows the data, not raw cursor Y.
      const screen = svg.createSVGPoint();
      screen.x = p.x;
      screen.y = p.y;
      const mapped = screen.matrixTransform(ctm);
      setHover({
        index,
        clientX: mapped.x,
        clientY: mapped.y,
      });
    },
    [pts],
  );

  const onMouseLeave = useCallback(() => setHover(null), []);

  return { svgRef, hover, onMouseMove, onMouseLeave };
}

export function ChartHoverTip({
  clientX,
  clientY,
  children,
}: {
  clientX: number;
  clientY: number;
  children: ReactNode;
}) {
  const flipX = clientX > window.innerWidth * 0.72;
  const flipY = clientY < 96;
  return createPortal(
    <div
      className={[
        "chart-hover__tip",
        flipX ? "chart-hover__tip--flip-x" : "",
        flipY ? "chart-hover__tip--flip-y" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ left: clientX, top: clientY }}
      role="tooltip"
    >
      {children}
    </div>,
    document.body,
  );
}
