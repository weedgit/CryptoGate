import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  listPlatformOrgMemberEmails,
  setOrgStatus,
  type OrgAccount,
  type ServiceBill,
  type Session,
} from "./api";
import { AgentDetailCard } from "./AgentDetailCard";
import { MerchantDetailCard } from "./MerchantDetailCard";
import { merchantOrgIdsInAgentSubtree } from "./agentSubtree";
import { orgTypeLabel, sessionCanManagePlatform, sessionIsPlatformViewerOnly } from "./org";
import { withReturnTo } from "./platformNav";
import {
  getPlatformOrgs,
  peekPlatformOrgs,
  PLATFORM_ORGS_UPDATED_EVENT,
  refreshPlatformOrgList,
  removePlatformOrgFromList,
} from "./platformOrgList";
import { getPlatformServiceBills, peekPlatformServiceBills } from "./platformServiceBillsList";
import { serviceBillStatusLabel } from "./serviceBillStatus";
import { SuspendOrgModal } from "./ui/SuspendOrgModal";
import { OrgDeleteConfirmModal } from "./ui/OrgDeleteConfirmModal";
import { useOrgDeleteModal } from "./useOrgDeleteModal";
import { PagePending } from "./ui/PlatformPending";
import { STRUCTURE_LABELS } from "./merchantSubtree";
import {
  DEFAULT_AGENT_COMMISSION_PERCENT,
  formatOnboardDate,
  mergeCommissionHistory,
  resolveAgentPayoutStatus,
  type AgentPayoutStatus,
} from "./orgDetailSeeds";
import {
  buildPlatformOrgForest,
  childTypeCounts,
  collectTreeNodeIds,
  countTreeNodes,
  defaultExpandedIds,
  expandedIdsForSelectedBranch,
  filterPlatformOrgForest,
  agentsForestRoots,
  merchantsForestRoots,
  agentDepthOfNode,
  orgAddChildHref,
  orgBreadcrumbPath,
  orgCanAddChild,
  orgDetailHref,
  orgDetailLabel,
  visibleTreeNodeIds,
  type OrgTreeFilter,
  type PlatformOrgTreeNode,
} from "./platformOrgTree";
import { orgOwnerEmailMapFromBulkRows } from "../shared/registeredEmails";
import { useOrgTreeOpsExtras } from "./useOrgTreeOpsExtras";
import { platformRoute } from "../shared/portalRouting";
import { GateLogoMark } from "../auth/GateLogoMark";
import {
  AgentsNavIcon,
  ArchitectureNavIcon,
  MerchantsNavIcon,
} from "./NavIcons";

const STATUS_FILTERS: {
  id: OrgTreeFilter["status"];
  label: string;
}[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
];

const PAY_FILTERS: {
  id: OrgTreeFilter["pay"];
  label: string;
  title: string;
}[] = [
  { id: "all", label: "All payments", title: "All payment statuses" },
  { id: "paid", label: "Paid", title: "Paid" },
  { id: "overdue", label: "Overdue", title: "Merchant overdue bills" },
  { id: "issued", label: "Issued", title: "Merchant issued bills" },
  { id: "pending", label: "Pending", title: "Agent pending payouts" },
  { id: "scheduled", label: "Scheduled", title: "Agent scheduled payouts" },
];

const MERCHANT_PAY_IDS: ReadonlySet<OrgTreeFilter["pay"]> = new Set([
  "all",
  "paid",
  "overdue",
  "issued",
]);
const AGENT_PAY_IDS: ReadonlySet<OrgTreeFilter["pay"]> = new Set([
  "all",
  "paid",
  "pending",
  "scheduled",
]);

/** Pay icons that apply to the current accounts / agents / merchants context. */
function payFiltersForContext(
  accountsView: "tree" | "agents" | "merchants",
  type: OrgTreeFilter["type"],
): typeof PAY_FILTERS {
  if (accountsView === "merchants" || type === "merchant") {
    return PAY_FILTERS.filter((item) => MERCHANT_PAY_IDS.has(item.id));
  }
  if (accountsView === "agents" || type === "agent") {
    return PAY_FILTERS.filter((item) => AGENT_PAY_IDS.has(item.id));
  }
  // Architecture "all types" — both merchant billing + agent payouts.
  // Platform / sites have no commercial pay status — hide the group.
  if (type === "platform" || type === "site") return [];
  return PAY_FILTERS;
}

function isPayAllowedInContext(
  pay: OrgTreeFilter["pay"],
  accountsView: "tree" | "agents" | "merchants",
  type: OrgTreeFilter["type"],
): boolean {
  if (pay === "all") return true;
  return payFiltersForContext(accountsView, type).some((item) => item.id === pay);
}

function StatusFilterIcon({ id }: { id: OrgTreeFilter["status"] }) {
  if (id === "active") {
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.75" />
        <circle cx="12" cy="12" r="3.25" fill="currentColor" />
      </svg>
    );
  }
  if (id === "paused") {
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="7" y="6" width="3" height="12" rx="1.25" fill="currentColor" />
        <rect x="14" y="6" width="3" height="12" rx="1.25" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="5" width="5.5" height="5.5" rx="1.5" fill="currentColor" />
      <rect x="13.5" y="5" width="5.5" height="5.5" rx="1.5" fill="currentColor" />
      <rect x="5" y="13.5" width="5.5" height="5.5" rx="1.5" fill="currentColor" />
      <rect x="13.5" y="13.5" width="5.5" height="5.5" rx="1.5" fill="currentColor" />
    </svg>
  );
}

