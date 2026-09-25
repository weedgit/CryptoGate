import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
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
import { SiteDetailCard } from "./SiteDetailCard";
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
import { SearchableSelect } from "../ui/SearchableSelect";
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
import type { OnboardNavigateState } from "../shared/onboardInviteState";
import { GateLogoMark } from "../auth/GateLogoMark";
import { AccountsDetailHero } from "./AccountsDetailHero";
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

function CtxPlusIcon() {
  return (
    <span className="org-architecture__ctx-icon org-architecture__ctx-icon--add" aria-hidden>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function CtxPauseIcon() {
  return (
    <span className="org-architecture__ctx-icon org-architecture__ctx-icon--suspend" aria-hidden>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
        <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
        <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
      </svg>
    </span>
  );
}

function CtxPlayIcon() {
  return (
    <span className="org-architecture__ctx-icon org-architecture__ctx-icon--active" aria-hidden>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
        <path d="M8 5.5v13l11-6.5L8 5.5Z" fill="currentColor" />
      </svg>
    </span>
  );
}

function CtxTrashIcon() {
  return (
    <span className="org-architecture__ctx-icon org-architecture__ctx-icon--danger" aria-hidden>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path
          d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12"
          stroke="currentColor"
          strokeWidth="1.85"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function RefreshIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3L20 9.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 4.5v5h-5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3L4 14.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 19.5v-5h5"
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
  Country: "Country is set in organization settings after invite.",
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
  if (type === "agent") return "agent";
  if (type === "merchant_site") return "site";
  return "merchant";
}

function treeBadgeIcon(type: string): string {
  if (type === "platform") return "P";
  if (type === "agent") return "A";
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
  if (status === "paid") return "PAID";
  if (status === "pending") return "PENDING";
  return "SCHEDULED";
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

type DetailTableCell = {
  label: string;
  value: number;
  accent?: DetailAccent;
  critical?: boolean;
  active?: boolean;
  onClick?: () => void;
};

function PlatformDetailTableIcon({ tone }: { tone: DetailAccent }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (tone === "ok" || tone === "teal") {
    /* Agents — people */
    return (
      <svg {...common}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }
  if (tone === "violet") {
    /* Merchants — storefront */
    return (
      <svg {...common}>
        <path d="M3 9 12 3l9 6" />
        <path d="M5 10v10h14V10" />
        <path d="M9 20v-6h6v6" />
      </svg>
    );
  }
  /* Accounts — single user */
  return (
    <svg {...common}>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

function PlatformDetailTable({
  title,
  tone = "gold",
  ariaLabel,
  onViewDetails,
  columns,
}: {
  title: string;
  tone?: DetailAccent;
  ariaLabel: string;
  onViewDetails: () => void;
  columns: DetailTableCell[];
}) {
  return (
    <section
      className={`platform-detail__table-block is-${tone}`}
      aria-label={ariaLabel}
    >
      <div className="platform-detail__table-head">
        <div className="platform-detail__table-title">
          <span className="platform-detail__table-icon" aria-hidden>
            <PlatformDetailTableIcon tone={tone} />
          </span>
          <h4 className="platform-detail__section-title">{title}</h4>
        </div>
        <button
          type="button"
          className="platform-detail__band-link"
          onClick={onViewDetails}
        >
          View details
          <span aria-hidden>→</span>
        </button>
      </div>
      <table className="platform-detail__table">
        <tbody>
          {columns.map((col) => {
            const accent = col.accent ?? "slate";
            const critical = Boolean(col.critical && col.value > 0);
            const clickable = Boolean(col.onClick);
            return (
              <tr
                key={col.label}
                className={[
                  "platform-detail__tr",
                  `is-${accent}`,
                  col.active ? "is-active" : "",
                  critical ? "is-critical" : "",
                  col.value === 0 ? "is-quiet" : "",
                  clickable ? "is-clickable" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={clickable ? col.onClick : undefined}
                onKeyDown={
                  clickable
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          col.onClick?.();
                        }
                      }
                    : undefined
                }
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                aria-pressed={clickable ? col.active === true : undefined}
              >
                <th scope="row">{col.label}</th>
                <td>{col.value.toLocaleString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function DetailOnboardMenu({ disabled = false }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = "platform-detail-onboard-menu";

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

  return (
    <div
      ref={rootRef}
      className={`pg-dash__onboard-wrap${open ? " is-open" : ""}`}
    >
      <button
        type="button"
        className="pg-dash__onboard"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <svg
          className="pg-dash__onboard-icon"
          viewBox="0 0 24 24"
          width="15"
          height="15"
          fill="none"
          aria-hidden
        >
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        Onboard
        <svg
          className="pg-dash__onboard-chevron"
          viewBox="0 0 10 6"
          width="10"
          height="6"
          fill="none"
          aria-hidden
        >
          <path
            d="M1 1l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open ? (
        <ul id={menuId} className="pg-dash__onboard-menu" role="menu">
          <li role="none">
            <Link
              role="menuitem"
              className="pg-dash__onboard-option"
              to={platformRoute("agents/new")}
              onClick={() => setOpen(false)}
            >
              New Agent
            </Link>
          </li>
          <li role="none">
            <Link
              role="menuitem"
              className="pg-dash__onboard-option"
              to={platformRoute("merchants/new")}
              onClick={() => setOpen(false)}
            >
              New Merchant
            </Link>
          </li>
        </ul>
      ) : null}
    </div>
  );
}

function PlatformDetailPanel({
  node,
  byId,
  budgets,
  platformStats,
  cashierCount,
  filter,
  canManage,
  busy,
  onFilter,
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
  cashierCount: number;
  filter: OrgTreeFilter;
  canManage: boolean;
  busy: boolean;
  onFilter: (next: PlatformMetricFilter) => void;
}) {
  const teamHref = platformRoute("settings/team");

  const metrics = useMemo(() => {
    let active = 0;
    const agentIds: string[] = [];
    const merchantIds: string[] = [];
    for (const org of byId.values()) {
      if (org.type === "platform") continue;
      if (org.status === "active") active += 1;
      if (org.type === "agent") agentIds.push(org.id);
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


  return (
    <div className="platform-detail">
      <AccountsDetailHero
        eyebrow="Platform"
        title={node.name}
        subtitle="Network overview — filter the org tree from these metrics."
        mark={
          <GateLogoMark size={88} className="platform-detail__mark" alt="" />
        }
        actions={
          <>
            {canManage ? <DetailOnboardMenu disabled={busy} /> : null}
            <Link
              className="platform-detail__team-link"
              to={teamHref}
              title="Open platform team"
            >
              Team
              <span aria-hidden>→</span>
            </Link>
          </>
        }
      />

      <div className="platform-detail__body">
        <PlatformDetailTable
          title="Accounts"
          tone="blue"
          ariaLabel="Accounts"
          onViewDetails={() => onFilter({ type: "all", status: "all", pay: "all" })}
          columns={[
            {
              label: "Total",
              value: Math.max(0, metrics.all),
              accent: "gold",
              active: networkActive({ type: "all", status: "all", pay: "all" }),
              onClick: () => onFilter({ type: "all", status: "all", pay: "all" }),
            },
            {
              label: "Active",
              value: metrics.active,
              accent: "ok",
              active: networkActive({ type: "all", status: "active", pay: "all" }),
              onClick: () => onFilter({ type: "all", status: "active", pay: "all" }),
            },
            {
              label: "Paused",
              value: metrics.paused,
              accent: "slate",
              active: networkActive({ type: "all", status: "paused", pay: "all" }),
              onClick: () => onFilter({ type: "all", status: "paused", pay: "all" }),
            },
            {
              label: "Sites",
              value: metrics.sites,
              accent: "violet",
              active: networkActive({ type: "site", status: "all", pay: "all" }),
              onClick: () => onFilter({ type: "site", status: "all", pay: "all" }),
            },
            {
              label: "Cashiers",
              value: Math.max(0, cashierCount),
              accent: "slate",
            },
          ]}
        />

        <PlatformDetailTable
          title="Agents"
          tone="ok"
          ariaLabel="Agents"
          onViewDetails={() => onFilter({ type: "agent", status: "all", pay: "all" })}
          columns={[
            {
              label: "Agents",
              value: metrics.agents,
              accent: "teal",
              active: networkActive({ type: "agent", status: "all", pay: "all" }),
              onClick: () => onFilter({ type: "agent", status: "all", pay: "all" }),
            },
            {
              label: "Paid",
              value: metrics.agentPay.paid ?? 0,
              accent: "ok",
              active: networkActive({ type: "agent", status: "all", pay: "paid" }),
              onClick: () => onFilter({ type: "agent", status: "all", pay: "paid" }),
            },
            {
              label: "Pending",
              value: metrics.agentPay.pending ?? 0,
              accent: "warn",
              active: networkActive({ type: "agent", status: "all", pay: "pending" }),
              onClick: () => onFilter({ type: "agent", status: "all", pay: "pending" }),
            },
            {
              label: "Scheduled",
              value: metrics.agentPay.scheduled ?? 0,
              accent: "slate",
              active: networkActive({ type: "agent", status: "all", pay: "scheduled" }),
              onClick: () => onFilter({ type: "agent", status: "all", pay: "scheduled" }),
            },
          ]}
        />

        <PlatformDetailTable
          title="Merchants"
          tone="violet"
          ariaLabel="Merchants"
          onViewDetails={() => onFilter({ type: "merchant", status: "all", pay: "all" })}
          columns={[
            {
              label: "Merchants",
              value: metrics.merchants,
              accent: "blue",
              active: networkActive({ type: "merchant", status: "all", pay: "all" }),
              onClick: () => onFilter({ type: "merchant", status: "all", pay: "all" }),
            },
            {
              label: "Paid",
              value: metrics.merchantPay.paid ?? 0,
              accent: "ok",
              active: networkActive({ type: "merchant", status: "all", pay: "paid" }),
              onClick: () => onFilter({ type: "merchant", status: "all", pay: "paid" }),
            },
            {
              label: "Overdue",
              value: metrics.merchantPay.overdue ?? 0,
              accent: "danger",
              critical: true,
              active: networkActive({ type: "merchant", status: "all", pay: "overdue" }),
              onClick: () => onFilter({ type: "merchant", status: "all", pay: "overdue" }),
            },
            {
              label: "Issued",
              value: metrics.merchantPay.issued ?? 0,
              accent: "blue",
              active: networkActive({ type: "merchant", status: "all", pay: "issued" }),
              onClick: () => onFilter({ type: "merchant", status: "all", pay: "issued" }),
            },
          ]}
        />

      </div>
    </div>
  );
}

/** Org tree geometry — must match merchant.css (.b3-accounts__row / guides). */
const TREE_PAD = 10;
const TREE_GUIDE = 16;
const TREE_CHEVRON_HALF = 10;

/**
 * Caret center X for a row at `depth`.
 * Guides take `depth * GUIDE` after pad; chevron follows with no gap so the
 * child caret sits on the parent rail (not under the parent badge).
 */
function treeCaretX(depth: number): number {
  return TREE_PAD + depth * TREE_GUIDE + TREE_CHEVRON_HALF;
}

function OrgTreeItem({
  node,
  depth,
  ancestors = [],
  isLast = true,
  expanded,
  selectedId,
  onSelect,
  onToggle,
  budgets,
  canManage,
  busy,
  onSuspend,
  onActivate,
  onDelete,
}: {
  node: PlatformOrgTreeNode;
  depth: number;
  /** Vertical guide columns for levels above this node (length === max(0, depth - 1)). */
  ancestors?: boolean[];
  isLast?: boolean;
  expanded: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  budgets: TreeRowBudgets;
  canManage: boolean;
  busy: boolean;
  onSuspend: (node: PlatformOrgTreeNode) => void;
  onActivate: (node: PlatformOrgTreeNode) => void;
  onDelete: (node: PlatformOrgTreeNode) => void;
}) {
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const isSelected = selectedId === node.id;
  const isPaused = node.status === "paused";
  const isAgent = node.type === "agent";
  const isMerchant = node.type === "merchant";
  const canOnboard = canManage && orgCanAddChild(node.type);
  const canLifecycle = canManage && node.type !== "platform" && node.type !== "merchant_site";
  const hasMenu = canOnboard || canLifecycle;
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

  const closeMenu = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (!menu) return;
    // Defer close listeners so the opening right-click doesn't immediately dismiss.
    const timer = window.setTimeout(() => {
      const onDoc = (event: MouseEvent) => {
        if (!(event.target instanceof Node)) return;
        if (!menuRef.current?.contains(event.target)) closeMenu();
      };
      const onKey = (event: globalThis.KeyboardEvent) => {
        if (event.key === "Escape") closeMenu();
      };
      const onScroll = () => closeMenu();
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("keydown", onKey);
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", onScroll);
      closeCleanup = () => {
        document.removeEventListener("mousedown", onDoc);
        document.removeEventListener("keydown", onKey);
        window.removeEventListener("scroll", onScroll, true);
        window.removeEventListener("resize", onScroll);
      };
    }, 0);
    let closeCleanup: (() => void) | undefined;
    return () => {
      window.clearTimeout(timer);
      closeCleanup?.();
    };
  }, [menu, closeMenu]);

  const caretX = treeCaretX(depth);
  const parentDepth = depth - 1;
  const parentRailX = depth > 0 ? treeCaretX(parentDepth) : TREE_PAD + TREE_CHEVRON_HALF;
  const forkGuideStart = TREE_PAD + Math.max(0, parentDepth) * TREE_GUIDE;
  const forkLeft = depth > 0 ? parentRailX - forkGuideStart : TREE_CHEVRON_HALF;
  const forkWidth = depth > 0 ? caretX - parentRailX : 0;

  const onboardHref =
    node.type === "platform"
      ? withReturnTo(platformRoute("agents/new"))
      : isAgent
        ? withReturnTo(
            `${platformRoute("merchants/new")}?parentId=${encodeURIComponent(node.id)}`,
          )
        : isMerchant || node.type === "merchant_site"
          ? withReturnTo(
              `${platformRoute("sites/new")}?parentId=${encodeURIComponent(node.id)}`,
            )
          : null;
  const onboardLabel =
    node.type === "platform"
      ? "New Agent"
      : isAgent
        ? "New Merchant"
        : isMerchant || node.type === "merchant_site"
          ? "New Site"
          : "New";

  const menuStyle = menu
    ? (() => {
        const pad = 8;
        const w = 188;
        const h =
          canOnboard && canLifecycle
            ? 220
            : canOnboard || canLifecycle
              ? 168
              : 120;
        const x = Math.min(menu.x, window.innerWidth - w - pad);
        const y = Math.min(menu.y, window.innerHeight - h - pad);
        return {
          position: "fixed",
          left: Math.max(pad, x),
          top: Math.max(pad, y),
          zIndex: 1200,
        } as CSSProperties;
      })()
    : undefined;

  return (
    <div
      id={`org-tree-${node.id}`}
      className={`b3-accounts__node${hasChildren && isOpen ? " is-open" : ""}`}
      role="treeitem"
      aria-expanded={hasChildren ? isOpen : undefined}
      aria-selected={isSelected}
      data-org-id={node.id}
    >
      <div
        className={`b3-accounts__row org-architecture__row${isSelected ? " is-selected" : ""}${
          node.type === "merchant_site" ? " is-site" : ""
        }${isPaused ? " is-paused" : ""}`}
        style={
          {
            ["--tree-stem-x"]: `${caretX}px`,
            ["--tree-guide-w"]: `${TREE_GUIDE}px`,
            ["--tree-fork-left"]: `${forkLeft}px`,
            ["--tree-fork-width"]: `${forkWidth}px`,
          } as CSSProperties
        }
        onClick={select}
        onDoubleClick={(e) => {
          e.preventDefault();
          toggle();
        }}
        onContextMenu={(e) => {
          if (!hasMenu) return;
          e.preventDefault();
          e.stopPropagation();
          select();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        role="presentation"
      >
        {depth > 0 ? (
          <span className="b3-accounts__guides" aria-hidden>
            {ancestors.map((show, index) => (
              <span
                key={`a-${index}`}
                className={`b3-accounts__guide${show ? " is-line" : ""}`}
              />
            ))}
            <span
              className={`b3-accounts__guide is-fork${isLast ? " is-last" : ""}`}
            />
          </span>
        ) : null}
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
              {isPaused ? "PAUSED" : "ACTIVE"}
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
      {hasChildren && isOpen ? (
        <div
          className="b3-accounts__children"
          style={
            {
              /* Align continuous rail with this node's caret (includes row gap). */
              ["--tree-line-x"]: `${caretX}px`,
            } as CSSProperties
          }
        >
          {node.children.map((child, index) => (
            <OrgTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              ancestors={depth > 0 ? [...ancestors, !isLast] : []}
              isLast={index === node.children.length - 1}
              expanded={expanded}
              selectedId={selectedId}
              onSelect={onSelect}
              onToggle={onToggle}
              budgets={budgets}
              canManage={canManage}
              busy={busy}
              onSuspend={onSuspend}
              onActivate={onActivate}
              onDelete={onDelete}
            />
          ))}
        </div>
      ) : null}
      {menu && hasMenu
        ? createPortal(
            <div
              ref={menuRef}
              className="org-architecture__ctx-menu"
              style={menuStyle}
              role="menu"
              aria-label={`${node.name} actions`}
            >
              {canOnboard && onboardHref ? (
                <button
                  type="button"
                  role="menuitem"
                  className="org-architecture__ctx-item"
                  disabled={busy}
                  onClick={() => {
                    closeMenu();
                    navigate(onboardHref);
                  }}
                >
                  <CtxPlusIcon />
                  <span className="org-architecture__ctx-copy">
                    <span className="org-architecture__ctx-label">{onboardLabel}</span>
                  </span>
                </button>
              ) : null}
              {canOnboard && node.type === "platform" ? (
                <button
                  type="button"
                  role="menuitem"
                  className="org-architecture__ctx-item"
                  disabled={busy}
                  onClick={() => {
                    closeMenu();
                    navigate(withReturnTo(platformRoute("merchants/new")));
                  }}
                >
                  <CtxPlusIcon />
                  <span className="org-architecture__ctx-copy">
                    <span className="org-architecture__ctx-label">New Merchant</span>
                  </span>
                </button>
              ) : null}
              {canOnboard && canLifecycle ? (
                <div className="org-architecture__ctx-sep" role="separator" />
              ) : null}
              {canLifecycle ? (
                isPaused ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="org-architecture__ctx-item org-architecture__ctx-item--active"
                    disabled={busy}
                    onClick={() => {
                      closeMenu();
                      onActivate(node);
                    }}
                  >
                    <CtxPlayIcon />
                    <span className="org-architecture__ctx-copy">
                      <span className="org-architecture__ctx-label">Active</span>
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    className="org-architecture__ctx-item org-architecture__ctx-item--suspend"
                    disabled={busy}
                    onClick={() => {
                      closeMenu();
                      onSuspend(node);
                    }}
                  >
                    <CtxPauseIcon />
                    <span className="org-architecture__ctx-copy">
                      <span className="org-architecture__ctx-label">Suspend</span>
                    </span>
                  </button>
                )
              ) : null}
              {canLifecycle ? (
                <>
                  <div className="org-architecture__ctx-sep" role="separator" />
                  <button
                    type="button"
                    role="menuitem"
                    className="org-architecture__ctx-item org-architecture__ctx-item--danger"
                    disabled={busy}
                    onClick={() => {
                      closeMenu();
                      onDelete(node);
                    }}
                  >
                    <CtxTrashIcon />
                    <span className="org-architecture__ctx-copy">
                      <span className="org-architecture__ctx-label">Delete</span>
                      <span className="org-architecture__ctx-hint">
                        This action cannot be undone.
                      </span>
                    </span>
                  </button>
                </>
              ) : null}
            </div>,
            document.body,
          )
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
  cashierCount,
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
  cashierCount?: number;
  budgets?: TreeRowBudgets | null;
  filter?: OrgTreeFilter;
  onFilter?: (next: PlatformMetricFilter) => void;
  onSuspend: () => void;
  onRun: () => void;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  const counts = childTypeCounts(node);
  const detailHref = orgDetailHref(node.type, node.id, node.parentId);
  const detailLabel = orgDetailLabel(node.type);
  const canAdd = orgCanAddChild(node.type);
  const breadcrumb = orgBreadcrumbPath(node.id, byId);
  const ownerEmail = ownerEmailByOrgId.get(node.id) ?? null;
  const isPaused = node.status === "paused";
  const canDelete = node.type !== "platform";
  const showActions = canManage && (canAdd || canDelete);
  const isAgentParent = node.type === "agent";
  const isAgent = isAgentParent;
  const isMerchant = node.type === "merchant";
  const isPlatform = node.type === "platform";
  const parentNode = node.parentId ? byId.get(node.parentId) : undefined;
  const ops = useOrgTreeOpsExtras(node);
  const onboardHref = isAgentParent
    ? withReturnTo(
        `${platformRoute("merchants/new")}?parentId=${encodeURIComponent(node.id)}`,
      )
    : isMerchant || node.type === "merchant_site"
      ? withReturnTo(
          `${platformRoute("sites/new")}?parentId=${encodeURIComponent(node.id)}`,
        )
      : orgAddChildHref(node.type)
        ? withReturnTo(orgAddChildHref(node.type)!)
        : null;
  const onboardLabel = isAgentParent
    ? "New Merchant"
    : isMerchant || node.type === "merchant_site"
      ? "New Site"
      : "New Agent";

  if (isPlatform && platformStats && budgets && filter && onFilter) {
    return (
      <PlatformDetailPanel
        node={node}
        byId={byId}
        budgets={budgets}
        platformStats={platformStats}
        cashierCount={cashierCount ?? 0}
        filter={filter}
        canManage={canManage}
        busy={busy}
        onFilter={onFilter}
      />
    );
  }

  const contactRows = [
    {
      label: "Registered",
      value: formatOnboardDate(node.createdAt),
      always: true,
    },
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
              {canAdd && onboardHref ? (
                <button
                  type="button"
                  className="org-architecture__action org-architecture__action--add"
                  disabled={busy}
                  onClick={() => navigate(onboardHref)}
                >
                  {onboardLabel}
                </button>
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
          ) : null}
          {isMerchant ? (
            <>
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

  const onboardState = (location.state ?? {}) as OnboardNavigateState;
  const inviteCredsFor = (orgId: string) =>
    onboardState.onboardedOrgId === orgId ? (onboardState.inviteCreds ?? null) : null;

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
  const [cashierCount, setCashierCount] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [suspendTarget, setSuspendTarget] = useState<PlatformOrgTreeNode | null>(
    null,
  );
  const [suspendError, setSuspendError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"ok" | "error">("ok");
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
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
      setCashierCount(
        emailRows.reduce((sum, row) => sum + (row.cashierCount ?? 0), 0),
      );
      setLastUpdatedAt(Date.now());
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
      setLastUpdatedAt(Date.now());
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
      setCashierCount(
        emailRows.reduce((sum, row) => sum + (row.cashierCount ?? 0), 0),
      );
      setLastUpdatedAt(Date.now());
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
      if (org.type === "agent") {
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
        if (node.type === "agent") {
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

  const agentFootCount = useMemo(() => {
    let n = 0;
    const walk = (nodes: PlatformOrgTreeNode[]) => {
      for (const node of nodes) {
        if (node.type === "agent") n += 1;
        if (node.children.length) walk(node.children);
      }
    };
    walk(filteredRoots);
    return n;
  }, [filteredRoots]);

  const lastUpdatedLabel = useMemo(() => {
    if (lastUpdatedAt == null) return "—";
    const sec = Math.max(0, Math.floor((Date.now() - lastUpdatedAt) / 1000));
    if (sec < 15) return "just now";
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    return `${Math.floor(min / 60)}h ago`;
  }, [lastUpdatedAt, loading]);

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
    if (selectedRouteId && ids.includes(selectedRouteId)) return;
    if (selectedId != null && ids.includes(selectedId)) return;
    onSelect(filteredRoots[0]!.id);
  }, [accountsView, filteredRoots, selectedId, selectedRouteId, onSelect]);

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
            <label className="topbar-search">
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
                className="topbar-search__input"
                type="search"
                placeholder={
                  accountsView === "agents"
                    ? "Search agents…"
                    : accountsView === "merchants"
                      ? "Search merchants…"
                      : "Search accounts, merchants, or agents…"
                }
                value={filter.query}
                onChange={(e) =>
                  setFilter((f) => ({ ...f, query: e.target.value }))
                }
                aria-label="Filter org tree"
                autoComplete="off"
                spellCheck={false}
              />
            </label>,
            topbarSlot,
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
                <div className="org-architecture__pane-title-row">
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
              </div>
              <div className="org-architecture__pane-toolbar">
                <div className="org-architecture__pane-filter">
                  <SearchableSelect
                    value={filter.status}
                    options={STATUS_FILTERS}
                    allowEmpty={false}
                    menuMinWidth={128}
                    ariaLabel="Status filter"
                    onChange={(id) => {
                      const status = id as OrgTreeFilter["status"];
                      setFilter((f) => ({
                        ...f,
                        status,
                        pay: status === "all" ? f.pay : "all",
                      }));
                    }}
                  />
                </div>
                {visiblePayFilters.length > 0 ? (
                  <div className="org-architecture__pane-filter">
                    <SearchableSelect
                      value={filter.pay}
                      options={visiblePayFilters.map((item) => ({
                        id: item.id,
                        label: item.label,
                      }))}
                      allowEmpty={false}
                      menuMinWidth={160}
                      ariaLabel={
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
                      onChange={(id) => {
                        const nextPay = id as OrgTreeFilter["pay"];
                        setFilter((f) => {
                          if (accountsView !== "tree") {
                            return {
                              ...f,
                              pay: nextPay,
                              status: "all",
                            };
                          }
                          let nextType: OrgTreeFilter["type"] = "all";
                          if (nextPay === "overdue" || nextPay === "issued") {
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
                        });
                      }}
                    />
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
                    onClick={() => void load()}
                    disabled={loading}
                    title="Refresh org list"
                    aria-label="Refresh org list"
                  >
                    <RefreshIcon />
                  </button>
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
                    canManage={canManage}
                    busy={busy}
                    onSuspend={(n) => setSuspendTarget(n)}
                    onActivate={(n) => void onSetStatus(n, "active")}
                    onDelete={(n) => openDelete(n)}
                  />
                ))
              )}
            </div>
            <footer className="org-architecture__tree-foot">
              <span className="org-architecture__tree-foot-summary">
                {loading
                  ? "Loading accounts…"
                  : accountsView === "agents"
                    ? `Showing ${visibleCount.toLocaleString()} agent${visibleCount === 1 ? "" : "s"}`
                    : accountsView === "merchants"
                      ? `Showing ${visibleCount.toLocaleString()} merchant${visibleCount === 1 ? "" : "s"}`
                      : `Showing ${visibleCount.toLocaleString()} account${visibleCount === 1 ? "" : "s"} across ${agentFootCount.toLocaleString()} agent${agentFootCount === 1 ? "" : "s"}`}
              </span>
              <span className="org-architecture__tree-foot-live">
                <span className="org-architecture__live-dot" aria-hidden />
                Last updated {lastUpdatedLabel}
              </span>
            </footer>
          </section>

          <aside className="org-architecture__detail-pane" aria-label="Account detail">
            <div className="org-architecture__detail-scroll">
              {selectedNode &&
              selectedNode.type === "agent" &&
              orgs.some((o) => o.id === selectedNode.id) ? (
                <AgentDetailCard
                  org={orgs.find((o) => o.id === selectedNode.id)!}
                  orgs={orgs}
                  session={session}
                  canManage={canManage}
                  busy={busy}
                  invitationSent={onboardState.invitationSent === true}
                  inviteCreds={inviteCredsFor(selectedNode.id)}
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
                  inviteCreds={inviteCredsFor(selectedNode.id)}
                  initialTab={
                    merchantTab === "overview" ||
                    merchantTab === "team" ||
                    merchantTab === "cashiers" ||
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
              ) : selectedNode &&
                selectedNode.type === "merchant_site" &&
                orgs.some((o) => o.id === selectedNode.id) ? (
                <SiteDetailCard
                  org={orgs.find((o) => o.id === selectedNode.id)!}
                  orgs={orgs}
                  session={session}
                  canManage={canManage}
                  busy={busy}
                  inviteCreds={inviteCredsFor(selectedNode.id)}
                  initialTab={
                    merchantTab === "overview" ||
                    merchantTab === "team" ||
                    merchantTab === "cashiers"
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
                  cashierCount={
                    selectedNode.type === "platform" ? cashierCount : undefined
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
