import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AssetCode } from "@paymentgate/domain";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  getBillingWalletSettings,
  getPlatformOrgs,
  listAuditLog,
  listServiceBillsPage,
  peekPlatformOrgs,
  peekPlatformServiceBills,
  type AuditLogEntry,
  type ServiceBill,
} from "./api";
import { AssetIcon } from "./cryptoIcons";
import {
  sessionCanIssueServiceBill,
  sessionIsPlatformOwner,
} from "./org";
import { FundAmount } from "./FundAmount";
import type { Session } from "./api";
import { GenerateServiceBillsModal } from "./GenerateServiceBillsModal";
import { IssueServiceBillModal } from "./IssueServiceBillModal";
import {
  formatBillId,
  isActivationServiceBill,
  isOpenActivationServiceBill,
  serviceBillStatusLabel,
  serviceBillStatusTone,
} from "./serviceBillStatus";
import { PagePending } from "./ui/PlatformPending";
import { OrgListPagination } from "./OrgListPagination";
import { platformRoute } from "../shared/portalRouting";
import { OrgBrandMark } from "../shared/OrgBrandMark";
import { isCustomOrgIcon, orgIconGlyph } from "../shared/orgBrand";
import {
  displayServiceBillTxHash,
  formatSlashDate,
} from "../shared/serviceBillPeriod";
import {
  formatViewerDateTime,
  utcMidnightLabel,
} from "../shared/dateTime";
import {
  SortHeader,
  compareDate,
  compareNumber,
  compareText,
  toggleSortState,
  type SortState,
} from "./ui/TableArrange";

type Props = { session: Session };

type StatusFilter =
  | "all"
  | "draft"
  | "unpaid"
  | "issued"
  | "overdue"
  | "paid"
  | "voided"
  | "cancelled"
  | "activation";

type StatusNavItem = {
  id: StatusFilter;
  label: string;
  children?: StatusNavItem[];
};

type SortKey =
  | "billId"
  | "merchant"
  | "billedVolume"
  | "total"
  | "dueDate"
  | "status"
  | "period";

const PAGE_SIZE = 10;
const FETCH_PAGE = 500;

function collectStatusFilterIds(items: StatusNavItem[]): StatusFilter[] {
  const out: StatusFilter[] = [];
  for (const item of items) {
    out.push(item.id);
    if (item.children?.length) {
      out.push(...collectStatusFilterIds(item.children));
    }
  }
  return out;
}

function statusNavContains(
  item: StatusNavItem,
  filter: StatusFilter,
): boolean {
  if (item.id === filter) return true;
  return Boolean(item.children?.some((child) => statusNavContains(child, filter)));
}

function mergeServiceBills(
  prev: ServiceBill[],
  next: ServiceBill[],
): ServiceBill[] {
  const map = new Map(prev.map((b) => [b.id, b]));
  for (const b of next) map.set(b.id, b);
  return [...map.values()];
}

type PeriodId = "today" | "7d" | "1m";

const PERIOD_OPTIONS: { id: PeriodId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7d" },
  { id: "1m", label: "1m" },
];

/** UTC calendar day bounds — matches daily invoice job (00:00 UTC). */
function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
}

function endOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

function toUtcDateInputValue(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseUtcDateInput(value: string, end = false): Date {
  const [y, m, d] = value.split("-").map(Number);
  const year = y ?? 1970;
  const month = (m ?? 1) - 1;
  const day = d ?? 1;
  return end
    ? new Date(Date.UTC(year, month, day, 23, 59, 59, 999))
    : new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
}

function periodWindow(id: PeriodId): { from: Date; to: Date } {
  const now = new Date();
  const to = endOfUtcDay(now);
  let from = startOfUtcDay(now);
  if (id === "7d") {
    from = startOfUtcDay(now);
    from.setUTCDate(from.getUTCDate() - 6);
  } else if (id === "1m") {
    from = startOfUtcDay(now);
    from.setUTCMonth(from.getUTCMonth() - 1);
  }
  return { from, to };
}

/** Bill is in range if due or created on a selected UTC day.
 *  Open unpaid/overdue stay visible outside the window so AR is not hidden. */
function billInDateWindow(
  bill: ServiceBill,
  from: Date,
  to: Date,
): boolean {
  const dueIso = bill.dueAt || `${bill.periodEnd}T12:00:00.000Z`;
  const dueT = Date.parse(dueIso);
  if (Number.isFinite(dueT) && dueT >= from.getTime() && dueT <= to.getTime()) {
    return true;
  }
  const createdT = bill.createdAt ? Date.parse(bill.createdAt) : Number.NaN;
  if (
    Number.isFinite(createdT) &&
    createdT >= from.getTime() &&
    createdT <= to.getTime()
  ) {
    return true;
  }
  return bill.status === "issued" || bill.status === "overdue";
}

const STATUS_NAV: StatusNavItem[] = [
  {
    id: "all",
    label: "All",
    children: [
      { id: "issued", label: "Issued" },
      { id: "overdue", label: "Overdue" },
      { id: "draft", label: "Ready" },
      { id: "activation", label: "New merchant" },
      { id: "paid", label: "Paid" },
      { id: "voided", label: "Voided" },
      { id: "cancelled", label: "Cancelled" },
    ],
  },
];

const STATUS_FILTER_IDS: StatusFilter[] = collectStatusFilterIds(STATUS_NAV);

function formatServiceBillLastAutoRun(entry: AuditLogEntry | null): string {
  if (!entry) return "Last auto run: never";
  const meta = entry.metadata ?? {};
  const when = formatViewerDateTime(entry.createdAt);
  const created = typeof meta.created === "number" ? meta.created : 0;
  return `Last auto run: ${when} · ${created} created`;
}

function orgNameMap(orgs: { id: string; name: string }[]): Map<string, string> {
  return new Map(orgs.map((o) => [o.id, o.name]));
}

function orgIconMap(
  orgs: { id: string; iconKey?: string | null }[],
): Map<string, string | null> {
  return new Map(orgs.map((o) => [o.id, o.iconKey ?? null]));
}

function merchantInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function MerchantBillAvatar({
  name,
  iconKey,
}: {
  name: string;
  iconKey?: string | null;
}) {
  const hasBrand =
    isCustomOrgIcon(iconKey) || Boolean(orgIconGlyph(iconKey));
  if (hasBrand) {
    return (
      <OrgBrandMark
        name={name}
        iconKey={iconKey}
        size={36}
        className="plat-bills__merchant-avatar plat-bills__merchant-avatar--brand"
      />
    );
  }
  return (
    <span className="plat-bills__merchant-avatar" aria-hidden>
      {merchantInitials(name)}
    </span>
  );
}

function matchesStatus(bill: ServiceBill, filter: StatusFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "activation":
      return isOpenActivationServiceBill(bill);
    case "draft":
      return bill.status === "draft";
    case "unpaid":
      return bill.status === "issued" || bill.status === "overdue";
    case "issued":
      return bill.status === "issued";
    case "overdue":
      return bill.status === "overdue";
    case "paid":
      return bill.status === "paid";
    case "voided":
      return bill.status === "voided";
    case "cancelled":
      return bill.status === "cancelled";
    default:
      return true;
  }
}