/** Distinct payment-status glyphs — readable at toolbar size. */
function PayFilterIcon({ id }: { id: OrgTreeFilter["pay"] }) {
  if (id === "all") {
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.75" />
        <path
          d="M12 7.75v8.5M14.75 9.25c0-1-.9-1.75-2.75-1.75s-2.75.75-2.75 1.75S10.9 11 12 11s2.75.7 2.75 1.75S13.85 14.5 12 14.5s-2.75-.75-2.75-1.75"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (id === "paid") {
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.75" />
        <path
          d="M8.25 12.25 10.75 14.75 15.75 9.5"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (id === "overdue") {
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 3.75 21 19.5H3L12 3.75Z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <path
          d="M12 9.5v4.5"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <circle cx="12" cy="16.75" r="1.15" fill="currentColor" />
      </svg>
    );
  }
  if (id === "issued") {
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M6.75 4.5h7L17.5 8.25V19.5H6.75V4.5Z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <path
          d="M13.75 4.5v3.75H17.5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <path
          d="M9.25 12h5.5M9.25 15h3.75"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <circle cx="9.25" cy="12" r="0.9" fill="currentColor" />
        <circle cx="9.25" cy="15" r="0.9" fill="currentColor" />
      </svg>
    );
  }
  if (id === "pending") {
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M7 4.75h10"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <path
          d="M7 19.25h10"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <path
          d="M8.5 4.75 12 12 15.5 4.75"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <path
          d="M8.5 19.25 12 12 15.5 19.25"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  // scheduled — calendar with clock mark
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="4.5"
        y="6"
        width="15"
        height="13.5"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path d="M4.5 10.25h15" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M8.25 4.5v3M15.75 4.5v3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="14.25" cy="15" r="3.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M14.25 13.75v1.5l1 0.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function OnboardPlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PaneOnboardMenu({
  preferMerchant = false,
}: {
  preferMerchant?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const agentItem = (
    <li key="agent" role="none">
      <Link
        role="menuitem"
        className="org-architecture__pane-onboard-option"
        to={platformRoute("agents/new")}
        onClick={() => setOpen(false)}
      >
        Onboard agent
      </Link>
    </li>
  );
  const merchantItem = (
    <li key="merchant" role="none">
      <Link
        role="menuitem"
        className="org-architecture__pane-onboard-option"
        to={platformRoute("merchants/new")}
        onClick={() => setOpen(false)}
      >
        Onboard merchant
      </Link>
    </li>
  );

  return (
    <div
      ref={rootRef}
      className={`org-architecture__pane-onboard-wrap${open ? " is-open" : ""}`}
    >
      <button
        type="button"
        className="org-architecture__pane-onboard"
        aria-expanded={open}
        aria-haspopup="menu"
        title="Onboard"
        aria-label="Onboard"
        onClick={() => setOpen((value) => !value)}
      >
        <OnboardPlusIcon />
      </button>
      {open ? (
        <ul className="org-architecture__pane-onboard-menu" role="menu">
          {preferMerchant ? (
            <>
              {merchantItem}
              {agentItem}
            </>
          ) : (
            <>
              {agentItem}
              {merchantItem}
            </>
          )}
        </ul>
      ) : null}
    </div>
  );
}

function TreeExpandIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 10.25 12 16.25 18 10.25"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 5.75 12 11.75 18 5.75"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TreeCollapseIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 13.75 12 7.75 18 13.75"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 18.25 12 12.25 18 18.25"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const TYPE_OPTIONS: { id: OrgTreeFilter["type"]; label: string }[] = [
  { id: "all", label: "All types" },
  { id: "platform", label: "Platform" },
  { id: "agent", label: "Agent" },
  { id: "merchant", label: "Merchant" },
  { id: "site", label: "Sites" },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function displayOrDash(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "—") return "-";
  return trimmed;
}

function shortOrgId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function CopyOrgId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="org-architecture__id-copy"
      title={copied ? "Copied" : "Copy org id"}
      onClick={() => {
        void navigator.clipboard.writeText(id).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      <code className="org-architecture__id-code">{shortOrgId(id)}</code>
      <span className="org-architecture__id-hint" aria-hidden>
        {copied ? "✓" : "⎘"}
      </span>
    </button>
  );
}

const REGISTRATION_HELP: Record<string, string> = {
  Country: "Country captured on the onboard Details step.",
  "Owner email":
    "Portal Owner invite when present; otherwise the first team member on this account (for example Cashier on load-seed merchants).",
};

function MetaHelp({ text }: { text: string }) {
  return (
    <span className="plat-card-help org-architecture__meta-help">
      <button type="button" className="plat-card-help__btn" aria-label={text}>
        ?
      </button>
      <span className="plat-card-help__tip" role="tooltip">
        {text}
      </span>
    </span>
  );
}

function MetaRow({
  label,
  value,
  help,
}: {
  label: string;
  value: ReactNode;
  help?: string;
}) {
  return (
    <div className="org-architecture__meta-row">
      <dt>
        <span>{label}</span>
        {help ? <MetaHelp text={help} /> : null}
      </dt>
      <dd>{value}</dd>
    </div>
  );
}


function treeBadgeClass(type: string): string {
  if (type === "platform") return "platform";
  if (type === "agent" || type === "agent_sub") return "agent";
  if (type === "merchant_site") return "site";
  return "merchant";
}

function treeBadgeIcon(type: string): string {
  if (type === "platform") return "P";
  if (type === "agent" || type === "agent_sub") return "A";
  if (type === "merchant_site") return "S";
  return "M";
}

type MerchantFeeStatus = "overdue" | "issued" | "paid";

type TreeRowBudgets = {
  commissionByAgentId: ReadonlyMap<string, AgentPayoutStatus | null>;
  feeByMerchantId: ReadonlyMap<string, MerchantFeeStatus | null>;
};

/** Prefer collection risk: overdue → issued → latest paid. */
function resolveMerchantFeeStatus(
  bills: ReadonlyArray<ServiceBill>,
): MerchantFeeStatus | null {
  let hasIssued = false;
  let hasPaid = false;
  for (const bill of bills) {
    if (bill.status === "overdue") return "overdue";
    if (bill.status === "issued") hasIssued = true;
    else if (bill.status === "paid") hasPaid = true;
  }
  if (hasIssued) return "issued";
  if (hasPaid) return "paid";
  return null;
}

function commissionPayoutLabel(status: AgentPayoutStatus): string {
  if (status === "paid") return "Paid";
  if (status === "pending") return "Pending";
  return "Scheduled";
}

function countStatusKeys(
  ids: Iterable<string>,
  byId: ReadonlyMap<string, string | null>,
  keys: readonly string[],
): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(
    keys.map((k) => [k, 0]),
  );
  out.none = 0;
  for (const id of ids) {
    const status = byId.get(id);
    if (status && status in out) out[status] = (out[status] ?? 0) + 1;
    else out.none = (out.none ?? 0) + 1;
  }
  return out;
}

type PlatformMetricFilter = Pick<OrgTreeFilter, "type" | "status" | "pay">;

type DetailAccent = "blue" | "teal" | "gold" | "violet" | "ok" | "danger" | "warn" | "slate";

function DetailStatIcon({ accent }: { accent: DetailAccent }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    "aria-hidden": true,
  };
  if (accent === "blue") {
    return (
      <svg {...common}>
        <path
          d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
          stroke="currentColor"
          strokeWidth="1.75"
        />
        <path
          d="M3.5 19.25c.7-2.4 2.7-3.75 4.5-3.75s3.8 1.35 4.5 3.75M11.5 19.25c.7-2.4 2.7-3.75 4.5-3.75s3.8 1.35 4.5 3.75"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (accent === "teal") {
    return (
      <svg {...common}>
        <path
          d="M12 3.5 19.5 8v8L12 20.5 4.5 16V8L12 3.5Z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <path d="M12 12v8.5M4.5 8 12 12l7.5-4" stroke="currentColor" strokeWidth="1.75" />
      </svg>
    );
  }
  if (accent === "gold") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.75" />
        <path
          d="M12 8v8M14.5 9.5c0-.9-.9-1.5-2.5-1.5s-2.5.6-2.5 1.5S10.9 11 12 11s2.5.6 2.5 1.5S13.6 14 12 14s-2.5-.6-2.5-1.5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (accent === "violet") {
    return (
      <svg {...common}>
        <path
          d="M4.5 8.5h15v9.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2V8.5Z"
          stroke="currentColor"
          strokeWidth="1.75"
        />
        <path
          d="M8 8.5V7a4 4 0 0 1 8 0v1.5"
          stroke="currentColor"
          strokeWidth="1.75"
        />
      </svg>
    );
  }
  if (accent === "ok") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.75" />
        <path
          d="M8.5 12.25 10.75 14.5 15.5 9.5"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (accent === "danger") {
    return (
      <svg {...common}>
        <path
          d="M12 3.75 21 19.5H3L12 3.75Z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <path d="M12 9.5v4.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        <circle cx="12" cy="16.75" r="1.1" fill="currentColor" />
      </svg>
    );
  }
  if (accent === "warn") {
    return (
      <svg {...common}>
        <path
          d="M7 4.75h10M7 19.25h10M8.5 4.75 12 12l3.5-7.25M8.5 19.25 12 12l3.5 7.25"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="7" y="6" width="3" height="12" rx="1.25" fill="currentColor" />
      <rect x="14" y="6" width="3" height="12" rx="1.25" fill="currentColor" />
    </svg>
  );
}

function PlatformMetricCard({
  label,
  value,
  hint,
  active,
  accent,
  onClick,
}: {
  label: string;
  value: number;
  hint?: string;
  active?: boolean;
  accent: DetailAccent;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`platform-detail__stat is-${accent}${active ? " is-active" : ""}`}
      onClick={onClick}
      aria-pressed={active === true}
    >
      <span className="platform-detail__stat-icon" aria-hidden>
        <DetailStatIcon accent={accent} />
      </span>
      <span className="platform-detail__stat-label">{label}</span>
      <span className="platform-detail__stat-value">{value.toLocaleString()}</span>
      {hint ? <span className="platform-detail__stat-hint">{hint}</span> : null}
      <span className="platform-detail__stat-wave" aria-hidden />
    </button>
  );
}

