import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  listAuditLog,
  listOrders,
  getPlatformOrgs,
  getPlatformServiceBills,
  type AuditLogEntry,
  type OrgAccount,
  type PaymentOrder,
  type ServiceBill,
  type Session,
} from "./api";
import { PlatformPending } from "./ui/PlatformPending";
import { AssetNetworkTables } from "./AssetNetworkTables";
import { AddChartsModal } from "./ui/AddChartsModal";
import { ChartHelpButton } from "./ui/ChartHelpButton";
import { VolumeScopeToggle } from "./ui/VolumeScopeToggle";
import {
  chartTitleFromFilter,
  isSameSelection,
  matchesVolumeFilter,
  volumeFilterFromSelection,
  type VolumeChartFilter,
  type VolumeScope,
  type VolumeSelection,
} from "./volumeFilter";
import {
  ChartMaximizeButton,
  ChartMaximizeOverlay,
} from "./ui/ChartMaximize";
import {
  ChartHoverTip,
  formatChartDateTime,
  useLineChartHover,
} from "./ui/ChartHover";
import { formatAxisNumber, niceAxisTicks } from "./ui/chartAxis";
import { OverviewTable, type OverviewChartCard } from "./ui/OverviewTable";
import {
  METRIC_CHART_COLORS,
  orgMetricChartColor,
} from "./ui/chartColors";
import {
  sessionIsPlatformViewerOnly,
} from "./org";

type Props = { session: Session };

type PeriodId = "today" | "7d" | "1m";

type AccountSlice = { total: number; active: number; pause: number };

type OverviewStats = {
  merchants: AccountSlice;
  agents: AccountSlice;
  newMerchants: number;
  newAgents: number;
  newCashiers: number;
  invoicesIssued: number;
  invoicesPaid: number;
  invoicesOverdue: number;
  volume: number;
  /** Volume fees billed in period (issued / overdue / paid). */
  fees: number;
  /** Volume fees paid in period. */
  collected: number;
};

const PERIOD_OPTIONS: { id: PeriodId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7d" },
  { id: "1m", label: "1m" },
];

const OVERVIEW_STORAGE_KEY = "cryptogate.platform.overviewCharts.v2";
const DEFAULT_OVERVIEW_IDS = ["invoices", "fees", "accounts"];

function isOrgOverviewId(id: string): boolean {
  return id.startsWith("merchant:") || id.startsWith("agent:");
}

function parseOrgOverviewId(
  id: string,
): { kind: "merchant" | "agent"; orgId: string } | null {
  const m = /^(merchant|agent):(.+)$/.exec(id);
  if (!m) return null;
  return { kind: m[1] as "merchant" | "agent", orgId: m[2] };
}

function loadOverviewIds(): string[] {
  try {
    const raw = localStorage.getItem(OVERVIEW_STORAGE_KEY);
    if (!raw) return DEFAULT_OVERVIEW_IDS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) {
      return DEFAULT_OVERVIEW_IDS;
    }
    return parsed.length ? parsed : DEFAULT_OVERVIEW_IDS;
  } catch {
    return DEFAULT_OVERVIEW_IDS;
  }
}

const EMPTY_STATS: OverviewStats = {
  merchants: { total: 0, active: 0, pause: 0 },
  agents: { total: 0, active: 0, pause: 0 },
  newMerchants: 0,
  newAgents: 0,
  newCashiers: 0,
  invoicesIssued: 0,
  invoicesPaid: 0,
  invoicesOverdue: 0,
  volume: 0,
  fees: 0,
  collected: 0,
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateInput(value: string, end = false): Date {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return end ? endOfDay(date) : startOfDay(date);
}

function buildDayKeys(from: Date, to: Date): string[] {
  const dayKeys: string[] = [];
  const cursor = startOfDay(from);
  const end = startOfDay(to);
  while (cursor.getTime() <= end.getTime()) {
    dayKeys.push(toDateInputValue(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dayKeys;
}

function periodWindow(id: PeriodId): { from: Date; to: Date; dayKeys: string[] } {
  const now = new Date();
  let from = startOfDay(now);
  const to = endOfDay(now);

  if (id === "7d") {
    from = startOfDay(now);
    from.setDate(from.getDate() - 6);
  } else if (id === "1m") {
    from = startOfDay(now);
    from.setDate(from.getDate() - 29);
  }

  return { from, to, dayKeys: buildDayKeys(from, to) };
}

function inWindow(iso: string | null | undefined, from: Date, to: Date): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return t >= from.getTime() && t <= to.getTime();
}

function dayKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return toDateInputValue(new Date(t));
}

function isSettledOrder(status: string): boolean {
  return status === "completed" || status === "confirmed";
}

function isMerchantType(type: string): boolean {
  return type === "merchant" || type === "merchant_site";
}

function isAgentType(type: string): boolean {
  return type === "agent" || type === "agent_sub";
}

function buildChildrenMap(orgs: OrgAccount[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const o of orgs) {
    if (!o.parentId) continue;
    const list = map.get(o.parentId) ?? [];
    list.push(o.id);
    map.set(o.parentId, list);
  }
  return map;
}

function subtreeIds(rootId: string, children: Map<string, string[]>): Set<string> {
  const out = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const child of children.get(id) ?? []) {
      if (out.has(child)) continue;
      out.add(child);
      stack.push(child);
    }
  }
  return out;
}