type BillKpiAccent = "warn" | "danger" | "blue" | "violet" | "ok" | "slate";

const STATUS_TAB_ACCENT: Partial<Record<StatusFilter, BillKpiAccent>> = {
  all: "slate",
  issued: "warn",
  unpaid: "warn",
  overdue: "danger",
  draft: "blue",
  activation: "violet",
  paid: "ok",
  voided: "slate",
  cancelled: "slate",
};

function BillKpiIcon({
  accent,
  size = 28,
  className,
}: {
  accent: BillKpiAccent;
  size?: number;
  className?: string;
}) {
  const stroke = {
    className,
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  const filled = {
    className,
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "currentColor" as const,
    "aria-hidden": true as const,
  };
  if (accent === "danger") {
    return (
      <svg {...stroke}>
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
    );
  }
  if (accent === "warn") {
    return (
      <svg {...stroke}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5" />
        <path d="M12 16h.01" />
      </svg>
    );
  }
  if (accent === "ok") {
    return (
      <svg {...filled}>
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1.05 13.55-3.55-3.55 1.45-1.45 2.1 2.1 4.55-4.55 1.45 1.45-6 6Z" />
      </svg>
    );
  }
  if (accent === "violet") {
    return (
      <svg {...filled}>
        <path d="M21.5 6.2v5.6h-1.9V9.45l-6.55 6.55-3.4-3.4-5.9 5.9-1.35-1.35 7.25-7.25 3.4 3.4 5.2-5.2H15.9V6.2h5.6Z" />
      </svg>
    );
  }
  if (accent === "blue") {
    return (
      <svg {...stroke}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M9 13h6" />
        <path d="M9 17h4" />
      </svg>
    );
  }
  return (
    <svg {...filled}>
      <path d="M12 2.8 20.2 7.4v9.2L12 21.2 3.8 16.6V7.4L12 2.8Zm0 2.2L5.7 8.55 12 12.1l6.3-3.55L12 5ZM5.7 10.65v5.2L11.05 19V13.8L5.7 10.65Zm7.35 3.15V19l5.35-3.15v-5.2L13.05 13.8Z" />
    </svg>
  );
}

function StatusTabIcon({ id }: { id: StatusFilter }) {
  const className = "plat-bills__status-icon";
  const size = 15;
  if (id === "voided") {
    return (
      <svg
        className={className}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M5.5 5.5 18.5 18.5" />
      </svg>
    );
  }
  if (id === "cancelled") {
    return (
      <svg
        className={className}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M15 9 9 15" />
        <path d="M9 9l6 6" />
      </svg>
    );
  }
  return (
    <BillKpiIcon
      accent={STATUS_TAB_ACCENT[id] ?? "slate"}
      size={size}
      className={className}
    />
  );
}

const STATUS_TREE_PAD = 6;
const STATUS_TREE_GUIDE = 16;
const STATUS_TREE_CHEVRON_HALF = 10;

function statusTreeCaretX(depth: number): number {
  return STATUS_TREE_PAD + depth * STATUS_TREE_GUIDE + STATUS_TREE_CHEVRON_HALF;
}

function StatusNavNodes({
  items,
  depth,
  ancestors = [],
  statusFilter,
  statusCounts,
  onSelect,
}: {
  items: StatusNavItem[];
  depth: number;
  /** Continuing vertical rails for ancestor levels (length === max(0, depth - 1)). */
  ancestors?: boolean[];
  statusFilter: StatusFilter;
  statusCounts: Record<StatusFilter, number>;
  onSelect: (id: StatusFilter) => void;
}) {
  return (
    <>
      {items.map((item, index) => {
        const children = item.children;
        const hasChildren = Boolean(children?.length);
        const count = statusCounts[item.id];
        const active = statusFilter === item.id;
        const descendantActive = Boolean(
          children?.some((child) => statusNavContains(child, statusFilter)),
        );
        const branchOpen = hasChildren;
        const isLast = index === items.length - 1;
        const caretX = statusTreeCaretX(depth);
        const parentDepth = depth - 1;
        const parentRailX =
          depth > 0
            ? statusTreeCaretX(parentDepth)
            : STATUS_TREE_PAD + STATUS_TREE_CHEVRON_HALF;
        const forkGuideStart =
          STATUS_TREE_PAD + Math.max(0, parentDepth) * STATUS_TREE_GUIDE;
        const forkLeft =
          depth > 0 ? parentRailX - forkGuideStart : STATUS_TREE_CHEVRON_HALF;
        const forkWidth = depth > 0 ? caretX - parentRailX : 0;

        return (
          <div
            key={item.id}
            className={`b3-accounts__node${branchOpen ? " is-open" : ""}`}
            role="treeitem"
            aria-expanded={hasChildren ? branchOpen : undefined}
            aria-selected={active}
          >
            <button
              type="button"
              role="tab"
              className={`b3-accounts__row plat-bills__status-row${
                active ? " is-selected" : ""
              }${descendantActive ? " is-parent-active" : ""}`}
              style={
                {
                  ["--tree-stem-x"]: `${caretX}px`,
                  ["--tree-guide-w"]: `${STATUS_TREE_GUIDE}px`,
                  ["--tree-fork-left"]: `${forkLeft}px`,
                  ["--tree-fork-width"]: `${forkWidth}px`,
                } as CSSProperties
              }
              aria-selected={active}
              onClick={() => onSelect(item.id)}
            >
              {depth > 0 ? (
                <span className="b3-accounts__guides" aria-hidden>
                  {ancestors.map((show, guideIndex) => (
                    <span
                      key={`a-${guideIndex}`}
                      className={`b3-accounts__guide${show ? " is-line" : ""}`}
                    />
                  ))}
                  <span
                    className={`b3-accounts__guide is-fork${
                      isLast ? " is-last" : ""
                    }`}
                  />
                </span>
              ) : null}
              {hasChildren ? (
                <span className="b3-accounts__chevron" aria-hidden>
                  <span
                    className={`b3-accounts__caret${
                      branchOpen ? " is-open" : ""
                    }`}
                  />
                </span>
              ) : (
                <span
                  className="b3-accounts__chevron b3-accounts__chevron--spacer"
                  aria-hidden
                />
              )}
              <span className="plat-bills__status-badge" aria-hidden>
                <StatusTabIcon id={item.id} />
              </span>
              <span className="b3-accounts__name">
                <span className="b3-accounts__name-text">{item.label}</span>
              </span>
              <span className="plat-bills__status-item-count">{count}</span>
            </button>
            {branchOpen && children?.length ? (
              <div
                className="b3-accounts__children"
                role="group"
                aria-label={item.label}
                style={
                  {
                    ["--tree-line-x"]: `${caretX}px`,
                  } as CSSProperties
                }
              >
                <StatusNavNodes
                  items={children}
                  depth={depth + 1}
                  ancestors={depth > 0 ? [...ancestors, !isLast] : []}
                  statusFilter={statusFilter}
                  statusCounts={statusCounts}
                  onSelect={onSelect}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

function BillKpiCard({
  label,
  value,
  meta,
  filter,
  accent,
  onView,
}: {
  label: string;
  value: ReactNode;
  meta: string;
  filter: StatusFilter;
  accent: BillKpiAccent;
  onView: (filter: StatusFilter) => void;
}) {
  return (
    <div className={`plat-bills__kpi-card is-${accent}`}>
      <div className="plat-bills__kpi-head">
        <span className="plat-bills__kpi-icon" aria-hidden>
          <BillKpiIcon accent={accent} />
        </span>
        <p className="plat-bills__kpi-label">{label}</p>
        <button
          type="button"
          className="plat-bills__kpi-view"
          onClick={() => onView(filter)}
        >
          <span className="plat-bills__kpi-view-text">View</span>
          <span className="plat-bills__kpi-view-arrow" aria-hidden>
            →
          </span>
        </button>
      </div>
      <p className="plat-bills__kpi-value">{value}</p>
      <p className="plat-bills__kpi-meta">{meta}</p>
    </div>
  );
}

/** Horizontal snap carousel — peeks next cards; arrows only when overflow. */
function BillKpiCarousel({ children }: { children: ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [fits, setFits] = useState(false);
  const [active, setActive] = useState(0);
  const [dotCount, setDotCount] = useState(1);

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const overflow = scrollWidth > clientWidth + 2;
    setFits(!overflow);
    setCanPrev(overflow && scrollLeft > 4);
    setCanNext(overflow && scrollLeft + clientWidth < scrollWidth - 4);
    const cards = el.querySelectorAll(".plat-bills__kpi-card");
    if (!overflow) {
      setDotCount(1);
      setActive(0);
      return;
    }
    const cardW =
      (cards[0] as HTMLElement | undefined)?.offsetWidth ?? clientWidth;
    const gap = 12;
    const step = cardW + gap;
    const visible = Math.max(1, Math.floor((clientWidth + 4) / step));
    const pages = Math.max(1, cards.length - visible + 1);
    setDotCount(pages);
    setActive(
      Math.min(
        pages - 1,
        Math.max(0, Math.round(scrollLeft / Math.max(step, 1))),
      ),
    );
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const ro = new ResizeObserver(() => {
      // Recalc after flex layout settles.
      requestAnimationFrame(sync);
    });
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", sync);
      ro.disconnect();
    };
  }, [sync, children]);

  const scrollByPage = useCallback((dir: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector(".plat-bills__kpi-card") as HTMLElement | null;
    const gap = 12;
    const cardW = card?.offsetWidth ?? el.clientWidth * 0.4;
    const visible = Math.max(1, Math.floor(el.clientWidth / (cardW + gap)));
    el.scrollBy({ left: dir * (cardW + gap) * visible, behavior: "smooth" });
  }, []);

  const scrollToDot = useCallback((index: number) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector(".plat-bills__kpi-card") as HTMLElement | null;
    const gap = 12;
    const step = (card?.offsetWidth ?? el.clientWidth) + gap;
    el.scrollTo({ left: index * step, behavior: "smooth" });
  }, []);

  return (
    <div
      className={`plat-bills__kpi-carousel${fits ? " is-fit" : ""}`}
    >
      {!fits ? (
        <button
          type="button"
          className="plat-bills__kpi-nav is-prev"
          aria-label="Previous metrics"
          disabled={!canPrev}
          onClick={() => scrollByPage(-1)}
        >
          ‹
        </button>
      ) : null}
      <div
        ref={trackRef}
        className="plat-bills__kpi"
        role="group"
        aria-label="Service bills summary"
      >
        {children}
      </div>
      {!fits ? (
        <button
          type="button"
          className="plat-bills__kpi-nav is-next"
          aria-label="Next metrics"
          disabled={!canNext}
          onClick={() => scrollByPage(1)}
        >
          ›
        </button>
      ) : null}
      {!fits && dotCount > 1 ? (
        <div className="plat-bills__kpi-dots" role="tablist" aria-label="Metric pages">
          {Array.from({ length: dotCount }, (_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={active === i}
              aria-label={`Show metrics page ${i + 1}`}
              className={`plat-bills__kpi-dot${active === i ? " is-active" : ""}`}
              onClick={() => scrollToDot(i)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ServiceBillsListPage({ session }: Props) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canIssue = useMemo(() => sessionCanIssueServiceBill(session), [session]);
  const isPlatformOwner = useMemo(
    () => sessionIsPlatformOwner(session),
    [session],
  );
  const [issueOpen, setIssueOpen] = useState(
    () => canIssue && searchParams.get("issue") === "1",
  );
  const [generateOpen, setGenerateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const initialWindow = useMemo(() => periodWindow("1m"), []);
  const [period, setPeriod] = useState<PeriodId | "custom">("1m");
  const [startDate, setStartDate] = useState(() =>
    toUtcDateInputValue(initialWindow.from),
  );
  const [endDate, setEndDate] = useState(() =>
    toUtcDateInputValue(initialWindow.to),
  );
  const [items, setItems] = useState<ServiceBill[]>(
    () => peekPlatformServiceBills() ?? [],
  );
  const [listTotal, setListTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [orgNames, setOrgNames] = useState<Map<string, string>>(() => {
    const cached = peekPlatformOrgs();
    return cached ? orgNameMap(cached) : new Map();
  });
  const [orgIcons, setOrgIcons] = useState<Map<string, string | null>>(() => {
    const cached = peekPlatformOrgs();
    return cached ? orgIconMap(cached) : new Map();
  });
  const [billMerchants, setBillMerchants] = useState<
    { id: string; name: string; createdAt?: string }[]
  >(() => {
    const cached = peekPlatformOrgs();
    return (cached ?? [])
      .filter((o) => o.type === "merchant" && o.status !== "paused")
      .map((o) => ({ id: o.id, name: o.name, createdAt: o.createdAt }));
  });
  /** Platform remittance destination (Rx) from billing wallet settings. */
  const [rxAddress, setRxAddress] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState<SortKey>>({
    key: "dueDate",
    dir: "desc",
  });
  const [loading, setLoading] = useState(() => peekPlatformServiceBills() == null);
  const [error, setError] = useState<string | null>(null);
  const [lastAutoRun, setLastAutoRun] = useState<AuditLogEntry | null>(null);
  const [topbarLeadingSlot, setTopbarLeadingSlot] = useState<HTMLElement | null>(
    null,
  );
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
  const moreMenuRef = useRef<HTMLDetailsElement>(null);
  const searchInputId = useId();

  const dismissToast = useCallback(() => setError(null), []);

  const loadLastAutoRun = useCallback(async () => {
    try {
      const items = await listAuditLog({
        action: "service_bill_daily_auto",
        limit: 1,
      });
      setLastAutoRun(items[0] ?? null);
    } catch {
      /* optional ops banner */
    }
  }, []);

  const closeIssueModal = useCallback(() => {
    setIssueOpen(false);
    if (searchParams.get("issue") === "1") {
      const next = new URLSearchParams(searchParams);
      next.delete("issue");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (canIssue && searchParams.get("issue") === "1") {
      setIssueOpen(true);
    }
  }, [canIssue, searchParams]);

  useLayoutEffect(() => {
    setTopbarLeadingSlot(document.getElementById("platform-topbar-leading"));
    setTopbarSlot(document.getElementById("platform-topbar-center"));
  }, []);

  const load = useCallback(async () => {
    const canUseCache = peekPlatformServiceBills() != null;
    if (!canUseCache) setLoading(true);
    setError(null);
    try {
      const [pageResult, orgs, billing] = await Promise.all([
        listServiceBillsPage({ limit: FETCH_PAGE, offset: 0 }),
        getPlatformOrgs(),
        getBillingWalletSettings().catch(() => null),
      ]);
      setItems(pageResult.items);
      setListTotal(pageResult.total);
      setOrgNames(orgNameMap(orgs));
      setOrgIcons(orgIconMap(orgs));
      setBillMerchants(
        orgs
          .filter((o) => o.type === "merchant" && o.status !== "paused")
          .map((o) => ({ id: o.id, name: o.name, createdAt: o.createdAt })),
      );
      setRxAddress(billing?.payTo?.trim() || null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code === "rate_limited"
            ? "Too many requests — wait a moment and retry."
            : err.message
          : "Failed to load service bills",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || items.length >= listTotal) return;
    setLoadingMore(true);
    setError(null);
    try {
      const pageResult = await listServiceBillsPage({
        limit: FETCH_PAGE,
        offset: items.length,
      });
      setItems((prev) => mergeServiceBills(prev, pageResult.items));
      setListTotal(pageResult.total);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load more service bills",
      );
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, items.length, listTotal]);

  const hasMoreServer = items.length < listTotal;

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadLastAutoRun();
  }, [loadLastAutoRun]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const root = moreMenuRef.current;
      if (!root?.open) return;
      if (e.target instanceof Node && root.contains(e.target)) return;
      root.open = false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const root = moreMenuRef.current;
      if (!root?.open) return;
      root.open = false;
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const onPeriodSelect = useCallback((id: PeriodId) => {
    const { from, to } = periodWindow(id);
    setPeriod(id);
    setStartDate(toUtcDateInputValue(from));
    setEndDate(toUtcDateInputValue(to));
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

  const dateFrom = useMemo(
    () => (startDate ? parseUtcDateInput(startDate, false) : null),
    [startDate],
  );
  const dateTo = useMemo(
    () => (endDate ? parseUtcDateInput(endDate, true) : null),
    [endDate],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = items.filter((bill) => {
      if (!matchesStatus(bill, statusFilter)) return false;
      if (
        dateFrom &&
        dateTo &&
        !billInDateWindow(bill, dateFrom, dateTo)
      ) {
        return false;
      }
      if (!q) return true;
      const merchant = (orgNames.get(bill.orgId) ?? bill.orgId).toLowerCase();
      const billId = formatBillId(bill.id).toLowerCase();
      const txHash = displayServiceBillTxHash(bill.paymentReference).toLowerCase();
      const rawRef = (bill.paymentReference ?? "").toLowerCase();
      const rx = (bill.rxAddress ?? rxAddress ?? "").toLowerCase();
      const tx = (bill.txAddress ?? "").toLowerCase();
      return (
        billId.includes(q) ||
        bill.id.toLowerCase().includes(q) ||
        merchant.includes(q) ||
        (txHash.length > 0 && txHash.includes(q)) ||
        (rawRef.length > 0 && rawRef.includes(q)) ||
        (rx.length > 0 && rx.includes(q)) ||
        (tx.length > 0 && tx.includes(q))
      );
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    const merchantOf = (bill: ServiceBill) =>
      orgNames.get(bill.orgId) ?? bill.orgId;
    return [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sort.key) {
        case "merchant":
          cmp = compareText(merchantOf(a), merchantOf(b));
          break;
        case "billedVolume":
          cmp = compareNumber(
            Number(a.billedVolumeUsd ?? 0),
            Number(b.billedVolumeUsd ?? 0),
          );
          break;
        case "total":
          cmp = compareNumber(Number(a.totalAmount), Number(b.totalAmount));
          break;
        case "status":
          cmp = compareText(
            serviceBillStatusLabel(a.status),
            serviceBillStatusLabel(b.status),
          );
          break;
        case "period":
          cmp = compareText(a.periodStart, b.periodStart);
          break;
        case "billId":
          cmp = compareText(formatBillId(a.id), formatBillId(b.id));
          break;
        case "dueDate":
        default:
          cmp = compareDate(a.dueAt, b.dueAt);
          break;
      }
      if (cmp !== 0) return dir * cmp;
      return dir * compareDate(a.dueAt, b.dueAt);
    });
  }, [items, orgNames, query, statusFilter, dateFrom, dateTo, sort, rxAddress]);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, startDate, endDate, sort]);

  const onSort = useCallback((key: SortKey) => {
    setSort((prev) =>
      toggleSortState(
        prev,
        key,
        key === "dueDate" || key === "total" || key === "period"
          ? "desc"
          : "asc",
      ),
    );
  }, []);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  /** Bills whose due date falls in the selected period (Today / 7d / 1m / custom). */
  const inPeriod = useMemo(() => {
    if (!dateFrom || !dateTo) return items;
    return items.filter((b) => billInDateWindow(b, dateFrom, dateTo));
  }, [items, dateFrom, dateTo]);

  const issuedCount = useMemo(
    () => inPeriod.filter((b) => b.status === "issued").length,
    [inPeriod],
  );
  const overdueCount = useMemo(
    () => inPeriod.filter((b) => b.status === "overdue").length,
    [inPeriod],
  );
  const draftCount = useMemo(
    () => inPeriod.filter((b) => b.status === "draft").length,
    [inPeriod],
  );
  const openActivationCount = useMemo(
    () => inPeriod.filter((b) => isOpenActivationServiceBill(b)).length,
    [inPeriod],
  );
  const paidCount = useMemo(
    () => inPeriod.filter((b) => b.status === "paid").length,
    [inPeriod],
  );
  const voidedCount = useMemo(
    () => inPeriod.filter((b) => b.status === "voided").length,
    [inPeriod],
  );
  const cancelledCount = useMemo(
    () => inPeriod.filter((b) => b.status === "cancelled").length,
    [inPeriod],
  );
  const issuedArUsd = useMemo(() => {
    return inPeriod
      .filter((b) => b.status === "issued")
      .reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);
  }, [inPeriod]);
  const overdueArUsd = useMemo(() => {
    return inPeriod
      .filter((b) => b.status === "overdue")
      .reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);
  }, [inPeriod]);
  const paidUsd = useMemo(() => {
    return inPeriod
      .filter((b) => b.status === "paid")
      .reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);
  }, [inPeriod]);

  const onViewStatus = useCallback((filter: StatusFilter) => {
    setStatusFilter(filter);
  }, []);

  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(
      STATUS_FILTER_IDS.map((id) => [id, id === "all" ? inPeriod.length : 0]),
    ) as Record<StatusFilter, number>;
    for (const bill of inPeriod) {
      for (const id of STATUS_FILTER_IDS) {
        if (id === "all") continue;
        if (matchesStatus(bill, id)) counts[id] += 1;
      }
    }
    return counts;
  }, [inPeriod]);

  return (
    <div className="plat-bills">
      <AuthToast message={error} tone="error" onDismiss={dismissToast} />

      <div className="plat-bills__period-bar">
        <div className="plat-bills__intro">
          <span className="plat-bills__intro-icon" aria-hidden>
            <svg
              viewBox="0 0 24 24"
              width="36"
              height="36"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
              <path d="M9 13h6" />
              <path d="M9 17h6" />
              <path d="M9 9h2" />
            </svg>
          </span>
          <div className="plat-bills__intro-copy">
            <h1 className="plat-bills__intro-title">Service Bills</h1>
            <p className="plat-bills__intro-sub">
              Manage merchant invoices and activation fees.
            </p>
          </div>
        </div>
        <div className="plat-bills__period-tools">
          <div
            className="pg-dash__period"
            aria-label="Due / created period (UTC calendar)"
          >
            <span className="pg-dash__period-tz" title="Ops filters use UTC calendar days">
              UTC
            </span>
            <div
              className="pg-dash__period-pills"
              role="group"
              aria-label="Quick periods (UTC)"
            >
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`pg-dash__period-pill${
                    period === opt.id ? " is-active" : ""
                  }`}
                  title={
                    opt.id === "today"
                      ? `UTC calendar day — matches daily invoice job at ${utcMidnightLabel()}`
                      : `${opt.label} in UTC`
                  }
                  onClick={() => onPeriodSelect(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="pg-dash__period-dates" aria-label="Date range">
              <label className="pg-dash__period-date">
                <span className="sr-only">Start</span>
                <input
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(e) => onStartDateChange(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                />
              </label>
              <span className="pg-dash__period-sep" aria-hidden>
                –
              </span>
              <label className="pg-dash__period-date">
                <span className="sr-only">End</span>
                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => onEndDateChange(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                />
              </label>
            </div>
            <button
              type="button"
              className="pg-dash__period-refresh"
              onClick={() => void load()}
              disabled={loading}
              aria-label="Refresh service bills"
              title="Refresh"
            >
              {loading ? "…" : "↻"}
            </button>
          </div>
          {canIssue ? (
            <details ref={moreMenuRef} className="plat-bills__more">
              <summary className="btn-secondary plat-bills__action-btn plat-bills__more-summary">
                More
                <svg
                  className="plat-bills__more-chevron"
                  viewBox="0 0 12 12"
                  width="12"
                  height="12"
                  aria-hidden
                >
                  <path
                    d="M2.75 4.5L6 7.75L9.25 4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.35"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </summary>
              <div className="plat-bills__more-menu" role="menu">
                {isPlatformOwner ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="plat-bills__more-item"
                    onClick={(e) => {
                      const root = (e.currentTarget as HTMLElement).closest(
                        "details",
                      );
                      if (root instanceof HTMLDetailsElement) root.open = false;
                      setGenerateOpen(true);
                    }}
                  >
                    <svg
                      className="plat-bills__more-item-icon"
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      aria-hidden
                    >
                      <path
                        d="M3 12a9 9 0 1 0 3-6.7"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <path
                        d="M3 4v5h5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Backfill
                  </button>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  className="plat-bills__more-item"
                  onClick={(e) => {
                    const root = (e.currentTarget as HTMLElement).closest(
                      "details",
                    );
                    if (root instanceof HTMLDetailsElement) root.open = false;
                    setIssueOpen(true);
                  }}
                >
                  <svg
                    className="plat-bills__more-item-icon"
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    aria-hidden
                  >
                    <path
                      d="M12 3v18M7 8.5h7.5a2.5 2.5 0 0 1 0 5H9.5a2.5 2.5 0 0 0 0 5H17"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Charge
                </button>
              </div>
            </details>
          ) : null}
        </div>
      </div>

      <BillKpiCarousel>
        <BillKpiCard
          accent="warn"
          label="Issued"
          value={<FundAmount amount={issuedArUsd.toFixed(2)} />}
          meta={
            issuedCount === 1 ? "1 issued bill" : `${issuedCount} issued bills`
          }
          filter="issued"
          onView={onViewStatus}
        />
        <BillKpiCard
          accent="danger"
          label="Overdue"
          value={<FundAmount amount={overdueArUsd.toFixed(2)} />}
          meta={
            overdueCount === 1
              ? "1 bill overdue"
              : `${overdueCount} bills overdue`
          }
          filter="overdue"
          onView={onViewStatus}
        />
        <BillKpiCard
          accent="blue"
          label="Ready"
          value={draftCount}
          meta={
            draftCount > 0 ? "Confirm & send" : "No drafts waiting"
          }
          filter="draft"
          onView={onViewStatus}
        />
        <BillKpiCard
          accent="violet"
          label="New merchant"
          value={openActivationCount}
          meta="Account activation Fee"
          filter="activation"
          onView={onViewStatus}
        />
        <BillKpiCard
          accent="ok"
          label="Paid"
          value={<FundAmount amount={paidUsd.toFixed(2)} />}
          meta={paidCount === 1 ? "1 paid bill" : `${paidCount} paid bills`}
          filter="paid"
          onView={onViewStatus}
        />
        <BillKpiCard
          accent="slate"
          label="Voided"
          value={voidedCount}
          meta={
            voidedCount === 1 ? "1 voided bill" : `${voidedCount} voided bills`
          }
          filter="voided"
          onView={onViewStatus}
        />
        <BillKpiCard
          accent="slate"
          label="Cancelled"
          value={cancelledCount}
          meta={
            cancelledCount === 1
              ? "1 cancelled bill"
              : `${cancelledCount} cancelled bills`
          }
          filter="cancelled"
          onView={onViewStatus}
        />
      </BillKpiCarousel>

      {topbarLeadingSlot
        ? createPortal(
            <span className="plat-topbar-mark" title="Service bills">
              <AssetIcon asset={AssetCode.USDT} />
            </span>,
            topbarLeadingSlot,
          )
        : null}

      {topbarSlot
        ? createPortal(
            <label className="topbar-search" htmlFor={searchInputId}>
              <svg
                className="topbar-search__icon"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
              <input
                id={searchInputId}
                className="topbar-search__input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search merchants or bill ID..."
                aria-label="Search merchants or bill ID"
                autoComplete="off"
                spellCheck={false}
              />
            </label>,
            topbarSlot,
          )
        : null}

      <div className="plat-bills__panel">
        <aside className="plat-bills__status-rail" aria-label="Bill status">
          <p className="plat-bills__status-rail-title">Bill status</p>
          <nav
            className="plat-bills__status-nav"
            role="tree"
            aria-label="Status filter"
          >
            <StatusNavNodes
              items={STATUS_NAV}
              depth={0}
              statusFilter={statusFilter}
              statusCounts={statusCounts}
              onSelect={setStatusFilter}
            />
          </nav>
        </aside>

        <div className="plat-bills__main">
          <div className="plat-bills__table-wrap">
            <div className="plat-bills__table-scroll">
            {loading ? <PagePending /> : null}
            {!loading && filtered.length === 0 ? (
              <p className="plat-bills__empty">
                {query.trim()
                  ? "No service bills match that bill ID, merchant, Tx hash, or Rx address."
                  : items.length === 0
                    ? "No service bills yet. Recurring invoices appear automatically after merchants activate and each billing cycle runs."
                    : statusFilter !== "all"
                      ? "No service bills for the selected status in this date range."
                      : "No service bills in this date range."}
              </p>
            ) : null}
            {!loading && filtered.length > 0 ? (
              <table className="plat-bills__table">
                <thead>
                  <tr>
                    <th className="plat-bills__th-merchant">
                      <SortHeader
                        label="Merchant"
                        sortKey="merchant"
                        sort={sort}
                        onSort={onSort}
                      />
                    </th>
                    <th>
                      <SortHeader
                        label="Amount"
                        sortKey="total"
                        sort={sort}
                        onSort={onSort}
                      />
                    </th>
                    <th>
                      <SortHeader
                        label="Billed volume"
                        sortKey="billedVolume"
                        sort={sort}
                        onSort={onSort}
                      />
                    </th>
                    <th>
                      <SortHeader
                        label="Billing period"
                        sortKey="period"
                        sort={sort}
                        onSort={onSort}
                      />
                    </th>
                    <th>
                      <SortHeader
                        label="Due date"
                        sortKey="dueDate"
                        sort={sort}
                        onSort={onSort}
                      />
                    </th>
                    <th>
                      <SortHeader
                        label="Status"
                        sortKey="status"
                        sort={sort}
                        onSort={onSort}
                      />
                    </th>
                    <th className="plat-bills__th-actions">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((bill, index) => {
                    const overdue = bill.status === "overdue";
                    const activation = isActivationServiceBill(bill);
                    const openActivation = isOpenActivationServiceBill(bill);
                    const href = platformRoute(`service-bills/${bill.id}`);
                    const merchantName = orgNames.get(bill.orgId) ?? bill.orgId;
                    const merchantIcon = orgIcons.get(bill.orgId) ?? null;
                    return (
                      <tr
                        key={bill.id}
                        className={`plat-bills__row${
                          openActivation ? " is-activation-open" : ""
                        }`}
                        style={{
                          animationDelay: `${Math.min(index, 24) * 40}ms`,
                        }}
                        tabIndex={0}
                        role="link"
                        aria-label={`Open bill ${formatBillId(bill.id)}`}
                        onClick={(e) => {
                          if (
                            (e.target as HTMLElement).closest(
                              "a, button, .chain-value, summary, details",
                            )
                          ) {
                            return;
                          }
                          navigate(href);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            navigate(href);
                          }
                        }}
                      >
                        <td className="plat-bills__merchant">
                          <span className="plat-bills__merchant-cell">
                            <MerchantBillAvatar
                              name={merchantName}
                              iconKey={merchantIcon}
                            />
                            <span className="plat-bills__merchant-meta">
                              <Link
                                className="plat-bills__merchant-name"
                                to={platformRoute(`merchants/${bill.orgId}`)}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {merchantName}
                              </Link>
                              <Link
                                className="plat-bills__id"
                                to={href}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {formatBillId(bill.id)}
                              </Link>
                            </span>
                          </span>
                        </td>
                        <td className="plat-bills__amount-cell">
                          <span className="plat-bills__amount plat-bills__amount--total">
                            <FundAmount amount={bill.totalAmount} />
                          </span>
                          <span className="plat-bills__fee-parts">
                            <FundAmount amount={bill.subscriptionAmount} />
                            {" + "}
                            <FundAmount amount={bill.volumeFeeAmount} />
                          </span>
                        </td>
                        <td className="plat-bills__amount plat-bills__amount--base">
                          <FundAmount amount={bill.billedVolumeUsd ?? "0.00"} />
                        </td>
                        <td className="plat-bills__created">
                          {activation ? (
                            <span>Activation fee</span>
                          ) : bill.periodEnd?.trim() &&
                            bill.periodEnd.trim() !==
                              bill.periodStart?.trim() ? (
                            <span className="plat-bills__period">
                              <span className="plat-bills__period-line">
                                {formatSlashDate(bill.periodStart)}
                                <span
                                  className="plat-bills__period-sep"
                                  aria-hidden
                                >
                                  {" "}
                                  –
                                </span>
                              </span>
                              <span className="plat-bills__period-end">
                                {formatSlashDate(bill.periodEnd)}
                              </span>
                            </span>
                          ) : (
                            formatSlashDate(bill.periodStart)
                          )}
                        </td>
                        <td
                          className={
                            overdue
                              ? "plat-bills__due is-overdue"
                              : "plat-bills__due"
                          }
                        >
                          {formatSlashDate(bill.dueAt)}
                        </td>
                        <td className="plat-bills__status-cell">
                          <span className="plat-bills__status-row">
                            <span
                              className={`plat-bills__badge tone-${serviceBillStatusTone(bill.status)}${
                                overdue ? " is-pulse" : ""
                              }`}
                            >
                              {serviceBillStatusLabel(bill.status)}
                            </span>
                            {activation ? (
                              <Link
                                className="plat-bills__kind-chip is-action"
                                to={href}
                                onClick={(e) => e.stopPropagation()}
                              >
                                Activation
                              </Link>
                            ) : null}
                          </span>
                        </td>
                        <td className="plat-bills__td-actions">
                          <Link
                            className="plat-bills__row-more"
                            to={href}
                            aria-label={`Open bill ${formatBillId(bill.id)}`}
                            title="Open bill"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <svg
                              viewBox="0 0 16 16"
                              width="16"
                              height="16"
                              fill="currentColor"
                              aria-hidden
                            >
                              <circle cx="8" cy="3.5" r="1.35" />
                              <circle cx="8" cy="8" r="1.35" />
                              <circle cx="8" cy="12.5" r="1.35" />
                            </svg>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
            </div>
            {!loading && filtered.length > 0 ? (
              <OrgListPagination
                page={page}
                pageCount={pageCount}
                total={filtered.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            ) : null}
            {hasMoreServer ? (
              <div className="plat-bills__load-more">
                <p className="muted">
                  Loaded {items.length} of {listTotal}
                </p>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="plat-bills__foot">
        <p className="muted plat-bills__schedule-note" role="note">
          Prepared daily at <strong>{utcMidnightLabel()}</strong>.{" "}
          <span className="plat-bills__auto-run" role="status">
            {formatServiceBillLastAutoRun(lastAutoRun)}
          </span>
        </p>
      </div>

      {canIssue ? (
        <IssueServiceBillModal
          open={issueOpen}
          onClose={closeIssueModal}
          onIssued={() => void load()}
        />
      ) : null}
      {isPlatformOwner ? (
        <GenerateServiceBillsModal
          open={generateOpen}
          orgNames={orgNames}
          merchants={billMerchants}
          onClose={() => setGenerateOpen(false)}
          onGenerated={() => void load()}
        />
      ) : null}
    </div>
  );
}