function PlatformDetailPanel({
  node,
  byId,
  budgets,
  platformStats,
  filter,
  canManage,
  busy,
  onFilter,
  onAdd,
}: {
  node: PlatformOrgTreeNode;
  byId: Map<string, PlatformOrgTreeNode>;
  budgets: TreeRowBudgets;
  platformStats: {
    total: number;
    platform: number;
    agents: number;
    merchants: number;
    sites: number;
    paused: number;
  };
  filter: OrgTreeFilter;
  canManage: boolean;
  busy: boolean;
  onFilter: (next: PlatformMetricFilter) => void;
  onAdd: () => void;
}) {
  const teamHref = platformRoute("settings/team");

  const metrics = useMemo(() => {
    let active = 0;
    const agentIds: string[] = [];
    const merchantIds: string[] = [];
    for (const org of byId.values()) {
      if (org.type === "platform") continue;
      if (org.status === "active") active += 1;
      if (org.type === "agent" || org.type === "agent_sub") agentIds.push(org.id);
      else if (org.type === "merchant") merchantIds.push(org.id);
    }
    const merchantPay = countStatusKeys(merchantIds, budgets.feeByMerchantId, [
      "paid",
      "overdue",
      "issued",
    ]);
    const agentPay = countStatusKeys(
      agentIds,
      budgets.commissionByAgentId,
      ["paid", "pending", "scheduled"],
    );
    return {
      all: platformStats.total - (platformStats.platform ?? 0),
      agents: platformStats.agents,
      merchants: platformStats.merchants,
      sites: platformStats.sites,
      active,
      paused: platformStats.paused,
      merchantPay,
      agentPay,
    };
  }, [byId, budgets, platformStats]);

  const networkActive = (m: PlatformMetricFilter) =>
    filter.type === m.type &&
    filter.status === m.status &&
    filter.pay === m.pay;

  const activeRate =
    metrics.all > 0 ? Math.round((metrics.active / metrics.all) * 1000) / 10 : 100;

  return (
    <div className="platform-detail">
      <header className="platform-detail__hero">
        <div className="platform-detail__hero-main">
          <GateLogoMark size={48} className="platform-detail__mark" alt="" />
          <div className="platform-detail__identity">
            <p className="platform-detail__eyebrow">Platform</p>
            <h3 className="platform-detail__title">{node.name}</h3>
            <p className="platform-detail__subtitle">
              Network overview — filter the org tree from these cards.
            </p>
          </div>
        </div>
        <div className="platform-detail__hero-actions">
          {canManage ? (
            <button
              type="button"
              className="platform-detail__btn-gold"
              disabled={busy}
              onClick={onAdd}
            >
              Add account
            </button>
          ) : null}
          <Link className="platform-detail__team-link" to={teamHref} title="Open platform team">
            Team
            <span aria-hidden>→</span>
          </Link>
        </div>
      </header>

      <div className="platform-detail__metrics">
        <PlatformMetricCard
          accent="blue"
          label="Merchants"
          value={metrics.merchants}
          hint="In network"
          active={networkActive({ type: "merchant", status: "all", pay: "all" })}
          onClick={() => onFilter({ type: "merchant", status: "all", pay: "all" })}
        />
        <PlatformMetricCard
          accent="teal"
          label="Agents"
          value={metrics.agents}
          hint="Distribution"
          active={networkActive({ type: "agent", status: "all", pay: "all" })}
          onClick={() => onFilter({ type: "agent", status: "all", pay: "all" })}
        />
        <PlatformMetricCard
          accent="gold"
          label="Accounts"
          value={Math.max(0, metrics.all)}
          hint="All orgs"
          active={networkActive({ type: "all", status: "all", pay: "all" })}
          onClick={() => onFilter({ type: "all", status: "all", pay: "all" })}
        />
        <PlatformMetricCard
          accent="violet"
          label="Sites"
          value={metrics.sites}
          hint="Storefronts"
          active={networkActive({ type: "site", status: "all", pay: "all" })}
          onClick={() => onFilter({ type: "site", status: "all", pay: "all" })}
        />

        <button
          type="button"
          className={`platform-detail__feature${
            networkActive({ type: "all", status: "all", pay: "all" }) ? " is-active" : ""
          }`}
          onClick={() => onFilter({ type: "all", status: "all", pay: "all" })}
          aria-pressed={networkActive({ type: "all", status: "all", pay: "all" })}
        >
          <span className="platform-detail__feature-kicker">Trusted network</span>
          <span className="platform-detail__feature-value">
            {Math.max(0, metrics.all).toLocaleString()}
            <span>+</span>
          </span>
          <span className="platform-detail__feature-label">orgs across agents & merchants</span>
          <span className="platform-detail__feature-orb" aria-hidden />
        </button>
      </div>

      <div className="platform-detail__panels">
        <section className="platform-detail__panel" aria-label="Merchant billing">
          <div className="platform-detail__panel-head">
            <h4 className="platform-detail__section-title">Merchant billing</h4>
            <span className="platform-detail__panel-chip">Fees</span>
          </div>
          <div className="platform-detail__status-grid">
            <PlatformMetricCard
              accent="ok"
              label="Paid"
              value={metrics.merchantPay.paid ?? 0}
              hint="Settled"
              active={networkActive({
                type: "merchant",
                status: "all",
                pay: "paid",
              })}
              onClick={() =>
                onFilter({ type: "merchant", status: "all", pay: "paid" })
              }
            />
            <PlatformMetricCard
              accent="danger"
              label="Overdue"
              value={metrics.merchantPay.overdue ?? 0}
              hint="Needs attention"
              active={networkActive({
                type: "merchant",
                status: "all",
                pay: "overdue",
              })}
              onClick={() =>
                onFilter({ type: "merchant", status: "all", pay: "overdue" })
              }
            />
            <PlatformMetricCard
              accent="warn"
              label="Issued"
              value={metrics.merchantPay.issued ?? 0}
              hint="Awaiting pay"
              active={networkActive({
                type: "merchant",
                status: "all",
                pay: "issued",
              })}
              onClick={() =>
                onFilter({ type: "merchant", status: "all", pay: "issued" })
              }
            />
          </div>
        </section>

        <section className="platform-detail__panel" aria-label="Agent payouts">
          <div className="platform-detail__panel-head">
            <h4 className="platform-detail__section-title">Agent payouts</h4>
            <span className="platform-detail__panel-chip">Commission</span>
          </div>
          <div className="platform-detail__status-grid">
            <PlatformMetricCard
              accent="ok"
              label="Paid"
              value={metrics.agentPay.paid ?? 0}
              hint="Sent"
              active={networkActive({
                type: "agent",
                status: "all",
                pay: "paid",
              })}
              onClick={() =>
                onFilter({ type: "agent", status: "all", pay: "paid" })
              }
            />
            <PlatformMetricCard
              accent="warn"
              label="Pending"
              value={metrics.agentPay.pending ?? 0}
              hint="In queue"
              active={networkActive({
                type: "agent",
                status: "all",
                pay: "pending",
              })}
              onClick={() =>
                onFilter({ type: "agent", status: "all", pay: "pending" })
              }
            />
            <PlatformMetricCard
              accent="violet"
              label="Scheduled"
              value={metrics.agentPay.scheduled ?? 0}
              hint="Upcoming"
              active={networkActive({
                type: "agent",
                status: "all",
                pay: "scheduled",
              })}
              onClick={() =>
                onFilter({ type: "agent", status: "all", pay: "scheduled" })
              }
            />
          </div>
        </section>
      </div>

      <div className="platform-detail__footer-row" role="group" aria-label="Org status">
        <PlatformMetricCard
          accent="ok"
          label="Active"
          value={metrics.active}
          hint={`${activeRate}% healthy`}
          active={networkActive({ type: "all", status: "active", pay: "all" })}
          onClick={() => onFilter({ type: "all", status: "active", pay: "all" })}
        />
        <PlatformMetricCard
          accent="slate"
          label="Paused"
          value={metrics.paused}
          hint={metrics.paused > 0 ? "Needs review" : "No action"}
          active={networkActive({ type: "all", status: "paused", pay: "all" })}
          onClick={() => onFilter({ type: "all", status: "paused", pay: "all" })}
        />
        <PlatformMetricCard
          accent="danger"
          label="Overdue bills"
          value={metrics.merchantPay.overdue ?? 0}
          hint="Merchant fees"
          active={networkActive({
            type: "merchant",
            status: "all",
            pay: "overdue",
          })}
          onClick={() =>
            onFilter({ type: "merchant", status: "all", pay: "overdue" })
          }
        />
        <PlatformMetricCard
          accent="violet"
          label="Pending payouts"
          value={metrics.agentPay.pending ?? 0}
          hint="Agent queue"
          active={networkActive({
            type: "agent",
            status: "all",
            pay: "pending",
          })}
          onClick={() =>
            onFilter({ type: "agent", status: "all", pay: "pending" })
          }
        />
      </div>
    </div>
  );
}