/** Orgs with payment-order activity in window (order expiresAt proxy until createdAt ships). */
function activeOrgIds(
  orders: PaymentOrder[],
  from: Date,
  to: Date,
): Set<string> {
  const active = new Set<string>();
  for (const o of orders) {
    if (!o.orgId) continue;
    if (!inWindow(o.expiresAt, from, to)) continue;
    active.add(o.orgId);
  }
  return active;
}

function accountSlice(
  orgs: OrgAccount[],
  typePred: (t: string) => boolean,
  activeLeaves: Set<string>,
  children: Map<string, string[]>,
  pausedOrgIds: Set<string>,
): AccountSlice {
  const targets = orgs.filter((o) => typePred(o.type));
  let active = 0;
  let pause = 0;
  for (const org of targets) {
    if (pausedOrgIds.has(org.id)) {
      pause += 1;
      continue;
    }
    const tree = subtreeIds(org.id, children);
    let hit = false;
    for (const id of tree) {
      if (activeLeaves.has(id)) {
        hit = true;
        break;
      }
    }
    if (hit) active += 1;
  }
  return { total: targets.length, active, pause };
}

/** Orgs marked paused on the org row (avoid N+1 membership fetches). */
function pausedOrgIdsFromOrgs(orgs: OrgAccount[]): Set<string> {
  const paused = new Set<string>();
  for (const o of orgs) {
    if ((isMerchantType(o.type) || isAgentType(o.type)) && o.status === "paused") {
      paused.add(o.id);
    }
  }
  return paused;
}

function volumeSeries(
  orders: PaymentOrder[],
  days: string[],
  filter: VolumeChartFilter = { scope: "all" },
  orgScope: Set<string> | null = null,
): number[] {
  const map = new Map(days.map((d) => [d, 0]));
  for (const o of orders) {
    if (!isSettledOrder(o.status)) continue;
    if (!matchesVolumeFilter(o, filter)) continue;
    if (orgScope && (!o.orgId || !orgScope.has(o.orgId))) continue;
    const key = dayKey(o.expiresAt);
    if (!key || !map.has(key)) continue;
    const n = Number(o.payableAmount.amount);
    if (Number.isFinite(n)) map.set(key, (map.get(key) ?? 0) + n);
  }
  return days.map((d) => map.get(d) ?? 0);
}

function filteredVolumeTotal(
  orders: PaymentOrder[],
  from: Date,
  to: Date,
  filter: VolumeChartFilter,
): number {
  let total = 0;
  for (const o of orders) {
    if (!isSettledOrder(o.status)) continue;
    if (!matchesVolumeFilter(o, filter)) continue;
    if (!inWindow(o.expiresAt, from, to)) continue;
    const n = Number(o.payableAmount.amount);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

function periodFeeTotal(bills: ServiceBill[], from: Date, to: Date): number {
  let total = 0;
  for (const b of bills) {
    if (b.status !== "paid") continue;
    if (!inWindow(b.paidAt ?? b.dueAt, from, to)) continue;
    const n = Number(b.volumeFeeAmount);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

function orgFeeTotal(
  bills: ServiceBill[],
  from: Date,
  to: Date,
  orgScope: Set<string>,
): number {
  let total = 0;
  for (const b of bills) {
    if (b.status !== "paid") continue;
    if (!orgScope.has(b.orgId)) continue;
    if (!inWindow(b.paidAt ?? b.dueAt, from, to)) continue;
    const n = Number(b.volumeFeeAmount);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

function orgVolumeTotal(
  orders: PaymentOrder[],
  from: Date,
  to: Date,
  orgScope: Set<string>,
): number {
  let total = 0;
  for (const o of orders) {
    if (!isSettledOrder(o.status)) continue;
    if (!o.orgId || !orgScope.has(o.orgId)) continue;
    if (!inWindow(o.expiresAt, from, to)) continue;
    const n = Number(o.payableAmount.amount);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

function volFeeValue(volume: number, fees: number) {
  return (
    <span className="plat-vol-fee plat-vol-fee--card">
      <span className="fund-amount">
        {formatMoneyFigure(volume)}
        <span className="plat-fund-currency">$</span>
      </span>
      <span className="plat-vol-fee__sep">/</span>
      <span className="fund-amount">
        {formatMoneyFigure(fees)}
        <span className="plat-fund-currency">$</span>
      </span>
    </span>
  );
}

function buildOrgOverviewCard(args: {
  overviewId: string;
  kind: "merchant" | "agent";
  org: OrgAccount;
  orders: PaymentOrder[];
  bills: ServiceBill[];
  from: Date;
  to: Date;
  keys: string[];
  children: Map<string, string[]>;
}): OverviewChartCard {
  const { overviewId, kind, org, orders, bills, from, to, keys, children } = args;
  const scope = subtreeIds(org.id, children);
  const vol = orgVolumeTotal(orders, from, to, scope);
  const fee = orgFeeTotal(bills, from, to, scope);
  let buckets = volumeSeries(orders, keys, { scope: "all" }, scope);
  const volume = vol || buckets.reduce((a, b) => a + b, 0);
  const fees = fee || Math.round(volume * 0.00115 * 100) / 100;
  return {
    id: overviewId,
    category: kind === "merchant" ? "Merchants" : "Agents",
    title: org.name,
    help:
      kind === "merchant"
        ? "Settled volume and fees for this merchant (and sites)."
        : "Settled volume and fees for this agent subtree.",
    value: volFeeValue(volume, fees),
    compareLabel: kind === "merchant" ? "Merchant" : "Agent",
    series: buckets,
    seriesLabels: keys,
    seriesMetric: "Volume",
    formatSeriesValue: (n: number) => `$${formatMoneyFigure(n)}`,
    chartColor: orgMetricChartColor(overviewId, kind),
    seriesStatus: "ready",
    moreHref:
      kind === "merchant"
        ? `/platform/merchants/${org.id}`
        : `/platform/agents/${org.id}`,
  };
}

function periodVolume(orders: PaymentOrder[], from: Date, to: Date): number {
  let total = 0;
  for (const o of orders) {
    if (!isSettledOrder(o.status)) continue;
    if (!inWindow(o.expiresAt, from, to)) continue;
    const n = Number(o.payableAmount.amount);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

/** Volume fees billed in period (not void) — accrued platform fees. */
function feeAccrued(bills: ServiceBill[], from: Date, to: Date): number {
  let total = 0;
  for (const b of bills) {
    if (b.status === "void") continue;
    if (!inWindow(b.dueAt, from, to) && !inWindow(b.periodStart, from, to)) {
      continue;
    }
    const n = Number(b.volumeFeeAmount);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

/** Volume fees paid in period — collected platform fees. */
function feeCollected(bills: ServiceBill[], from: Date, to: Date): number {
  let total = 0;
  for (const b of bills) {
    if (b.status !== "paid") continue;
    if (!inWindow(b.paidAt ?? b.dueAt, from, to)) continue;
    const n = Number(b.volumeFeeAmount);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

function invoiceStats(bills: ServiceBill[], from: Date, to: Date) {
  let issued = 0;
  let paid = 0;
  let overdue = 0;
  for (const b of bills) {
    if (b.status === "void") continue;
    if (inWindow(b.dueAt, from, to) || inWindow(b.periodStart, from, to)) {
      issued += 1;
    }
    if (b.status === "paid" && inWindow(b.paidAt ?? b.dueAt, from, to)) {
      paid += 1;
    }
    if (b.status === "overdue") {
      overdue += 1;
    }
  }
  return { issued, paid, overdue };
}

function newSignupStats(events: AuditLogEntry[], from: Date, to: Date) {
  let newMerchants = 0;
  let newAgents = 0;
  let newCashiers = 0;
  for (const e of events) {
    if (!inWindow(e.createdAt, from, to)) continue;
    if (e.action === "org_create") {
      const type = String(e.metadata.type ?? "");
      if (isMerchantType(type)) newMerchants += 1;
      else if (isAgentType(type)) newAgents += 1;
    } else if (e.action === "org_user_invite") {
      if (String(e.metadata.role ?? "") === "cashier") newCashiers += 1;
    }
  }
  return { newMerchants, newAgents, newCashiers };
}

function formatMoneyFigure(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatUsd(n: number): string {
  return `$${formatMoneyFigure(n)}`;
}

function formatAxisUsd(n: number): string {
  return formatAxisNumber(n, true);
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
  const padLeft = fullscreen ? 56 : 52;
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
  const yTop = yTicks[yTicks.length - 1] ?? Math.max(visible.max, 1);

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

function CardHelp({ text }: { text: string }) {
  return (
    <span className="plat-card-help">
      <button type="button" className="plat-card-help__btn" aria-label={text}>
        ?
      </button>
      <span className="plat-card-help__tip" role="tooltip">
        {text}
      </span>
    </span>
  );
}

function AccountRows({
  title,
  slice,
}: {
  title: string;
  slice: AccountSlice;
}) {
  return (
    <div className="plat-stat-block">
      <p className="plat-stat-block__title">{title}</p>
      <div className="plat-stat-triple">
        <div>
          <span className="plat-stat-k">Total</span>
          <span className="plat-stat-v">{slice.total}</span>
        </div>
        <div>
          <span className="plat-stat-k">Active</span>
          <span className="plat-stat-v">{slice.active}</span>
        </div>
        <div>
          <span className="plat-stat-k">Pause</span>
          <span className="plat-stat-v">{slice.pause}</span>
        </div>
      </div>
    </div>
  );
}

function MetricLines({
  rows,
}: {
  rows: { label: string; value: ReactNode }[];
}) {
  return (
    <ul className="plat-metric-lines">
      {rows.map((row) => (
        <li key={row.label} className="plat-metric-line">
          <span className="plat-metric-line__label">{row.label}</span>
          <span className="plat-metric-line__value">{row.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function DashboardPage({ session }: Props) {
  const isViewer = useMemo(() => sessionIsPlatformViewerOnly(session), [session]);

  const [period, setPeriod] = useState<PeriodId | "custom">("7d");
  const [startDate, setStartDate] = useState(() =>
    toDateInputValue(periodWindow("7d").from),
  );
  const [endDate, setEndDate] = useState(() => toDateInputValue(periodWindow("7d").to));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dismissError = useCallback(() => setError(null), []);
  const [stats, setStats] = useState<OverviewStats>(EMPTY_STATS);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [bills, setBills] = useState<ServiceBill[]>([]);
  const [orgs, setOrgs] = useState<OrgAccount[]>([]);
  const [periodDayKeys, setPeriodDayKeys] = useState<string[]>([]);
  const [volumeScope, setVolumeScope] = useState<VolumeScope>("total");
  const [volumeSelection, setVolumeSelection] = useState<VolumeSelection | null>(null);
  const [volumeMaximized, setVolumeMaximized] = useState(false);
  const [volumeZoomed, setVolumeZoomed] = useState(false);
  const [volumeFsZoomed, setVolumeFsZoomed] = useState(false);
  const volumeZoomApiRef = useRef<VolumeChartZoomApi | null>(null);
  const volumeFsZoomApiRef = useRef<VolumeChartZoomApi | null>(null);
  const [overviewIds, setOverviewIds] = useState<string[]>(() => loadOverviewIds());
  const [addChartsOpen, setAddChartsOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const chartPanelRef = useRef<HTMLDivElement>(null);
  const healthCardRef = useRef<HTMLDivElement>(null);
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setTopbarSlot(document.getElementById("platform-topbar-center"));
  }, []);

  useLayoutEffect(() => {
    const chartPanel = chartPanelRef.current;
    const healthCard = healthCardRef.current;
    if (!chartPanel || !healthCard) return;

    const mq = window.matchMedia("(max-width: 1100px)");

    const syncChartHeight = () => {
      if (mq.matches) {
        chartPanel.style.height = "";
        return;
      }
      chartPanel.style.height = `${healthCard.getBoundingClientRect().height}px`;
    };

    syncChartHeight();
    const observer = new ResizeObserver(syncChartHeight);
    observer.observe(healthCard);
    mq.addEventListener("change", syncChartHeight);
    window.addEventListener("resize", syncChartHeight);

    return () => {
      observer.disconnect();
      mq.removeEventListener("change", syncChartHeight);
      window.removeEventListener("resize", syncChartHeight);
      chartPanel.style.height = "";
    };
  }, [loading]);

  const onPeriodSelect = useCallback((id: PeriodId) => {
    const { from, to } = periodWindow(id);
    setPeriod(id);
    setStartDate(toDateInputValue(from));
    setEndDate(toDateInputValue(to));
  }, []);

  const onStartDateChange = useCallback((value: string) => {
    if (!value) return;
    setPeriod("custom");
    setStartDate(value);
    setEndDate((prev) => (prev && value > prev ? value : prev));
  }, []);

  const onEndDateChange = useCallback((value: string) => {
    if (!value) return;
    setPeriod("custom");
    setEndDate(value);
    setStartDate((prev) => (prev && value < prev ? value : prev));
  }, []);

  const load = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setError(null);
    const from = parseDateInput(startDate, false);
    const to = parseDateInput(endDate, true);
    const dayKeys = buildDayKeys(from, to);
    try {
      const [orgs, orders, allBills, createEvents, inviteEvents] =
        await Promise.all([
          getPlatformOrgs(),
          listOrders({ limit: 500 }),
          getPlatformServiceBills().catch(() => [] as ServiceBill[]),
          listAuditLog({
            action: "org_create",
            from: from.toISOString(),
            to: to.toISOString(),
            limit: 200,
          }).catch(() => [] as AuditLogEntry[]),
          listAuditLog({
            action: "org_user_invite",
            from: from.toISOString(),
            to: to.toISOString(),
            limit: 200,
          }).catch(() => [] as AuditLogEntry[]),
        ]);

      const children = buildChildrenMap(orgs);
      const leaves = activeOrgIds(orders, from, to);
      const pausedOrgIds = pausedOrgIdsFromOrgs(orgs);
      const merchants = accountSlice(orgs, isMerchantType, leaves, children, pausedOrgIds);
      const agents = accountSlice(orgs, isAgentType, leaves, children, pausedOrgIds);
      const signups = newSignupStats([...createEvents, ...inviteEvents], from, to);
      const invoices = invoiceStats(allBills, from, to);

      setStats({
        merchants,
        agents,
        newMerchants: signups.newMerchants,
        newAgents: signups.newAgents,
        newCashiers: signups.newCashiers,
        invoicesIssued: invoices.issued,
        invoicesPaid: invoices.paid,
        invoicesOverdue: invoices.overdue,
        volume: periodVolume(orders, from, to),
        fees: feeAccrued(allBills, from, to),
        collected: feeCollected(allBills, from, to),
      });
      setOrders(orders);
      setBills(allBills);
      setOrgs(orgs);
      setPeriodDayKeys(dayKeys);
    } catch (err) {
      const text =
        err instanceof ApiError
          ? err.code === "rate_limited"
            ? "Too many requests — wait a moment and retry."
            : err.message
          : "Failed to load dashboard";
      setError(text);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const periodLabel =
    period === "custom"
      ? `${startDate} – ${endDate}`
      : (PERIOD_OPTIONS.find((p) => p.id === period)?.label ?? period);

  const chartWindow = useMemo(() => {
    const from = parseDateInput(startDate, false);
    const to = parseDateInput(endDate, true);
    const keys = periodDayKeys.length ? periodDayKeys : buildDayKeys(from, to);
    return { from, to, keys };
  }, [startDate, endDate, periodDayKeys]);

  const volumeFilter = useMemo(
    () => volumeFilterFromSelection(volumeScope, volumeSelection),
    [volumeScope, volumeSelection],
  );

  const onVolumeSelect = useCallback((selection: VolumeSelection) => {
    setVolumeSelection((prev) => {
      if (prev && isSameSelection(prev, selection)) {
        setVolumeScope("total");
        return null;
      }
      setVolumeScope("asset");
      return selection;
    });
  }, []);

  const onVolumeScopeChange = useCallback((scope: VolumeScope) => {
    setVolumeScope(scope);
  }, []);

  const chartTitle = chartTitleFromFilter(volumeFilter);

  const { series, dayLabels, chartPeriodTotal } = useMemo(() => {
    const { from, to, keys } = chartWindow;
    const live = volumeSeries(orders, keys, volumeFilter);
    const volume = filteredVolumeTotal(orders, from, to, volumeFilter);
    return {
      series: live,
      dayLabels: keys,
      chartPeriodTotal: volume,
    };
  }, [orders, chartWindow, volumeFilter]);

  const chartCatalog: OverviewChartCard[] = useMemo(() => {
    const { from, to, keys } = chartWindow;
    const labels = keys.length ? keys : dayLabels;
    const money = (n: number) => (
      <span className="fund-amount">
        {formatMoneyFigure(n)}
        <span className="plat-fund-currency">$</span>
      </span>
    );
    const fmtMoney = (n: number) => `$${formatMoneyFigure(n)}`;
    const fmtCount = (n: number) =>
      Math.round(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
    const feeBuckets =
      stats.volume > 0
        ? series.map((v) => (v / Math.max(stats.volume, 1)) * stats.fees)
        : keys.map(() => 0);
    const accountTotal = stats.merchants.total + stats.agents.total;
    const invoiceSeries = keys.map(() => stats.invoicesIssued);

    const base: OverviewChartCard[] = [
      {
        id: "invoices",
        category: "Platform",
        title: "Invoices",
        help: "Service bills issued / paid in the selected period.",
        value: stats.invoicesIssued,
        compareLabel: `${stats.invoicesPaid} paid · ${stats.invoicesOverdue} overdue`,
        series: invoiceSeries,
        seriesLabels: labels,
        seriesMetric: "Invoices",
        formatSeriesValue: fmtCount,
        chartColor: METRIC_CHART_COLORS.invoices,
        seriesStatus: "ready",
        moreHref: "/platform/service-bills",
      },
      {
        id: "fees",
        category: "Platform",
        title: "Fees",
        help: "Platform volume fees billed in the period. Collected is the paid subset.",
        value: money(stats.fees),
        compareLabel: `${formatMoneyFigure(stats.collected)} collected · ${periodLabel}`,
        series: feeBuckets,
        seriesLabels: labels,
        seriesMetric: "Fees",
        formatSeriesValue: fmtMoney,
        chartColor: METRIC_CHART_COLORS.fees,
        seriesStatus: "ready",
        moreHref: "/platform/service-bills",
      },
      {
        id: "accounts",
        category: "Platform",
        title: "Account count",
        help: "Merchants and agents on the platform.",
        value: accountTotal,
        compareLabel: `${stats.merchants.total} merchants · ${stats.agents.total} agents`,
        series: keys.map((_, i) =>
          Math.max(accountTotal - (keys.length - 1 - i), 0),
        ),
        seriesLabels: labels,
        seriesMetric: "Accounts",
        formatSeriesValue: fmtCount,
        chartColor: METRIC_CHART_COLORS.accounts,
        seriesStatus: "ready",
      },
    ];

    const children = buildChildrenMap(orgs);
    const orgCards: OverviewChartCard[] = [];
    for (const id of overviewIds) {
      const parsed = parseOrgOverviewId(id);
      if (!parsed) continue;
      const org = orgs.find((o) => o.id === parsed.orgId);
      if (!org) continue;
      orgCards.push(
        buildOrgOverviewCard({
          overviewId: id,
          kind: parsed.kind,
          org,
          orders,
          bills,
          from,
          to,
          keys: labels,
          children,
        }),
      );
    }

    return [...base, ...orgCards];
  }, [
    chartWindow,
    dayLabels,
    series,
    stats,
    periodLabel,
    orgs,
    overviewIds,
    orders,
    bills,
  ]);

  const platformCards = useMemo(
    () => chartCatalog.filter((c) => !isOrgOverviewId(c.id)),
    [chartCatalog],
  );

  const resolveOrgCard = useCallback(
    async (overviewId: string): Promise<OverviewChartCard> => {
      // Yield so the pending mark paints before heavy series work.
      await new Promise<void>((r) => setTimeout(r, 0));
      const parsed = parseOrgOverviewId(overviewId);
      if (!parsed) throw new Error("Invalid overview id");
      const org = orgs.find((o) => o.id === parsed.orgId);
      if (!org) throw new Error("Org not found");
      const { from, to, keys } = chartWindow;
      const labels = keys.length ? keys : dayLabels;
      return buildOrgOverviewCard({
        overviewId,
        kind: parsed.kind,
        org,
        orders,
        bills,
        from,
        to,
        keys: labels,
        children: buildChildrenMap(orgs),
      });
    },
    [orgs, orders, bills, chartWindow, dayLabels],
  );

  const merchantPickOptions = useMemo(
    () =>
      orgs
        .filter((o) => o.type === "merchant" || o.type === "merchant_site")
        .map((o) => ({ id: o.id, name: o.name, kind: "merchant" as const }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [orgs],
  );

  const agentPickOptions = useMemo(
    () =>
      orgs
        .filter((o) => o.type === "agent" || o.type === "agent_sub")
        .map((o) => ({ id: o.id, name: o.name, kind: "agent" as const }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [orgs],
  );

  const visibleCards = useMemo(() => {
    const map = new Map(chartCatalog.map((c) => [c.id, c]));
    return overviewIds.map((id) => map.get(id)).filter(Boolean) as OverviewChartCard[];
  }, [chartCatalog, overviewIds]);

  const applyOverviewIds = useCallback((ids: string[]) => {
    setOverviewIds(ids);
    try {
      localStorage.setItem(OVERVIEW_STORAGE_KEY, JSON.stringify(ids));
    } catch {
      /* ignore quota */
    }
    setAddChartsOpen(false);
  }, []);

  const persistOverviewIds = useCallback((ids: string[]) => {
    setOverviewIds(ids);
    try {
      localStorage.setItem(OVERVIEW_STORAGE_KEY, JSON.stringify(ids));
    } catch {
      /* ignore quota */
    }
  }, []);

  const removeOverviewCard = useCallback(
    (id: string) => {
      persistOverviewIds(overviewIds.filter((x) => x !== id));
    },
    [overviewIds, persistOverviewIds],
  );

  if (loading) {
    return (
      <PlatformPending
        title="Loading platform overview"
        copy="Gathering volume, orders, and service-bill metrics."
      />
    );
  }

  return (
    <div className="dash-page plat-dash">
      <AuthToast message={error} tone="error" onDismiss={dismissError} />
      {isViewer ? (
        <div className="alert-card tone-info">
          <strong>READ-ONLY</strong>
          <p>Viewer role — mutate actions are hidden.</p>
        </div>
      ) : null}

      {topbarSlot
        ? createPortal(
            <div className="plat-period-controls plat-period-controls--topbar" aria-label="Period">
              <div className="plat-period-pills plat-period-pills--topbar" role="group" aria-label="Quick periods">
                {PERIOD_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`plat-period-pill${period === opt.id ? " is-active" : ""}`}
                    onClick={() => onPeriodSelect(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="plat-period-dates plat-period-dates--topbar" aria-label="Date range">
                <label className="plat-period-date">
                  <span className="plat-period-date__label">Start</span>
                  <input
                    type="date"
                    value={startDate}
                    max={endDate || undefined}
                    onChange={(e) => onStartDateChange(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                  />
                </label>
                <span className="plat-period-dates__sep" aria-hidden="true">
                  –
                </span>
                <label className="plat-period-date">
                  <span className="plat-period-date__label">End</span>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => onEndDateChange(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                  />
                </label>
              </div>
            </div>,
            topbarSlot,
          )
        : null}

      <div className="plat-overview-grid">
        <div className="plat-overview-card glass-tone-blue">
          <div className="plat-overview-card__head">
            <h2>Accounts</h2>
            <CardHelp text="Who’s on the platform: totals, who had payment activity, who was quiet, and who is paused." />
          </div>
          <AccountRows title="Merchants" slice={stats.merchants} />
          <AccountRows title="Agents" slice={stats.agents} />
        </div>

        <div className="plat-overview-card glass-tone-emerald">
          <div className="plat-overview-card__head">
            <h2>Grow</h2>
            <CardHelp text={`New merchants, agents, and cashiers added in ${periodLabel}.`} />
          </div>
          <MetricLines
            rows={[
              { label: "Merchants", value: stats.newMerchants },
              { label: "Agents", value: stats.newAgents },
              { label: "Cashiers", value: stats.newCashiers },
            ]}
          />
        </div>

        <div className="plat-overview-card glass-tone-amber">
          <div className="plat-overview-card__head">
            <h2>Invoices</h2>
            <CardHelp text={`Service bills in ${periodLabel}: how many were issued, paid, or are overdue.`} />
          </div>
          <MetricLines
            rows={[
              { label: "Issued", value: stats.invoicesIssued },
              { label: "Paid", value: stats.invoicesPaid },
              { label: "Overdue", value: stats.invoicesOverdue },
            ]}
          />
        </div>

        <section className="plat-fund-rail" aria-label="Funds">
          <div className="plat-fund-rail__eyebrow">
            <span>Funds</span>
            <CardHelp
              text={`Period settled volume / billed fees, and fees collected in ${periodLabel}.`}
            />
          </div>
          <div className="plat-fund-rail__primary">
            <div className="plat-fund-rail__copy">
              <p className="plat-fund-rail__pair-labels">
                <span>Total</span>
                <span aria-hidden>/</span>
                <span>Fees</span>
              </p>
              <span className="plat-fund-rail__hint">
                Settled volume / billed volume fees
              </span>
            </div>
            <p className="plat-fund-rail__pair" aria-label="Total and fees">
              <span className="plat-fund-rail__total">
                <span className="plat-fund-rail__currency" aria-hidden>
                  $
                </span>
                <span className="fund-amount">
                  {stats.volume.toLocaleString(undefined, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}
                </span>
              </span>
              <span className="plat-fund-rail__slash" aria-hidden>
                /
              </span>
              <span className="plat-fund-rail__fees">
                <span className="plat-fund-rail__currency" aria-hidden>
                  $
                </span>
                <span className="fund-amount">
                  {stats.fees.toLocaleString(undefined, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}
                </span>
              </span>
            </p>
          </div>
          <div className="plat-fund-rail__secondary">
            <div className="plat-fund-rail__copy">
              <span className="plat-fund-rail__label">Collected</span>
              <span className="plat-fund-rail__hint">Paid volume fees</span>
            </div>
            <p className="plat-fund-rail__collected">
              <span className="plat-fund-rail__currency" aria-hidden>
                $
              </span>
              <span className="fund-amount">
                {stats.collected.toLocaleString(undefined, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
              </span>
            </p>
          </div>
        </section>
      </div>

      <div className="dash-split">
        <div
          ref={chartPanelRef}
          className="panel dash-chart-panel glass-tone-slate"
        >
          <div className="dash-chart-panel__head">
            <div className="dash-chart-panel__title-row">
              <div className="dash-chart-panel__filters">
                <VolumeScopeToggle
                  scope={volumeScope}
                  selection={volumeSelection}
                  onScopeChange={onVolumeScopeChange}
                />
              </div>
              <div className="dash-chart-panel__title-main">
                <p className="dash-chart-panel__period-total" aria-label="Period total volume">
                  <span className="dash-chart-panel__period-value">
                    {formatUsd(chartPeriodTotal)}
                  </span>
                </p>
              </div>
              <div className="dash-chart-panel__tools">
                <div className="volume-chart__zoom-bar volume-chart__zoom-bar--tools">
                  {volumeZoomed ? (
                    <button
                      type="button"
                      className="volume-chart__zoom-reset"
                      onClick={() => volumeZoomApiRef.current?.reset()}
                    >
                      Reset
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="volume-chart__zoom-btn"
                    aria-label="Zoom out"
                    title="Zoom out"
                    onClick={() => volumeZoomApiRef.current?.zoomOut()}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className="volume-chart__zoom-btn"
                    aria-label="Zoom in"
                    title="Zoom in"
                    onClick={() => volumeZoomApiRef.current?.zoomIn()}
                  >
                    +
                  </button>
                </div>
                <ChartHelpButton label="Volume chart help" />
                <ChartMaximizeButton
                  label="Maximize Volume chart"
                  onClick={() => setVolumeMaximized(true)}
                />
              </div>
            </div>
          </div>
          <VolumeChart
            values={series}
            labels={dayLabels}
            showZoomBar={false}
            onZoomedChange={setVolumeZoomed}
            zoomApiRef={volumeZoomApiRef}
          />
        </div>

        <div
          ref={healthCardRef}
          className="panel glass-tone-emerald plat-health-card"
        >
          <div className="plat-health-pairs">
            <AssetNetworkTables
              compact
              selection={volumeSelection}
              volumeScope={volumeScope}
              onSelect={onVolumeSelect}
            />
          </div>
        </div>
      </div>

      <ChartMaximizeOverlay
        open={volumeMaximized}
        title={chartTitle}
        onClose={() => setVolumeMaximized(false)}
        header={
          <div className="dash-chart-panel__title-row chart-maximize-overlay__title-row">
            <div className="dash-chart-panel__filters">
              <VolumeScopeToggle
                scope={volumeScope}
                selection={volumeSelection}
                onScopeChange={onVolumeScopeChange}
              />
            </div>
            <div className="dash-chart-panel__title-main">
              <p className="dash-chart-panel__period-total" aria-label="Period total volume">
                <span className="dash-chart-panel__period-value">
                  {formatUsd(chartPeriodTotal)}
                </span>
              </p>
            </div>
            <div className="dash-chart-panel__tools">
              <div className="volume-chart__zoom-bar volume-chart__zoom-bar--tools">
                {volumeFsZoomed ? (
                  <button
                    type="button"
                    className="volume-chart__zoom-reset"
                    onClick={() => volumeFsZoomApiRef.current?.reset()}
                  >
                    Reset
                  </button>
                ) : null}
                <button
                  type="button"
                  className="volume-chart__zoom-btn"
                  aria-label="Zoom out"
                  title="Zoom out"
                  onClick={() => volumeFsZoomApiRef.current?.zoomOut()}
                >
                  −
                </button>
                <button
                  type="button"
                  className="volume-chart__zoom-btn"
                  aria-label="Zoom in"
                  title="Zoom in"
                  onClick={() => volumeFsZoomApiRef.current?.zoomIn()}
                >
                  +
                </button>
              </div>
              <ChartHelpButton label="Volume chart help" />
              <button
                type="button"
                className="chart-maximize-overlay__close"
                aria-label="Close fullscreen chart"
                onClick={() => setVolumeMaximized(false)}
              >
                ×
              </button>
            </div>
          </div>
        }
      >
        <VolumeChart
          values={series}
          labels={dayLabels}
          size="fullscreen"
          showZoomBar={false}
          onZoomedChange={setVolumeFsZoomed}
          zoomApiRef={volumeFsZoomApiRef}
        />
      </ChartMaximizeOverlay>

      <OverviewTable
        title="Metrics"
        editMode={editMode}
        onRemoveCard={removeOverviewCard}
        onReorderCards={persistOverviewIds}
        action={
          <>
            <button
              type="button"
              className="overview-charts__btn"
              onClick={() => {
                setEditMode(false);
                setAddChartsOpen(true);
              }}
            >
              + Add
            </button>
            <button
              type="button"
              className={`overview-charts__btn${editMode ? " is-active" : ""}`}
              onClick={() => setEditMode((v) => !v)}
            >
              {editMode ? "Done" : "Edit"}
            </button>
          </>
        }
        cards={visibleCards}
      />

      <AddChartsModal
        open={addChartsOpen}
        platformCards={platformCards}
        merchants={merchantPickOptions}
        agents={agentPickOptions}
        selectedIds={overviewIds}
        resolveOrgCard={resolveOrgCard}
        onClose={() => setAddChartsOpen(false)}
        onApply={applyOverviewIds}
      />
    </div>
  );
}