function OrgTreeItem({
  node,
  depth,
  expanded,
  selectedId,
  onSelect,
  onToggle,
  budgets,
}: {
  node: PlatformOrgTreeNode;
  depth: number;
  expanded: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  budgets: TreeRowBudgets;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const isSelected = selectedId === node.id;
  const isPaused = node.status === "paused";
  const isAgent = node.type === "agent" || node.type === "agent_sub";
  const isMerchant = node.type === "merchant";
  const commission = isAgent
    ? (budgets.commissionByAgentId.get(node.id) ?? null)
    : null;
  const feeStatus = isMerchant
    ? (budgets.feeByMerchantId.get(node.id) ?? null)
    : null;

  const select = () => onSelect(node.id);
  const toggle = () => {
    if (hasChildren) onToggle(node.id);
  };

  return (
    <div
      id={`org-tree-${node.id}`}
      className="b3-accounts__node"
      role="treeitem"
      aria-expanded={hasChildren ? isOpen : undefined}
      aria-selected={isSelected}
      data-org-id={node.id}
    >
      <div
        className={`b3-accounts__row org-architecture__row${isSelected ? " is-selected" : ""}${
          node.type === "merchant_site" ? " is-site" : ""
        }${isPaused ? " is-paused" : ""}`}
        style={{ paddingLeft: 10 + depth * 16 }}
        onClick={select}
        onDoubleClick={(e) => {
          e.preventDefault();
          toggle();
        }}
        role="presentation"
      >
        {hasChildren ? (
          <button
            type="button"
            className="b3-accounts__chevron"
            tabIndex={-1}
            aria-label={isOpen ? "Collapse" : "Expand"}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
            onDoubleClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <span className={`b3-accounts__caret${isOpen ? " is-open" : ""}`} />
          </button>
        ) : (
          <span
            className="b3-accounts__chevron b3-accounts__chevron--spacer"
            aria-hidden
          />
        )}
        <span
          className={`b3-accounts__badge b3-accounts__badge--${treeBadgeClass(node.type)}`}
          title={orgTypeLabel(node.type)}
          aria-label={orgTypeLabel(node.type)}
        >
          {treeBadgeIcon(node.type)}
        </span>
        <span className="b3-accounts__name org-architecture__name">
          <span className="b3-accounts__name-text">{node.name}</span>
        </span>
        <span className="org-architecture__row-meta" aria-hidden={false}>
          <span className="org-architecture__meta-count">
            {hasChildren ? (
              <span className="org-architecture__child-count">{node.children.length}</span>
            ) : null}
          </span>
          <span className="org-architecture__meta-onboard">
            {isAgent || isMerchant ? (
              <span
                className="org-architecture__onboard-date"
                title={
                  node.createdAt
                    ? `Onboarded ${formatOnboardDate(node.createdAt)}`
                    : "Onboard date unknown"
                }
              >
                {node.createdAt ? formatOnboardDate(node.createdAt) : "—"}
              </span>
            ) : (
              <span className="org-architecture__onboard-date is-empty">—</span>
            )}
          </span>
          <span className="org-architecture__meta-status">
            <span
              className={`org-agents__status org-architecture__budget${
                isPaused ? " is-paused" : " is-active"
              }`}
              title="Account status"
            >
              {isPaused ? "Paused" : "Active"}
            </span>
          </span>
          <span className="org-architecture__meta-budget">
            {isAgent ? (
              commission ? (
                <span
                  className={`org-agents__payout org-architecture__budget is-${commission}`}
                  title="Latest commission payout"
                >
                  {commissionPayoutLabel(commission)}
                </span>
              ) : (
                <span
                  className="org-architecture__budget org-architecture__budget--empty"
                  title="No commission statements yet"
                >
                  —
                </span>
              )
            ) : isMerchant ? (
              feeStatus ? (
                <span
                  className={`org-agents__bill org-architecture__budget is-${feeStatus}${
                    feeStatus === "overdue" ? " is-pulse" : ""
                  }`}
                  title="Platform payment fee"
                >
                  {serviceBillStatusLabel(feeStatus)}
                </span>
              ) : (
                <span
                  className="org-architecture__budget org-architecture__budget--empty"
                  title="No platform payment fee bills yet"
                >
                  —
                </span>
              )
            ) : (
              <span className="org-architecture__budget org-architecture__budget--empty">
                —
              </span>
            )}
          </span>
        </span>
      </div>
      {hasChildren && isOpen
        ? node.children.map((child) => (
            <OrgTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedId={selectedId}
              onSelect={onSelect}
              onToggle={onToggle}
              budgets={budgets}
            />
          ))
        : null}
    </div>
  );
}

function OrgTreeDetail({
  node,
  byId,
  ownerEmailByOrgId,
  canManage,
  busy,
  platformStats,
  budgets,
  filter,
  onFilter,
  onSuspend,
  onRun,
  onDelete,
}: {
  node: PlatformOrgTreeNode;
  byId: Map<string, PlatformOrgTreeNode>;
  ownerEmailByOrgId: ReadonlyMap<string, string>;
  canManage: boolean;
  busy: boolean;
  platformStats?: {
    total: number;
    platform: number;
    agents: number;
    merchants: number;
    sites: number;
    paused: number;
  } | null;
  budgets?: TreeRowBudgets | null;
  filter?: OrgTreeFilter;
  onFilter?: (next: PlatformMetricFilter) => void;
  onSuspend: () => void;
  onRun: () => void;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const counts = childTypeCounts(node);
  const detailHref = orgDetailHref(node.type, node.id, node.parentId);
  const detailLabel = orgDetailLabel(node.type);
  const canAdd = orgCanAddChild(node.type);
  const canSubAgent = false; // Phase 1: no nested agents
  const breadcrumb = orgBreadcrumbPath(node.id, byId);
  const ownerEmail = ownerEmailByOrgId.get(node.id) ?? null;
  const isPaused = node.status === "paused";
  const canDelete = node.type !== "platform";
  const showActions = canManage && (canAdd || canDelete);
  const isAgentParent = node.type === "agent" || node.type === "agent_sub";
  const isAgent = isAgentParent;
  const isMerchant = node.type === "merchant";
  const isPlatform = node.type === "platform";
  const parentNode = node.parentId ? byId.get(node.parentId) : undefined;
  const depth = isAgent ? agentDepthOfNode(node, byId) : null;
  const ops = useOrgTreeOpsExtras(node);

  useEffect(() => {
    setAddMenuOpen(false);
  }, [node.id]);

  useEffect(() => {
    if (!addMenuOpen) return;
    const onDocPointer = (e: MouseEvent) => {
      if (!(e.target instanceof Node)) return;
      if (!addMenuRef.current?.contains(e.target)) setAddMenuOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setAddMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [addMenuOpen]);

  if (isPlatform && platformStats && budgets && filter && onFilter) {
    return (
      <PlatformDetailPanel
        node={node}
        byId={byId}
        budgets={budgets}
        platformStats={platformStats}
        filter={filter}
        canManage={canManage}
        busy={busy}
        onFilter={onFilter}
        onAdd={() => {
          const href = orgAddChildHref(node.type);
          if (href) navigate(withReturnTo(href));
        }}
      />
    );
  }

  const contactRows = [
    {
      label: "Registered",
      value: formatOnboardDate(node.createdAt),
      always: true,
    },
    { label: "Legal name", value: node.legalName, always: false },
    { label: "Country", value: node.country, always: false },
    { label: "Owner email", value: ownerEmail, always: false },
  ];
  const filledContact = contactRows.filter(
    (r) => r.always || (r.value && String(r.value).trim() && String(r.value) !== "—"),
  );

  const showStatStrip =
    counts.agents > 0 ||
    counts.merchants > 0 ||
    counts.sites > 0 ||
    counts.total > 0;

  return (
    <div className="org-architecture__detail-inner org-architecture__detail-inner--dense">
      <header className="org-architecture__detail-head">
        <div className="org-architecture__detail-avatar" aria-hidden>
          {initials(node.name)}
        </div>
        <h3 className="org-architecture__detail-title">{node.name}</h3>
        <div className="org-architecture__detail-meta">
          <div className="org-architecture__detail-badges">
            <span className="org-architecture__chip">{orgTypeLabel(node.type)}</span>
            <span
              className={`org-architecture__status ${
                isPaused ? "is-paused" : "is-active"
              }`}
            >
              {node.status}
            </span>
          </div>
          {showActions ? (
            <div className="org-architecture__actions" aria-label="Org actions">
              {canAdd ? (
                isAgentParent ? (
                  <div className="org-architecture__add-wrap" ref={addMenuRef}>
                    <button
                      type="button"
                      className="org-architecture__action org-architecture__action--add"
                      disabled={busy}
                      aria-expanded={addMenuOpen}
                      aria-haspopup="menu"
                      onClick={() => setAddMenuOpen((open) => !open)}
                    >
                      Add
                    </button>
                    {addMenuOpen ? (
                      <div
                        className="org-architecture__add-menu"
                        role="menu"
                        aria-label="Add child account"
                      >
                        {canSubAgent ? (
                          <button
                            type="button"
                            role="menuitem"
                            className="org-architecture__add-option"
                            onClick={() => {
                              setAddMenuOpen(false);
                              navigate(
                                withReturnTo(
                                  `${platformRoute("agents/new")}?kind=agent_sub&parentId=${encodeURIComponent(node.id)}`,
                                ),
                              );
                            }}
                          >
                            Sub-agent
                          </button>
                        ) : null}
                        <button
                          type="button"
                          role="menuitem"
                          className="org-architecture__add-option"
                          onClick={() => {
                            setAddMenuOpen(false);
                            navigate(
                              withReturnTo(
                                `${platformRoute("merchants/new")}?parentId=${encodeURIComponent(node.id)}`,
                              ),
                            );
                          }}
                        >
                          Merchant
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="org-architecture__action org-architecture__action--add"
                    disabled={busy}
                    onClick={() => {
                      const href = orgAddChildHref(node.type);
                      if (href) navigate(withReturnTo(href));
                    }}
                  >
                    Add
                  </button>
                )
              ) : null}
              {canDelete ? (
                <>
                  {isPaused ? (
                    <button
                      type="button"
                      className="org-architecture__action org-architecture__action--run"
                      disabled={busy}
                      onClick={onRun}
                    >
                      Run
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="org-architecture__action org-architecture__action--suspend"
                      disabled={busy}
                      onClick={onSuspend}
                    >
                      Suspend
                    </button>
                  )}
                  <button
                    type="button"
                    className="org-architecture__action org-architecture__action--delete"
                    disabled={busy}
                    onClick={onDelete}
                  >
                    Delete
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      {breadcrumb.length > 1 ? (
        <nav className="org-architecture__crumb" aria-label="Org path">
          {breadcrumb.map((crumb, index) => (
            <span key={crumb.id} className="org-architecture__crumb-item">
              {index > 0 ? (
                <span className="org-architecture__crumb-sep" aria-hidden>
                  /
                </span>
              ) : null}
              <span>{crumb.name}</span>
            </span>
          ))}
        </nav>
      ) : null}

      {showStatStrip ? (
        <div className="org-architecture__stat-strip" aria-label="Direct children">
          <div className="org-architecture__stat-pill">
            <span className="org-architecture__stat-pill-value">
              {counts.agents}
            </span>
            <span className="org-architecture__stat-pill-label">Agents</span>
          </div>
          <div className="org-architecture__stat-pill">
            <span className="org-architecture__stat-pill-value">
              {counts.merchants}
            </span>
            <span className="org-architecture__stat-pill-label">Merchants</span>
          </div>
          <div className="org-architecture__stat-pill">
            <span className="org-architecture__stat-pill-value">{counts.sites}</span>
            <span className="org-architecture__stat-pill-label">Sites</span>
          </div>
          <div className="org-architecture__stat-pill">
            <span className="org-architecture__stat-pill-value">{counts.total}</span>
            <span className="org-architecture__stat-pill-label">Children</span>
          </div>
        </div>
      ) : null}

      <section className="org-architecture__section org-architecture__section--ops">
        <h4 className="org-architecture__section-title">Ops</h4>
        <dl className="org-architecture__meta org-architecture__meta--dense">
          <MetaRow label="Org ID" value={<CopyOrgId id={node.id} />} />
          <MetaRow
            label="Status"
            value={
              <span
                className={`org-architecture__status-inline ${
                  isPaused ? "is-paused" : "is-active"
                }`}
              >
                {node.status}
              </span>
            }
          />
          <MetaRow
            label="Parent"
            value={
              node.parentName
                ? `${node.parentName}${
                    parentNode ? ` · ${orgTypeLabel(parentNode.type)}` : ""
                  }`
                : "-"
            }
          />
          {isAgent ? (
            <>
              <MetaRow label="Depth" value={depth != null ? String(depth) : "-"} />
              <MetaRow
                label="Commission %"
                value={
                  ops.loading
                    ? "…"
                    : ops.commissionPercent
                      ? `${ops.commissionPercent}%`
                      : "-"
                }
              />
            </>
          ) : null}
          {isMerchant ? (
            <>
              <MetaRow
                label="Structure"
                value={
                  node.structure
                    ? (STRUCTURE_LABELS[node.structure] ?? node.structure)
                    : "-"
                }
              />
              <MetaRow
                label="Tier"
                value={
                  ops.loading
                    ? "…"
                    : ops.tier
                      ? `${ops.tier}${
                          ops.volumeFeePercent
                            ? ` · ${ops.volumeFeePercent}% fee`
                            : ""
                        }`
                      : "-"
                }
              />
              <MetaRow
                label="Order create"
                value={
                  <span
                    className={`org-architecture__status-inline ${
                      node.orderCreateSuspended ? "is-paused" : "is-active"
                    }`}
                  >
                    {node.orderCreateSuspended ? "Suspended" : "Allowed"}
                  </span>
                }
              />
            </>
          ) : null}
        </dl>
      </section>

      <div className="org-architecture__info-grid">
        <section className="org-architecture__section org-architecture__section--registration">
          <h4 className="org-architecture__section-title">Registration</h4>
          <dl className="org-architecture__meta org-architecture__meta--dense">
            {filledContact.map((row) => (
              <MetaRow
                key={row.label}
                label={row.label}
                value={displayOrDash(row.value)}
                help={REGISTRATION_HELP[row.label]}
              />
            ))}
          </dl>
        </section>
      </div>

      {detailHref && detailLabel ? (
        <div className="org-architecture__detail-foot">
          <Link className="org-architecture__cta" to={detailHref}>
            {detailLabel}
            <span aria-hidden>→</span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}

const EMPTY_FILTER: OrgTreeFilter = {
  query: "",
  type: "all",
  status: "all",
  pay: "all",
};

/** Org hierarchy map with manage actions; agent/merchant open full detail cards. */
export function AccountsPage({ session }: { session: Session }) {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { id: routeOrgId } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const merchantTab = searchParams.get("tab");

  const accountsView = useMemo((): "tree" | "agents" | "merchants" => {
    const base = platformRoute("accounts").replace(/\/$/, "");
    const path = location.pathname.replace(/\/$/, "");
    if (path.startsWith(`${base}/agents`)) return "agents";
    if (path.startsWith(`${base}/merchants`)) return "merchants";
    return "tree";
  }, [location.pathname]);

  const selectedRouteId = useMemo(() => {
    if (accountsView === "tree") {
      if (!routeOrgId || routeOrgId === "agents" || routeOrgId === "merchants") {
        return null;
      }
      return routeOrgId;
    }
    return routeOrgId ?? null;
  }, [accountsView, routeOrgId]);

  const [loading, setLoading] = useState(() => peekPlatformOrgs() == null);
  const [error, setError] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<OrgAccount[]>(
    () => peekPlatformOrgs() ?? [],
  );
  const [bills, setBills] = useState<ServiceBill[]>(
    () => peekPlatformServiceBills() ?? [],
  );
  const [forest, setForest] = useState(() =>
    buildPlatformOrgForest(peekPlatformOrgs() ?? []),
  );
  const [filter, setFilter] = useState<OrgTreeFilter>(EMPTY_FILTER);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(
    () => selectedRouteId,
  );
  const selectedRouteIdRef = useRef(selectedRouteId);
  selectedRouteIdRef.current = selectedRouteId;
  const [ownerEmailByOrgId, setOwnerEmailByOrgId] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [busy, setBusy] = useState(false);
  const [suspendTarget, setSuspendTarget] = useState<PlatformOrgTreeNode | null>(
    null,
  );
  const [suspendError, setSuspendError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"ok" | "error">("ok");
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
  const [topbarActionsSlot, setTopbarActionsSlot] = useState<HTMLElement | null>(null);
  const canManage = useMemo(() => sessionCanManagePlatform(session), [session]);
  const readOnly = useMemo(() => sessionIsPlatformViewerOnly(session), [session]);

  const dismissToast = useCallback(() => setToastMessage(null), []);
  const showOk = useCallback((message: string) => {
    setToastTone("ok");
    setToastMessage(message);
  }, []);
  const showErr = useCallback((message: string) => {
    setToastTone("error");
    setToastMessage(message);
  }, []);

  useLayoutEffect(() => {
    setTopbarSlot(document.getElementById("platform-topbar-center"));
    setTopbarActionsSlot(document.getElementById("platform-topbar-actions"));
  }, []);

  useLayoutEffect(() => {
    const page = pageRef.current;
    const main = document.querySelector(".platform-shell .main");
    const topbar = document.querySelector(".platform-shell .topbar");
    if (!page || !(main instanceof HTMLElement) || !(topbar instanceof HTMLElement)) {
      return;
    }

    const syncStickyTop = () => {
      const mainTop = main.getBoundingClientRect().top;
      const topbarBottom = topbar.getBoundingClientRect().bottom;
      const stickyTop = Math.max(0, Math.ceil(topbarBottom - mainTop));
      page.style.setProperty("--org-architecture-sticky-top", `${stickyTop}px`);
    };

    syncStickyTop();
    const ro = new ResizeObserver(syncStickyTop);
    ro.observe(topbar);
    ro.observe(main);
    window.addEventListener("resize", syncStickyTop);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncStickyTop);
    };
  }, []);

  const load = useCallback(async () => {
    if (peekPlatformOrgs() == null) setLoading(true);
    setError(null);
    try {
      const [orgs, emailRows, billRows] = await Promise.all([
        getPlatformOrgs(),
        listPlatformOrgMemberEmails().catch(() => [] as Awaited<
          ReturnType<typeof listPlatformOrgMemberEmails>
        >),
        getPlatformServiceBills().catch(() => [] as ServiceBill[]),
      ]);
      const nextForest = buildPlatformOrgForest(orgs);
      setOrgs(orgs);
      setBills(billRows);
      setForest(nextForest);
      setOwnerEmailByOrgId(orgOwnerEmailMapFromBulkRows(emailRows));
      // Do not reset expansion on every load — selection/nav must not collapse
      // nodes the user just opened (e.g. double-click expand).
      setExpanded((prev) => {
        if (accountsView === "tree") {
          if (prev.size === 0) return defaultExpandedIds(nextForest.roots);
          const next = new Set<string>();
          for (const id of prev) {
            if (nextForest.byId.has(id)) next.add(id);
          }
          return next.size > 0 ? next : defaultExpandedIds(nextForest.roots);
        }
        const next = new Set<string>();
        for (const id of prev) {
          if (nextForest.byId.has(id)) next.add(id);
        }
        return next;
      });
      setSelectedId((prev) => {
        const routeId = selectedRouteIdRef.current;
        const fromRoute =
          routeId && nextForest.byId.has(routeId) ? routeId : null;
        if (fromRoute) return fromRoute;
        if (prev && nextForest.byId.has(prev)) return prev;
        if (accountsView === "agents") {
          return agentsForestRoots(nextForest.roots)[0]?.id ?? null;
        }
        if (accountsView === "merchants") {
          return merchantsForestRoots(nextForest.roots)[0]?.id ?? null;
        }
        return nextForest.roots[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load org tree");
    } finally {
      setLoading(false);
    }
  }, [accountsView]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onOrgsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<OrgAccount[]>).detail;
      if (!Array.isArray(detail)) {
        void load();
        return;
      }
      const nextForest = buildPlatformOrgForest(detail);
      setOrgs(detail);
      setForest(nextForest);
      setExpanded((prev) => {
        if (accountsView !== "tree") {
          // Keep scoped tabs collapsed; only preserve ids still present.
          const next = new Set<string>();
          for (const id of prev) {
            if (nextForest.byId.has(id)) next.add(id);
          }
          return next;
        }
        const next = new Set<string>();
        for (const id of prev) {
          if (nextForest.byId.has(id)) next.add(id);
        }
        for (const id of defaultExpandedIds(nextForest.roots)) {
          next.add(id);
        }
        return next;
      });
      setSelectedId((prev) => {
        if (prev && nextForest.byId.has(prev)) return prev;
        if (accountsView === "agents") {
          return agentsForestRoots(nextForest.roots)[0]?.id ?? null;
        }
        if (accountsView === "merchants") {
          return merchantsForestRoots(nextForest.roots)[0]?.id ?? null;
        }
        return nextForest.roots[0]?.id ?? null;
      });
    };
    window.addEventListener(PLATFORM_ORGS_UPDATED_EVENT, onOrgsUpdated);
    return () => {
      window.removeEventListener(PLATFORM_ORGS_UPDATED_EVENT, onOrgsUpdated);
    };
  }, [load, accountsView]);

  const refreshForest = useCallback(async (opts?: { excludeOrgIds?: string[] }) => {
    const [orgs, emailRows] = await Promise.all([
      refreshPlatformOrgList({ excludeOrgIds: opts?.excludeOrgIds }),
      listPlatformOrgMemberEmails().catch(() => [] as Awaited<
        ReturnType<typeof listPlatformOrgMemberEmails>
      >),
    ]);
    const nextForest = buildPlatformOrgForest(orgs);
    setOrgs(orgs);
    setForest(nextForest);
    setOwnerEmailByOrgId(orgOwnerEmailMapFromBulkRows(emailRows));
    setExpanded((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (nextForest.byId.has(id)) next.add(id);
      }
      return next;
    });
    setSelectedId((prev) => {
      if (prev && nextForest.byId.has(prev)) return prev;
      const parentId = prev ? (forest.byId.get(prev)?.parentId ?? null) : null;
      if (parentId && nextForest.byId.has(parentId)) return parentId;
      return nextForest.roots[0]?.id ?? null;
    });
  }, [forest]);

  const {
    deleteTarget,
    deletePreview,
    deletePreviewLoading,
    deleteError,
    deleteBusy,
    openDelete,
    closeDelete,
    confirmDelete,
  } = useOrgDeleteModal({
    canManage,
    onDeleted: async (deletedId) => {
      removePlatformOrgFromList(deletedId);
      await refreshForest({ excludeOrgIds: [deletedId] });
    },
    showOk,
  });

  const onSetStatus = useCallback(
    async (
      node: PlatformOrgTreeNode,
      status: "active" | "paused",
      reason?: string,
    ): Promise<string | null> => {
      if (!canManage || node.type === "platform") return "Not allowed";
      setBusy(true);
      try {
        await setOrgStatus(
          node.id,
          status,
          reason ? { reason } : undefined,
        );
        await refreshForest();
        showOk(
          status === "paused" ? `Suspended ${node.name}.` : `Running ${node.name}.`,
        );
        return null;
      } catch (err) {
        const text =
          err instanceof ApiError
            ? err.code === "rate_limited"
              ? "Too many requests — wait a moment and retry."
              : err.message
            : "Status update failed";
        showErr(text);
        return text;
      } finally {
        setBusy(false);
      }
    },
    [canManage, refreshForest, showErr, showOk],
  );

  const confirmSuspend = useCallback(
    async (reason: string) => {
      if (!suspendTarget) return;
      setSuspendError(null);
      const err = await onSetStatus(suspendTarget, "paused", reason || undefined);
      if (err) setSuspendError(err);
      else setSuspendTarget(null);
    },
    [onSetStatus, suspendTarget],
  );

  // When switching Agents / Merchants, start collapsed and drop incompatible pay filters.
  useEffect(() => {
    if (accountsView !== "tree") setExpanded(new Set());
    setFilter((f) => {
      if (isPayAllowedInContext(f.pay, accountsView, f.type)) return f;
      return { ...f, pay: "all" };
    });
  }, [accountsView]);

  const visiblePayFilters = useMemo(
    () => payFiltersForContext(accountsView, filter.type),
    [accountsView, filter.type],
  );

  const treeBudgets = useMemo((): TreeRowBudgets => {
    const commissionByAgentId = new Map<string, AgentPayoutStatus | null>();
    const feeByMerchantId = new Map<string, MerchantFeeStatus | null>();
    const billsByOrg = new Map<string, ServiceBill[]>();
    for (const bill of bills) {
      const list = billsByOrg.get(bill.orgId);
      if (list) list.push(bill);
      else billsByOrg.set(bill.orgId, [bill]);
    }
    for (const org of orgs) {
      if (org.type === "agent" || org.type === "agent_sub") {
        const merchantIds = merchantOrgIdsInAgentSubtree(org.id, orgs);
        const history = mergeCommissionHistory(
          bills,
          merchantIds,
          org.id,
          DEFAULT_AGENT_COMMISSION_PERCENT,
          1,
        );
        commissionByAgentId.set(org.id, resolveAgentPayoutStatus(history));
      } else if (org.type === "merchant") {
        feeByMerchantId.set(
          org.id,
          resolveMerchantFeeStatus(billsByOrg.get(org.id) ?? []),
        );
      }
    }
    return { commissionByAgentId, feeByMerchantId };
  }, [orgs, bills]);

  const filteredRoots = useMemo(() => {
    const scoped =
      accountsView === "agents"
        ? agentsForestRoots(forest.roots)
        : accountsView === "merchants"
          ? merchantsForestRoots(forest.roots)
          : forest.roots;
    const tabFilter: OrgTreeFilter = {
      ...filter,
      // Agents/Merchants tabs already scope by type; Architecture keeps the type filter.
      type: accountsView === "tree" ? filter.type : "all",
    };
    return filterPlatformOrgForest(scoped, tabFilter, {
      payOf: (node) => {
        if (node.type === "agent" || node.type === "agent_sub") {
          return treeBudgets.commissionByAgentId.get(node.id) ?? null;
        }
        if (node.type === "merchant") {
          return treeBudgets.feeByMerchantId.get(node.id) ?? null;
        }
        return null;
      },
    });
  }, [forest.roots, filter, accountsView, treeBudgets]);

  const visibleIds = useMemo(
    () => visibleTreeNodeIds(filteredRoots, expanded),
    [filteredRoots, expanded],
  );

  const visibleCount = useMemo(
    () => countTreeNodes(filteredRoots),
    [filteredRoots],
  );

  const selectedNode =
    selectedId != null ? (forest.byId.get(selectedId) ?? null) : null;

  const treeRef = useRef<HTMLDivElement | null>(null);

  const onSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      const base =
        accountsView === "agents"
          ? platformRoute(`accounts/agents/${id}`)
          : accountsView === "merchants"
            ? platformRoute(`accounts/merchants/${id}`)
            : platformRoute(`accounts/${id}`);
      const qs = searchParams.toString();
      const keepQs =
        accountsView === "merchants" || accountsView === "tree" ? qs : "";
      navigate(keepQs ? `${base}?${keepQs}` : base, { replace: true });
      treeRef.current?.focus({ preventScroll: true });
      requestAnimationFrame(() => {
        const el = treeRef.current?.querySelector(
          `[data-org-id="${CSS.escape(id)}"] .org-architecture__row`,
        );
        if (el instanceof HTMLElement) {
          el.scrollIntoView({ block: "nearest" });
        }
      });
    },
    [navigate, searchParams, accountsView],
  );

  useEffect(() => {
    if (selectedRouteId) {
      if (forest.byId.has(selectedRouteId) && selectedId !== selectedRouteId) {
        setSelectedId(selectedRouteId);
        setExpanded((prev) => {
          const branch = expandedIdsForSelectedBranch(selectedRouteId, forest.byId);
          const next = new Set(prev);
          for (const id of branch) next.add(id);
          return next;
        });
      }
      return;
    }
    // Agents / Merchants index: keep selection; ensure-one effect fills the gap.
  }, [selectedRouteId, forest.byId, selectedId, accountsView]);

  // Agents / Merchants: always keep exactly one row selected (and in the URL).
  useEffect(() => {
    if (accountsView === "tree") return;
    if (filteredRoots.length === 0) return;
    const ids = collectTreeNodeIds(filteredRoots);
    if (selectedId != null && ids.includes(selectedId)) return;
    onSelect(filteredRoots[0]!.id);
  }, [accountsView, filteredRoots, selectedId, onSelect]);

  const onToggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onTreeKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      e.key !== "ArrowUp" &&
      e.key !== "ArrowDown" &&
      e.key !== "ArrowLeft" &&
      e.key !== "ArrowRight"
    ) {
      return;
    }
    if (visibleIds.length === 0) return;
    e.preventDefault();

    const currentId = selectedId ?? visibleIds[0]!;
    const index = Math.max(0, visibleIds.indexOf(currentId));
    const node = forest.byId.get(currentId);

    if (e.key === "ArrowDown") {
      const nextId = visibleIds[Math.min(index + 1, visibleIds.length - 1)];
      if (nextId) onSelect(nextId);
      return;
    }
    if (e.key === "ArrowUp") {
      const prevId = visibleIds[Math.max(index - 1, 0)];
      if (prevId) onSelect(prevId);
      return;
    }
    if (e.key === "ArrowRight") {
      if (!node) return;
      if (node.children.length > 0 && !expanded.has(node.id)) {
        onToggle(node.id);
        return;
      }
      if (node.children.length > 0 && expanded.has(node.id)) {
        onSelect(node.children[0]!.id);
      }
      return;
    }
    if (e.key === "ArrowLeft") {
      if (!node) return;
      if (node.children.length > 0 && expanded.has(node.id)) {
        onToggle(node.id);
        return;
      }
      if (node.parentId && forest.byId.has(node.parentId)) {
        onSelect(node.parentId);
      }
    }
  };

  const expandAll = () => {
    setExpanded(new Set(collectTreeNodeIds(filteredRoots)));
  };

  const collapseAll = () => {
    setExpanded(expandedIdsForSelectedBranch(selectedId, forest.byId));
  };

  const enterOnceRef = useRef(false);
  const [enterMotion, setEnterMotion] = useState(false);
  useEffect(() => {
    if (loading || enterOnceRef.current) return;
    enterOnceRef.current = true;
    const id = window.requestAnimationFrame(() => setEnterMotion(true));
    return () => window.cancelAnimationFrame(id);
  }, [loading]);

  return (
    <div
      className={`org-architecture${enterMotion ? " is-enter" : ""}`}
      ref={pageRef}
    >
      <AuthToast
        message={toastMessage ?? error}
        tone={toastMessage ? toastTone : "error"}
        onDismiss={() => {
          dismissToast();
          setError(null);
        }}
      />

      {readOnly ? (
        <div className="banner banner-warn" style={{ marginBottom: 12 }}>
          Viewer — add, pause, run, and delete actions are hidden on this map.
        </div>
      ) : null}

      {topbarSlot
        ? createPortal(
            <label className="org-agents__search-wrap">
              <span className="org-agents__search-icon" aria-hidden>
                <svg viewBox="0 0 20 20" fill="none" width="14" height="14">
                  <circle
                    cx="8.5"
                    cy="8.5"
                    r="5.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                  <path
                    d="M12.75 12.75 16.5 16.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <input
                className="field-control org-agents__search"
                type="search"
                placeholder={
                  accountsView === "agents"
                    ? "Search agents…"
                    : accountsView === "merchants"
                      ? "Search merchants…"
                      : "Filter by org name…"
                }
                value={filter.query}
                onChange={(e) =>
                  setFilter((f) => ({ ...f, query: e.target.value }))
                }
                aria-label="Filter org tree"
              />
            </label>,
            topbarSlot,
          )
        : null}

      {topbarActionsSlot
        ? createPortal(
            <div
              className="org-architecture__topbar-actions"
              aria-label="Accounts filters"
            >
              {accountsView === "tree" ? (
                <label className="org-architecture__select-wrap">
                  <span className="sr-only">Org type</span>
                  <select
                    className="org-architecture__select org-architecture__select--topbar"
                    value={filter.type}
                    aria-label="Org type"
                    onChange={(e) =>
                      setFilter((f) => {
                        const type = e.target.value as OrgTreeFilter["type"];
                        const pay = isPayAllowedInContext(f.pay, "tree", type)
                          ? f.pay
                          : "all";
                        return { ...f, type, pay };
                      })
                    }
                  >
                    {TYPE_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div
                className="org-architecture__tree-btns"
                role="group"
                aria-label="Accounts actions"
              >
                <button
                  type="button"
                  className="org-architecture__icon-btn"
                  onClick={() => void load()}
                  disabled={loading}
                  title="Refresh org list"
                >
                  Refresh
                </button>
              </div>
            </div>,
            topbarActionsSlot,
          )
        : null}

      {forest.orphanCount > 0 ? (
        <p className="banner banner-warn org-architecture__orphans">
          {forest.orphanCount} org(s) have a missing parent and appear at the root
          level.
        </p>
      ) : null}

      <div className="org-architecture__workspace">
        <div className="org-architecture__map">
          <section
            className="org-architecture__tree-pane"
            aria-label={
              accountsView === "agents"
                ? "Agents hierarchy"
                : accountsView === "merchants"
                  ? "Merchants hierarchy"
                  : "Org hierarchy"
            }
          >
            <header className="org-architecture__pane-head org-architecture__pane-head--row">
              <div className="org-architecture__pane-title-cluster">
                <span className="org-architecture__pane-mark" aria-hidden>
                  {accountsView === "agents" ? (
                    <AgentsNavIcon />
                  ) : accountsView === "merchants" ? (
                    <MerchantsNavIcon />
                  ) : (
                    <ArchitectureNavIcon />
                  )}
                </span>
                <h3 className="org-architecture__pane-title">
                  {accountsView === "agents"
                    ? "Agents"
                    : accountsView === "merchants"
                      ? "Merchants"
                      : "Architecture"}
                </h3>
                <span
                  className="org-architecture__pane-count"
                  aria-label="Visible node count"
                >
                  {loading ? "…" : visibleCount.toLocaleString()}
                </span>
              </div>
              <div className="org-architecture__pane-toolbar">
                <div
                  className="org-architecture__pane-tree-btns"
                  role="group"
                  aria-label="Status filter"
                >
                  {STATUS_FILTERS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`org-architecture__pane-icon-btn org-architecture__pane-icon-btn--status-${item.id}${
                        filter.status === item.id ? " is-active" : ""
                      }`}
                      aria-pressed={filter.status === item.id}
                      title={item.label}
                      aria-label={item.label}
                      onClick={() =>
                        setFilter((f) => ({
                          ...f,
                          status: item.id,
                          pay: item.id === "all" ? f.pay : "all",
                        }))
                      }
                    >
                      <StatusFilterIcon id={item.id} />
                    </button>
                  ))}
                </div>
                {visiblePayFilters.length > 0 ? (
                  <div
                    className="org-architecture__pane-tree-btns"
                    role="group"
                    aria-label={
                      accountsView === "agents"
                        ? "Agent payout filter"
                        : accountsView === "merchants"
                          ? "Merchant billing filter"
                          : filter.type === "agent"
                            ? "Agent payout filter"
                            : filter.type === "merchant"
                              ? "Merchant billing filter"
                              : "Payment status filter"
                    }
                  >
                    {visiblePayFilters.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`org-architecture__pane-icon-btn org-architecture__pane-icon-btn--pay-${item.id}${
                          filter.pay === item.id ? " is-active" : ""
                        }`}
                        aria-pressed={filter.pay === item.id}
                        title={item.title}
                        aria-label={item.title}
                        onClick={() =>
                          setFilter((f) => {
                            const nextPay = item.id;
                            if (accountsView !== "tree") {
                              return {
                                ...f,
                                pay: nextPay,
                                status: "all",
                              };
                            }
                            let nextType: OrgTreeFilter["type"] = "all";
                            if (
                              nextPay === "overdue" ||
                              nextPay === "issued"
                            ) {
                              nextType = "merchant";
                            } else if (
                              nextPay === "pending" ||
                              nextPay === "scheduled"
                            ) {
                              nextType = "agent";
                            } else if (nextPay === "paid") {
                              nextType =
                                f.type === "merchant" || f.type === "agent"
                                  ? f.type
                                  : "all";
                            }
                            return {
                              ...f,
                              pay: nextPay,
                              status: "all",
                              type: nextType,
                            };
                          })
                        }
                      >
                        <PayFilterIcon id={item.id} />
                      </button>
                    ))}
                  </div>
                ) : null}
                <div
                  className="org-architecture__pane-tree-btns"
                  role="group"
                  aria-label="Tree expand collapse"
                >
                  <button
                    type="button"
                    className="org-architecture__pane-icon-btn"
                    onClick={expandAll}
                    title="Expand all"
                    aria-label="Expand all"
                  >
                    <TreeExpandIcon />
                  </button>
                  <button
                    type="button"
                    className="org-architecture__pane-icon-btn"
                    onClick={collapseAll}
                    title={
                      selectedId
                        ? "Collapse all except the selected branch"
                        : "Collapse all"
                    }
                    aria-label="Collapse all"
                  >
                    <TreeCollapseIcon />
                  </button>
                </div>
                {canManage ? (
                  <PaneOnboardMenu preferMerchant={accountsView === "merchants"} />
                ) : null}
              </div>
            </header>
            <div
              ref={treeRef}
              className="org-architecture__tree-scroll"
              role="tree"
              tabIndex={0}
              aria-label={
                accountsView === "agents"
                  ? "Agents hierarchy"
                  : accountsView === "merchants"
                    ? "Merchants hierarchy"
                    : "Org hierarchy"
              }
              aria-activedescendant={
                selectedId ? `org-tree-${selectedId}` : undefined
              }
              onKeyDown={onTreeKeyDown}
            >
              {loading ? (
                <PagePending />
              ) : filteredRoots.length === 0 ? (
                <div className="org-architecture__empty">
                  <p className="org-architecture__empty-title">No matches</p>
                  <p>Try clearing filters or broadening your search.</p>
                </div>
              ) : (
                filteredRoots.map((node) => (
                  <OrgTreeItem
                    key={node.id}
                    node={node}
                    depth={0}
                    expanded={expanded}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    onToggle={onToggle}
                    budgets={treeBudgets}
                  />
                ))
              )}
            </div>
          </section>

          <aside className="org-architecture__detail-pane" aria-label="Account detail">
            <div className="org-architecture__detail-scroll">
              {selectedNode &&
              (selectedNode.type === "agent" ||
                selectedNode.type === "agent_sub") &&
              orgs.some((o) => o.id === selectedNode.id) ? (
                <AgentDetailCard
                  org={orgs.find((o) => o.id === selectedNode.id)!}
                  orgs={orgs}
                  canManage={canManage}
                  busy={busy}
                  onPause={() => setSuspendTarget(selectedNode)}
                  onRun={() => void onSetStatus(selectedNode, "active")}
                  onDelete={() => openDelete(selectedNode)}
                  onOrgPatched={(next) => {
                    setOrgs((prev) => {
                      const updated = prev.map((o) =>
                        o.id === next.id ? { ...o, ...next } : o,
                      );
                      setForest(buildPlatformOrgForest(updated));
                      return updated;
                    });
                  }}
                />
              ) : selectedNode &&
                selectedNode.type === "merchant" &&
                orgs.some((o) => o.id === selectedNode.id) ? (
                <MerchantDetailCard
                  org={orgs.find((o) => o.id === selectedNode.id)!}
                  orgs={orgs}
                  session={session}
                  canManage={canManage}
                  busy={busy}
                  initialTab={
                    merchantTab === "overview" ||
                    merchantTab === "sites" ||
                    merchantTab === "settlement" ||
                    merchantTab === "service-bills" ||
                    merchantTab === "compliance"
                      ? merchantTab
                      : undefined
                  }
                  onPause={() => setSuspendTarget(selectedNode)}
                  onRun={() => void onSetStatus(selectedNode, "active")}
                  onDelete={() => openDelete(selectedNode)}
                  onOrgPatched={(next) => {
                    setOrgs((prev) => {
                      const updated = prev.map((o) =>
                        o.id === next.id ? { ...o, ...next } : o,
                      );
                      setForest(buildPlatformOrgForest(updated));
                      return updated;
                    });
                  }}
                />
              ) : selectedNode ? (
                <OrgTreeDetail
                  node={selectedNode}
                  byId={forest.byId}
                  ownerEmailByOrgId={ownerEmailByOrgId}
                  canManage={canManage}
                  busy={busy}
                  platformStats={
                    selectedNode.type === "platform" ? forest.stats : null
                  }
                  budgets={
                    selectedNode.type === "platform" ? treeBudgets : null
                  }
                  filter={filter}
                  onFilter={(next) =>
                    setFilter((f) => ({
                      ...f,
                      type: next.type,
                      status: next.status,
                      pay: next.pay,
                    }))
                  }
                  onSuspend={() => setSuspendTarget(selectedNode)}
                  onRun={() => void onSetStatus(selectedNode, "active")}
                  onDelete={() => openDelete(selectedNode)}
                />
              ) : (
                <div className="org-architecture__detail-empty">
                  <p className="org-architecture__empty-title">No selection</p>
                  <p>
                    Select an account in the tree to manage details, fees, and
                    commissions.
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {suspendTarget ? (
        <SuspendOrgModal
          orgName={suspendTarget.name}
          busy={busy}
          error={suspendError}
          onClose={() => {
            if (!busy) {
              setSuspendTarget(null);
              setSuspendError(null);
            }
          }}
          onConfirm={(reason) => void confirmSuspend(reason)}
        />
      ) : null}

      {deleteTarget ? (
        <OrgDeleteConfirmModal
          orgId={deleteTarget.id}
          orgName={deleteTarget.name}
          busy={deleteBusy}
          error={deleteError}
          preview={deletePreview}
          previewLoading={deletePreviewLoading}
          onClose={closeDelete}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </div>
  );
}

/** @deprecated Prefer AccountsPage — kept for lazy import compatibility. */
export const ArchitecturePage = AccountsPage;
