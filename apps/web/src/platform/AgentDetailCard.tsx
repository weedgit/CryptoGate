import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  getOrgOverview,
  listOrders,
  listOrgUsers,
  listServiceBills,
  SERVICE_BILLS_LIST_LIMIT,
  getMatchingMode,
  getMerchantCommercial,
  getAgentPayout,
  listSettlement,
  putAgentCommission,
  type AgentCommissionSettings,
  type AgentPayoutAddress,
  type AuditLogEntry,
  type OrgAccount,
  type OrgMember,
  type PaymentOrder,
  type ServiceBill,
} from "./api";
import { merchantsInAgentSubtree, merchantOrgIdsInAgentSubtree, subAgentsUnderAgent } from "./agentSubtree";
import { formatShortDate, orgTypeLabel } from "./org";
import { FundAmount } from "./FundAmount";
import {
  buildAgentAccountsForest,
  countAccountTreeNodes,
  formatOnboardDate,
  mergeActivityFeed,
  mergeCommissionHistory,
  mergeServiceBillsWithSeeds,
  merchantBillingPeriodStartMs,
  PREVIEW_COMMISSION_LIMIT,
  PREVIEW_SERVICE_BILLS_LIMIT,
  RECENT_ACTIVITY_LIMIT,
  agentCommissionMtd,
  agentSubtreePlatformFeeMtd,
  agentSubtreeVolumeMtd,
  DEFAULT_AGENT_COMMISSION_PERCENT,
  truncateAddress,
  type AccountTreeNode,
} from "./orgDetailSeeds";
import { matchingModeLabel } from "../merchant/matchingLabels";
import { tierLabel } from "../commercialLabels";
import {
  formatBillId,
  serviceBillStatusLabel,
  serviceBillStatusTone,
} from "./serviceBillStatus";
import { PlatformPending } from "./ui/PlatformPending";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "accounts", label: "Accounts" },
  { id: "service-bills", label: "Service Bills" },
  { id: "commission", label: "Commissions" },
  { id: "team", label: "Team" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const AUDIT_LABEL: Record<string, string> = {
  login: "Sign-in",
  org_create: "Org created",
  org_status: "Status changed",
  org_user_invite: "Team invite",
  service_bill_issue: "Service bill issued",
  service_bill_mark_paid: "Bill marked paid",
  service_bill_void: "Bill voided",
  service_bill_adjust: "Bill adjusted",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase() || "AG";
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

function KpiHelp({ text }: { text: string }) {
  return (
    <span className="plat-card-help plat-card-help--corner">
      <button type="button" className="plat-card-help__btn" aria-label={text}>
        ?
      </button>
      <span className="plat-card-help__tip" role="tooltip">
        {text}
      </span>
    </span>
  );
}

const KPI_HELP = {
  merchants:
    "Merchant accounts in this agent’s subtree (including merchants under sub-agents). Sites are not counted here.",
  volumeMtd:
    "Confirmed payment-order volume from the 1st of this month through today, across the agent subtree.",
  commissionMtd:
    "Agent commission accrued month-to-date: share of platform fee collected from the subtree. Paid by CryptoGate on the monthly statement — not taken from payer on-chain payments.",
} as const;

function AgentTabEmpty({
  icon,
  title,
  copy,
  hints,
}: {
  icon: "accounts" | "bills" | "commission";
  title: string;
  copy: string;
  hints?: string[];
}) {
  return (
    <div className="b3-agent-detail__empty">
      <div className="b3-agent-detail__empty-mark" aria-hidden>
        {icon === "accounts" ? (
          <svg viewBox="0 0 48 48" width="36" height="36" fill="none">
            <circle cx="24" cy="12" r="5" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="12" cy="34" r="5" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="36" cy="34" r="5" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M24 17v8M19 26 12 29M29 26l7 3"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        ) : icon === "bills" ? (
          <svg viewBox="0 0 48 48" width="36" height="36" fill="none">
            <path
              d="M14 8h20l6 6v26a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path d="M34 8v6h6" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M18 22h16M18 28h12"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 48 48" width="36" height="36" fill="none">
            <path
              d="M8 34V18l16-8 16 8v16"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M16 34V24l8-4 8 4v10"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
              opacity="0.55"
            />
            <path
              d="M24 10v6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>
      <p className="b3-agent-detail__empty-title">{title}</p>
      <p className="b3-agent-detail__empty-copy">{copy}</p>
      {hints && hints.length > 0 ? (
        <ul className="b3-agent-detail__empty-hints">
          {hints.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function structureDisplay(structure: string | null | undefined): string {
  if (!structure) return "—";
  if (structure === "single_location") return "Single location";
  if (structure === "multi_location") return "Multi-location";
  return structure.replace(/_/g, " ");
}

function preferredOrgEmail(members: OrgMember[]): string | null {
  const preferred =
    members.find((m) => /owner/i.test(m.role)) ??
    members.find((m) => /admin/i.test(m.role)) ??
    members[0];
  const email = preferred?.email?.trim();
  return email || null;
}

function resolveMerchantKpis(
  orders: PaymentOrder[],
  onboardedAt: string | null | undefined,
  volumeFeePercent: string,
): {
  volumeMtd: number;
  orders: number;
  platformFeeToPay: number;
} {
  const periodStart = merchantBillingPeriodStartMs(
    onboardedAt ?? new Date().toISOString(),
  );
  const inPeriod = orders.filter((o) => {
    const created = o.createdAt ? Date.parse(o.createdAt) : NaN;
    return Number.isFinite(created) ? created >= periodStart : true;
  });
  let settledVolume = 0;
  for (const o of inPeriod) {
    if (o.status !== "completed") continue;
    const n = Number(o.payableAmount.amount);
    if (Number.isFinite(n)) {
      settledVolume += n;
    }
  }
  const pct = Number(volumeFeePercent);
  const feeRate = Number.isFinite(pct) ? pct / 100 : 0;
  const platformFeeToPay = Math.round(settledVolume * feeRate * 100) / 100;
  return {
    volumeMtd: settledVolume,
    orders: inPeriod.length,
    platformFeeToPay,
  };
}

function CopyIcon({ copied }: { copied: boolean }) {
  return copied ? (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6.5 11.2 3.3 8l1.1-1.1 2.1 2.1 4.6-4.6L12.2 5.5 6.5 11.2z"
      />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        d="M5.5 3.5h7v7h-7z"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        d="M3.5 5.5h7v7h-7z"
      />
    </svg>
  );
}

function ContactField({
  email,
  loading,
}: {
  email: string | null;
  loading: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const display = loading ? "Loading…" : email ?? "—";
  const canCopy = Boolean(email) && !loading;

  async function copyEmail() {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      <dt>Contact</dt>
      <dd className="b3-accounts__contact">
        <div
          className={`b3-accounts__contact-chip${copied ? " is-copied" : ""}`}
        >
          <span title={email ?? undefined}>{display}</span>
          {canCopy ? (
            <button
              type="button"
              className={`b3-profile__copy-icon${copied ? " is-copied" : ""}`}
              onClick={() => void copyEmail()}
              aria-label={copied ? "Contact email copied" : "Copy contact email"}
              title={copied ? "Copied" : "Copy"}
            >
              <CopyIcon copied={copied} />
            </button>
          ) : null}
        </div>
      </dd>
    </div>
  );
}

function ReadOnlyEmailField({
  label,
  email,
}: {
  label: string;
  email: string | null | undefined;
}) {
  const trimmed = email?.trim() || null;
  return (
    <div>
      <dt>{label}</dt>
      <dd title={trimmed ?? undefined}>{trimmed ?? "—"}</dd>
    </div>
  );
}

function WalletAddressField({
  address,
  loading,
}: {
  address: string | null;
  loading: boolean;
}) {
  const display = loading
    ? "…"
    : address
      ? truncateAddress(address)
      : "—";

  return (
    <div>
      <dt>Wallet address</dt>
      <dd className="mono" title={address ?? undefined}>
        {display}
      </dd>
    </div>
  );
}


function ActivitySectionEmpty({ loading }: { loading?: boolean }) {
  return (
    <div className="b3-agent-detail__activity-empty" role="status">
      <div
        className={`b3-agent-detail__activity-empty-mark${loading ? " is-busy" : ""}`}
        aria-hidden
      >
        {loading ? (
          <span className="b3-agent-detail__activity-empty-spinner" />
        ) : (
          <svg viewBox="0 0 48 48" width="32" height="32" fill="none">
            <path
              d="M10 12h28M10 24h20M10 36h24"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <circle cx="38" cy="36" r="4" stroke="currentColor" strokeWidth="1.6" opacity="0.55" />
          </svg>
        )}
      </div>
      <p className="b3-agent-detail__activity-empty-title">
        {loading ? "Loading activity" : "No recent activity"}
      </p>
      <p className="b3-agent-detail__activity-empty-copy">
        {loading
          ? "Fetching audit events for this agent."
          : "Sign-ins, team invites, and status changes appear here when recorded."}
      </p>
      {!loading ? (
        <Link
          className="b3-agent-detail__activity-audit b3-agent-detail__activity-audit--inline"
          to="/platform/audit"
          title="Open platform audit log"
        >
          Platform audit log
          <span aria-hidden>→</span>
        </Link>
      ) : null}
    </div>
  );
}

function ProfilePayoutField({
  payout,
  loading,
}: {
  payout: AgentPayoutAddress | null;
  loading: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    if (!payout?.address) return;
    try {
      await navigator.clipboard.writeText(payout.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="b3-profile__field">
      <p className="b3-profile__label">Payout address</p>
      {loading ? (
        <p className="b3-profile__value muted">…</p>
      ) : payout?.address ? (
        <div className="b3-profile__value-row">
          <p className="b3-profile__value mono" title={payout.address}>
            {truncateAddress(payout.address)}
          </p>
          <button
            type="button"
            className={`b3-profile__copy-icon${copied ? " is-copied" : ""}`}
            onClick={() => void copyAddress()}
            aria-label={copied ? "Payout address copied" : "Copy payout address"}
            title={copied ? "Copied" : "Copy"}
          >
            <CopyIcon copied={copied} />
          </button>
        </div>
      ) : (
        <p className="b3-profile__value">—</p>
      )}
    </div>
  );
}

function AccountDetailPanel({
  node,
  orgById,
  orgs,
  subtreeOrders,
  bills,
}: {
  node: AccountTreeNode;
  orgById: Map<string, OrgAccount>;
  orgs: OrgAccount[];
  subtreeOrders: PaymentOrder[];
  bills: ServiceBill[];
}) {
  const isMerchant =
    node.type === "merchant" || node.type === "merchant_site";
  const isSub = node.type === "agent_sub";
  const orgMeta = orgById.get(node.id);
  const [contactEmail, setContactEmail] = useState<string | null>(null);
  const [contactLoading, setContactLoading] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [merchantOrders, setMerchantOrders] = useState<PaymentOrder[]>([]);
  const [merchantOrdersLoading, setMerchantOrdersLoading] = useState(false);
  const [volumeFeePercent, setVolumeFeePercent] = useState<string | null>(null);
  const [commercialTier, setCommercialTier] = useState<string | null>(null);
  const [matchingMode, setMatchingMode] = useState<string | null>(null);
  const effectiveFeePercent = volumeFeePercent ?? "1.15";
  const merchantKpis = useMemo(
    () =>
      isMerchant
        ? resolveMerchantKpis(
            merchantOrders,
            orgMeta?.createdAt,
            effectiveFeePercent,
          )
        : null,
    [isMerchant, merchantOrders, orgMeta?.createdAt, effectiveFeePercent],
  );
  const siteCount = node.children.filter((c) => c.type === "merchant_site").length;
  const merchantChildren = node.children.filter((c) => c.type === "merchant");
  const subMerchantIds = useMemo(
    () => (isSub ? merchantOrgIdsInAgentSubtree(node.id, orgs) : new Set<string>()),
    [isSub, node.id, orgs],
  );
  const subAgentKpis = useMemo(() => {
    if (!isSub) return null;
    const volumeMtd = agentSubtreeVolumeMtd(subtreeOrders, subMerchantIds);
    const platformFeeMtd = agentSubtreePlatformFeeMtd(bills, subMerchantIds);
    return {
      volumeMtd,
      platformFeeMtd,
      commissionMtd: agentCommissionMtd(
        platformFeeMtd,
        DEFAULT_AGENT_COMMISSION_PERCENT,
      ),
      merchants: node.merchantsManaged ?? merchantChildren.length,
    };
  }, [
    isSub,
    subtreeOrders,
    bills,
    subMerchantIds,
    node.merchantsManaged,
    merchantChildren.length,
  ]);
  const detailHref = isSub
    ? `/platform/agents/${node.id}`
    : node.type === "merchant"
      ? `/platform/merchants/${node.id}`
      : node.type === "merchant_site" && node.parentId
        ? `/platform/merchants/${node.parentId}?tab=sites`
        : null;
  const detailLabel = isSub
    ? "Open agent detail"
    : node.type === "merchant_site"
      ? "Open merchant (Sites)"
      : node.type === "merchant"
        ? "Open merchant detail"
        : null;

  useEffect(() => {
    if (!isSub && !isMerchant) {
      setContactEmail(null);
      setContactLoading(false);
      return;
    }
    let cancelled = false;
    setContactLoading(true);
    void listOrgUsers(node.id)
      .then((rows) => {
        if (!cancelled) setContactEmail(preferredOrgEmail(rows));
      })
      .catch(() => {
        if (!cancelled) setContactEmail(null);
      })
      .finally(() => {
        if (!cancelled) setContactLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isSub, isMerchant, node.id]);

  useEffect(() => {
    if (!isSub && !isMerchant) {
      setWalletAddress(null);
      setWalletLoading(false);
      return;
    }
    let cancelled = false;
    setWalletLoading(true);
    const load = isSub
      ? getAgentPayout(node.id).then((payout) => payout?.address ?? null)
      : listSettlement(node.id).then((rows) => rows[0]?.address ?? null);
    void load
      .then((address) => {
        if (!cancelled) setWalletAddress(address);
      })
      .catch(() => {
        if (!cancelled) setWalletAddress(null);
      })
      .finally(() => {
        if (!cancelled) setWalletLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isSub, isMerchant, node.id]);

  useEffect(() => {
    if (!isMerchant) {
      setVolumeFeePercent(null);
      setCommercialTier(null);
      setMatchingMode(null);
      return;
    }
    let cancelled = false;
    void Promise.all([getMerchantCommercial(node.id), getMatchingMode(node.id)])
      .then(([commercial, mode]) => {
        if (cancelled) return;
        setVolumeFeePercent(commercial.volumeFeePercent);
        setCommercialTier(
          `${tierLabel(commercial.tier)} · ${commercial.volumeFeePercent}% volume fee`,
        );
        setMatchingMode(mode.matchingMode);
      })
      .catch(() => {
        if (!cancelled) {
          setVolumeFeePercent(null);
          setCommercialTier(null);
          setMatchingMode(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isMerchant, node.id]);

  useEffect(() => {
    if (!isMerchant) {
      setMerchantOrders([]);
      setMerchantOrdersLoading(false);
      return;
    }
    let cancelled = false;
    setMerchantOrdersLoading(true);
    void listOrders({ orgId: node.id, limit: 100 })
      .then((rows) => {
        if (!cancelled) setMerchantOrders(rows);
      })
      .catch(() => {
        if (!cancelled) setMerchantOrders([]);
      })
      .finally(() => {
        if (!cancelled) setMerchantOrdersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isMerchant, node.id]);

  return (
    <div className="b3-accounts__detail-inner">
      <header className="b3-accounts__detail-head">
        <div className="b3-accounts__detail-avatar" aria-hidden>
          {initials(node.name)}
        </div>
        <div className="b3-accounts__detail-head-main">
          <h3 className="b3-accounts__detail-title">{node.name}</h3>
          <div className="b3-accounts__detail-badges">
            <span className="b3-accounts__chip">{orgTypeLabel(node.type)}</span>
            <span
              className={`status-badge ${
                node.status === "paused" ? "tone-warn" : "tone-ok"
              }`}
            >
              {(node.status ?? "active").toUpperCase()}
            </span>
          </div>
        </div>
      </header>

      {isMerchant && merchantKpis ? (
        <div className="b3-accounts__kpi-grid" aria-label="Merchant snapshot">
          <div className="b3-accounts__kpi">
            <p className="b3-accounts__kpi-label">Volume MTD</p>
            <p className="b3-accounts__kpi-value">
              {merchantOrdersLoading ? (
                <span className="muted">…</span>
              ) : (
                <FundAmount amount={merchantKpis.volumeMtd} />
              )}
            </p>
          </div>
          <div className="b3-accounts__kpi">
            <p
              className="b3-accounts__kpi-label"
              title="Accrued volume fee this period — payable on service bill"
            >
              Platform fee (MTD)
            </p>
            <p className="b3-accounts__kpi-value b3-accounts__kpi-value--ok">
              {merchantOrdersLoading ? (
                <span className="muted">…</span>
              ) : (
                <FundAmount amount={merchantKpis.platformFeeToPay} />
              )}
            </p>
          </div>
          <div className="b3-accounts__kpi">
            <p className="b3-accounts__kpi-label">Orders</p>
            <p className="b3-accounts__kpi-value">
              {merchantOrdersLoading ? "…" : merchantKpis.orders}
            </p>
          </div>
        </div>
      ) : null}

      {isSub && subAgentKpis ? (
        <div className="b3-accounts__kpi-grid" aria-label="Sub-agent snapshot">
          <div className="b3-accounts__kpi">
            <p className="b3-accounts__kpi-label">Volume (MTD)</p>
            <p className="b3-accounts__kpi-value">
              <FundAmount amount={subAgentKpis.volumeMtd} />
            </p>
          </div>
          <div className="b3-accounts__kpi">
            <p className="b3-accounts__kpi-label">Commission (MTD)</p>
            <p className="b3-accounts__kpi-value b3-accounts__kpi-value--ok">
              <FundAmount amount={subAgentKpis.commissionMtd} />
            </p>
          </div>
          <div className="b3-accounts__kpi">
            <p className="b3-accounts__kpi-label">Merchants</p>
            <p className="b3-accounts__kpi-value">{subAgentKpis.merchants}</p>
          </div>
          <div className="b3-accounts__kpi">
            <p className="b3-accounts__kpi-label">Platform fee (MTD)</p>
            <p className="b3-accounts__kpi-value">
              <FundAmount amount={subAgentKpis.platformFeeMtd} />
            </p>
          </div>
        </div>
      ) : null}

      <section className="b3-accounts__section">
        <h4 className="b3-accounts__section-title">Profile</h4>
        <dl className="b3-accounts__meta">
          {node.parentName ? (
            <div>
              <dt>Parent</dt>
              <dd title={node.parentName}>{node.parentName}</dd>
            </div>
          ) : null}
          {node.type === "merchant" || node.type === "merchant_site" ? (
            <div>
              <dt>Structure</dt>
              <dd>{structureDisplay(node.structure)}</dd>
            </div>
          ) : null}
          {isMerchant ? (
            <>
              <div>
                <dt>Commercial</dt>
                <dd title={commercialTier ?? undefined}>
                  {commercialTier ?? "—"}
                </dd>
              </div>
              <div>
                <dt>Matching</dt>
                <dd>
                  {matchingMode ? matchingModeLabel(matchingMode) : "—"}
                </dd>
              </div>
              <ReadOnlyEmailField
                label="Billing email"
                email={orgMeta?.billingEmail}
              />
              <div>
                <dt>Onboarded</dt>
                <dd>{formatOnboardDate(orgMeta?.createdAt)}</dd>
              </div>
              {node.type === "merchant" ? (
                <div>
                  <dt>Sites</dt>
                  <dd>{siteCount}</dd>
                </div>
              ) : null}
              <WalletAddressField
                address={walletAddress}
                loading={walletLoading}
              />
            </>
          ) : null}
          {isSub ? (
            <>
              <ContactField email={contactEmail} loading={contactLoading} />
              <ReadOnlyEmailField
                label="Billing email"
                email={orgMeta?.billingEmail}
              />
              <WalletAddressField
                address={walletAddress}
                loading={walletLoading}
              />
              <div>
                <dt>Onboarded</dt>
                <dd>{formatOnboardDate(orgMeta?.createdAt)}</dd>
              </div>
            </>
          ) : null}
          {node.children.length > 0 ? (
            <div>
              <dt>Children</dt>
              <dd>{node.children.length}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <div className="b3-accounts__detail-foot">
        {detailHref ? (
          <Link className="b3-accounts__cta" to={detailHref}>
            {detailLabel}
            <span aria-hidden>→</span>
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function AccountTreeItem({
  node,
  depth,
  expanded,
  selectedId,
  onSelect,
  onToggle,
}: {
  node: AccountTreeNode;
  depth: number;
  expanded: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const isSelected = selectedId === node.id;
  const typeIcon =
    node.type === "agent_sub" ? "A" : node.type === "merchant_site" ? "S" : "M";
  return (
    <div
      className="b3-accounts__node"
      role="treeitem"
      aria-expanded={hasChildren ? isOpen : undefined}
      aria-selected={isSelected}
    >
      <div
        className={`b3-accounts__row${isSelected ? " is-selected" : ""}${
          node.type === "merchant_site" ? " is-site" : ""
        }`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onSelect(node.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(node.id);
          }
        }}
        role="presentation"
      >
        {hasChildren ? (
          <button
            type="button"
            className="b3-accounts__chevron"
            aria-label={isOpen ? "Collapse" : "Expand"}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
          >
            <span className={`b3-accounts__caret${isOpen ? " is-open" : ""}`} />
          </button>
        ) : (
          <span className="b3-accounts__chevron b3-accounts__chevron--spacer" aria-hidden />
        )}
        <span
          className={`b3-accounts__badge b3-accounts__badge--${
            node.type === "agent_sub"
              ? "agent"
              : node.type === "merchant_site"
                ? "site"
                : "merchant"
          }`}
          aria-hidden
        >
          {typeIcon}
        </span>
        <button
          type="button"
          className="b3-accounts__name"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(node.id);
          }}
        >
          <span className="b3-accounts__name-text">{node.name}</span>
          <span className="b3-accounts__type">{orgTypeLabel(node.type)}</span>
        </button>
      </div>
      {hasChildren && isOpen
        ? node.children.map((child) => (
            <AccountTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedId={selectedId}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))
        : null}
    </div>
  );
}

function collectDescendantIds(node: AccountTreeNode): string[] {
  const ids: string[] = [];
  const walk = (n: AccountTreeNode) => {
    for (const c of n.children) {
      ids.push(c.id);
      walk(c);
    }
  };
  walk(node);
  return ids;
}

function findAccountNode(
  nodes: AccountTreeNode[],
  id: string,
): AccountTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findAccountNode(n.children, id);
    if (hit) return hit;
  }
  return null;
}

type Props = {
  org: OrgAccount;
  orgs: OrgAccount[];
  canManage: boolean;
  busy: boolean;
  invitationSent?: boolean;
  onPause: () => void;
  onRun: () => void;
  onDelete: () => void;
};

/** Figma `b3-agent-detail` — solid card (no gradient); lives in Agents master–detail. */
export function AgentDetailCard({
  org,
  orgs,
  canManage,
  busy,
  invitationSent,
  onPause,
  onRun,
  onDelete,
}: Props) {
  const [tab, setTab] = useState<TabId>("overview");
  const [bills, setBills] = useState<ServiceBill[]>([]);
  const [subtreeOrders, setSubtreeOrders] = useState<PaymentOrder[]>([]);
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [team, setTeam] = useState<OrgMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [tabError, setTabError] = useState<string | null>(null);
  const [toast, setToast] = useState(invitationSent === true);
  const [accountSelectedId, setAccountSelectedId] = useState<string | null>(
    null,
  );
  const [accountExpanded, setAccountExpanded] = useState<Set<string>>(
    () => new Set(),
  );
  const [serviceBillPeriodFilter, setServiceBillPeriodFilter] = useState<{
    periodKey: string;
    periodLabel: string;
  } | null>(null);
  const [payout, setPayout] = useState<AgentPayoutAddress | null>(null);
  const [commission, setCommission] = useState<AgentCommissionSettings | null>(
    null,
  );
  const [commissionEditOpen, setCommissionEditOpen] = useState(false);
  const [commissionDraft, setCommissionDraft] = useState("15");
  const [commissionBusy, setCommissionBusy] = useState(false);
  const [commissionError, setCommissionError] = useState<string | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  const status = org.status ?? "active";
  const merchants = useMemo(
    () => merchantsInAgentSubtree(org.id, orgs),
    [org.id, orgs],
  );
  const subAgents = useMemo(
    () => subAgentsUnderAgent(org.id, orgs),
    [org.id, orgs],
  );
  const orgNameById = useMemo(
    () => new Map(orgs.map((o) => [o.id, o.name])),
    [orgs],
  );
  const orgById = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs]);
  const accountsForest = useMemo(
    () =>
      buildAgentAccountsForest({
        agentId: org.id,
        agentName: org.name,
        liveSubAgents: subAgents,
        liveMerchants: merchants,
        parentNameById: orgNameById,
      }),
    [org.id, org.name, subAgents, merchants, orgNameById],
  );
  const accountTree = accountsForest.tree;
  /** Matches Agents list MERCHANTS — live merchant accounts only (sites excluded). */
  const liveMerchantCount = accountsForest.liveMerchantCount;
  const accountNodeCount = useMemo(
    () => countAccountTreeNodes(accountTree),
    [accountTree],
  );
  const selectedAccount = useMemo(() => {
    if (!accountSelectedId) return null;
    return findAccountNode(accountTree, accountSelectedId);
  }, [accountTree, accountSelectedId]);

  function toggleAccountNode(id: string) {
    const node = findAccountNode(accountTree, id);
    const willCollapse = accountExpanded.has(id);
    setAccountExpanded((prev) => {
      const next = new Set(prev);
      if (willCollapse) next.delete(id);
      else next.add(id);
      return next;
    });
    if (willCollapse && node && accountSelectedId) {
      const hidden = new Set(collectDescendantIds(node));
      if (hidden.has(accountSelectedId)) {
        setAccountSelectedId(id);
      }
    }
  }
  const recentActivity = useMemo(() => {
    const feed = mergeActivityFeed(
      audit,
      org.id,
      (action) => AUDIT_LABEL[action] ?? action.replace(/_/g, " "),
      RECENT_ACTIVITY_LIMIT,
      accountsForest.merchantNames,
    );
    if (feed.length > 0) return feed;
    if (org.createdAt) {
      return [
        {
          id: `synthetic-org-create-${org.id}`,
          title: "Org created",
          description: `${org.name} added to the portal`,
          createdAt: org.createdAt,
        },
      ];
    }
    return feed;
  }, [audit, org.id, org.name, org.createdAt, accountsForest.merchantNames]);
  const profileEmail = useMemo(
    () => preferredOrgEmail(team) ?? "—",
    [team],
  );
  const merchantIds = useMemo(
    () => merchantOrgIdsInAgentSubtree(org.id, orgs),
    [org.id, orgs],
  );
  const agentBills = useMemo(
    () => bills.filter((b) => merchantIds.has(b.orgId)),
    [bills, merchantIds],
  );
  const filteredAgentBills = useMemo(() => {
    if (!serviceBillPeriodFilter) return agentBills;
    return agentBills.filter(
      (b) => b.periodStart.slice(0, 7) === serviceBillPeriodFilter.periodKey,
    );
  }, [agentBills, serviceBillPeriodFilter]);
  const liveVolumeMtd = useMemo(
    () => agentSubtreeVolumeMtd(subtreeOrders, merchantIds),
    [subtreeOrders, merchantIds],
  );
  const livePlatformFeeMtd = useMemo(
    () => agentSubtreePlatformFeeMtd(agentBills, merchantIds),
    [agentBills, merchantIds],
  );
  const displayVolumeMtd = liveVolumeMtd;
  const commissionPercent =
    commission?.commissionPercent ?? String(DEFAULT_AGENT_COMMISSION_PERCENT);
  const displayCommissionMtd =
    livePlatformFeeMtd > 0
      ? agentCommissionMtd(livePlatformFeeMtd, commissionPercent)
      : 0;
  const displayBills = useMemo(() => {
    const merchantNameById = new Map(orgs.map((o) => [o.id, o.name]));
    return mergeServiceBillsWithSeeds(
      filteredAgentBills,
      org.id,
      merchantNameById,
      accountsForest.merchantNames,
      PREVIEW_SERVICE_BILLS_LIMIT,
    );
  }, [filteredAgentBills, org.id, orgs, accountsForest.merchantNames]);
  const commissionHistory = useMemo(
    () =>
      mergeCommissionHistory(
        agentBills,
        merchantIds,
        org.id,
        commissionPercent,
        PREVIEW_COMMISSION_LIMIT,
      ),
    [agentBills, merchantIds, org.id, commissionPercent],
  );

  useEffect(() => {
    let cancelled = false;
    setOverviewLoading(true);
    setTeamLoading(true);
    void getOrgOverview(org.id)
      .then((data) => {
        if (cancelled) return;
        setTeam(data.team);
        setAudit(data.audit);
        setPayout(data.payout);
        setCommission(data.commission);
        setSubtreeOrders(data.orders);
      })
      .catch(() => {
        if (!cancelled) {
          setTeam([]);
          setAudit([]);
          setPayout(null);
          setCommission(null);
          setSubtreeOrders([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setOverviewLoading(false);
          setTeamLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [org.id]);

  useEffect(() => {
    setTab("overview");
    setTabError(null);
    setAccountSelectedId(null);
    setAccountExpanded(new Set());
    setServiceBillPeriodFilter(null);
    setTeam([]);
    setCommission(null);
    setCommissionEditOpen(false);
    setCommissionError(null);
  }, [org.id]);

  useEffect(() => {
    if (!commissionEditOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !commissionBusy) setCommissionEditOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commissionEditOpen, commissionBusy]);

  async function saveCommission() {
    if (!canManage || commissionBusy) return;
    setCommissionBusy(true);
    setCommissionError(null);
    try {
      const updated = await putAgentCommission(org.id, {
        commissionPercent: commissionDraft.trim(),
      });
      setCommission(updated);
      setCommissionEditOpen(false);
    } catch (err) {
      setCommissionError(
        err instanceof ApiError ? err.message : "Could not update commission",
      );
    } finally {
      setCommissionBusy(false);
    }
  }

  useEffect(() => {
    if (accountTree.length === 0) return;
    setAccountExpanded((prev) => {
      if (prev.size > 0) return prev;
      // Large forests: expand only the first few roots so ~50 accounts stay browsable.
      const rootsToOpen =
        accountTree.length > 12 ? accountTree.slice(0, 3) : accountTree;
      return new Set(rootsToOpen.map((n) => n.id));
    });
    setAccountSelectedId((cur) => cur ?? accountTree[0]?.id ?? null);
  }, [accountTree]);

  useEffect(() => {
    setToast(invitationSent === true);
  }, [invitationSent, org.id]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(false), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (tab !== "service-bills" && tab !== "commission") {
      return;
    }
    let cancelled = false;
    setTabLoading(true);
    setTabError(null);
    (async () => {
      try {
        const rows = await listServiceBills({ limit: SERVICE_BILLS_LIST_LIMIT });
        if (!cancelled) setBills(rows);
      } catch (err) {
        if (!cancelled) {
          setTabError(
            err instanceof ApiError
              ? err.code === "rate_limited"
                ? "Too many requests — wait a moment and retry."
                : err.message
              : "Failed to load tab data",
          );
        }
      } finally {
        if (!cancelled) setTabLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, org.id]);

  return (
    <aside className="b3-agent-detail" aria-label="Agent detail">
      <AuthToast
        message={tabError ?? commissionError}
        tone="error"
        onDismiss={() => {
          setTabError(null);
          setCommissionError(null);
        }}
      />
      <header className="b3-agent-detail__head">
        <div className="b3-agent-detail__identity">
          <div className="b3-agent-detail__avatar" aria-hidden>
            {initials(org.name)}
          </div>
          <div className="b3-agent-detail__titles">
            <div className="b3-agent-detail__title-row">
              <h2 className="b3-agent-detail__name">{org.name}</h2>
              <span
                className={`b3-agent-detail__status${
                  status === "paused" ? " is-paused" : ""
                }`}
              >
                {status === "paused" ? "PAUSED" : "ACTIVE"}
              </span>
            </div>
            <a
              className="b3-agent-detail__email"
              href={`mailto:${profileEmail}`}
              title={profileEmail}
            >
              {profileEmail}
            </a>
          </div>
        </div>
        <div className="b3-agent-detail__head-actions">
          {canManage ? (
            <>
              {status === "active" ? (
                <button
                  type="button"
                  className="b3-agent-detail__suspend"
                  disabled={busy}
                  onClick={onPause}
                >
                  Suspend
                </button>
              ) : (
                <button
                  type="button"
                  className="b3-agent-detail__suspend"
                  disabled={busy}
                  onClick={onRun}
                >
                  Run
                </button>
              )}
              <button
                type="button"
                className="b3-agent-detail__delete"
                disabled={busy}
                onClick={onDelete}
              >
                Delete
              </button>
            </>
          ) : null}
        </div>
      </header>

      {toast ? (
        <div className="banner banner-ok b3-agent-detail__toast">
          Invitation sent to the new Owner.
        </div>
      ) : null}

      <div className="b3-agent-detail__tabs" role="tablist">
        {TABS.map((t) => {
          let label: string = t.label;
          if (t.id === "accounts") label = `Accounts (${accountNodeCount})`;
          if (t.id === "service-bills") {
            label = `Service Bills (${agentBills.length})`;
          }
          if (t.id === "commission") {
            label = `Commissions (${commissionHistory.length})`;
          }
          if (t.id === "team") label = `Team (${team.length})`;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              className={`b3-agent-detail__tab${tab === t.id ? " is-active" : ""}`}
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div
        className={`b3-agent-detail__body${tab === "accounts" ? " is-accounts" : ""}`}
      >
        {tab === "overview" ? (
          <>
            <div className="b3-agent-detail__kpis b3-agent-detail__kpis--3">
              <div className="b3-card glass-tone-blue b3-card--kpi">
                <KpiHelp text={KPI_HELP.merchants} />
                <p className="b3-card__label">Merchants</p>
                <p className="b3-card__value">{liveMerchantCount}</p>
              </div>
              <div className="b3-card glass-tone-slate b3-card--kpi">
                <KpiHelp text={KPI_HELP.volumeMtd} />
                <p className="b3-card__label">Volume (MTD)</p>
                <p className="b3-card__value">
                  <FundAmount amount={displayVolumeMtd} />
                </p>
              </div>
              <div className="b3-card glass-tone-emerald b3-card--kpi">
                <KpiHelp text={KPI_HELP.commissionMtd} />
                <p className="b3-card__label">Commission (MTD)</p>
                <p className="b3-card__value b3-card__value--ok">
                  <FundAmount amount={displayCommissionMtd} />
                </p>
              </div>
            </div>

            <div className="b3-agent-detail__overview-stack">
              <section className="b3-card b3-card--section b3-card--flat">
                <div className="b3-profile__head">
                  <h3 className="b3-card__heading">Profile</h3>
                </div>
                <div className="b3-profile">
                  <div className="b3-profile__field">
                    <p className="b3-profile__label">Onboarded</p>
                    <p className="b3-profile__value">
                      {formatOnboardDate(org.createdAt)}
                    </p>
                  </div>
                  <div className="b3-profile__field">
                    <p className="b3-profile__label">Commission</p>
                    <div className="b3-profile__value-row">
                      <p className="b3-profile__value">
                        {overviewLoading && !commission
                          ? "…"
                          : `${commissionPercent}%`}
                      </p>
                      {canManage ? (
                        <button
                          type="button"
                          className="b3-profile__edit-btn"
                          disabled={busy || commissionBusy}
                          onClick={() => {
                            setCommissionDraft(commissionPercent);
                            setCommissionError(null);
                            setCommissionEditOpen(true);
                          }}
                        >
                          Edit
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="b3-profile__field">
                    <p className="b3-profile__label">Country</p>
                    <p className="b3-profile__value">—</p>
                  </div>
                  <ProfilePayoutField payout={payout} loading={overviewLoading} />
                </div>
              </section>

              <section className="b3-card b3-card--section b3-card--flat b3-agent-detail__activity">
                <div className="b3-agent-detail__activity-head">
                  <h3 className="b3-card__heading b3-agent-detail__activity-heading">
                    Recent activity
                  </h3>
                  <span className="b3-agent-detail__activity-cap">
                    {recentActivity.length}{" "}
                    {recentActivity.length === 1 ? "event" : "events"}
                  </span>
                </div>
                {overviewLoading && audit.length === 0 ? (
                  <ActivitySectionEmpty loading />
                ) : recentActivity.length === 0 ? (
                  <ActivitySectionEmpty />
                ) : (
                  <>
                    <ul className="b3-activity">
                      {recentActivity.map((row) => (
                        <li key={row.id} className="b3-activity__item">
                          <div className="b3-activity__main">
                            <div className="b3-activity__row">
                              <p className="b3-activity__title">{row.title}</p>
                              <time
                                className="b3-activity__time"
                                dateTime={row.createdAt}
                              >
                                {relativeTime(row.createdAt)}
                              </time>
                            </div>
                            <p className="b3-activity__desc">{row.description}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <Link
                      className="b3-agent-detail__activity-audit"
                      to="/platform/audit"
                      title={`Platform audit log (up to ${RECENT_ACTIVITY_LIMIT} events shown here)`}
                    >
                      Platform audit log
                      <span aria-hidden>→</span>
                    </Link>
                  </>
                )}
              </section>
            </div>

          </>
        ) : null}

        {tab === "accounts" ? (
          accountTree.length === 0 ? (
            <AgentTabEmpty
              icon="accounts"
              title="No accounts in this subtree yet"
              copy="Sub-agents and merchants onboarded under this agent appear here as a browsable hierarchy."
              hints={[
                "Onboard merchants from Platform → Merchants",
                "Add sub-agents when this agent needs a regional desk or partner channel",
              ]}
            />
          ) : (
            <div className="b3-accounts">
              <div className="b3-accounts__tree" role="tree" aria-label="Accounts">
                {accountTree.map((node) => (
                  <AccountTreeItem
                    key={node.id}
                    node={node}
                    depth={0}
                    expanded={accountExpanded}
                    selectedId={accountSelectedId}
                    onSelect={setAccountSelectedId}
                    onToggle={toggleAccountNode}
                  />
                ))}
              </div>
              <aside className="b3-accounts__detail" aria-label="Account detail">
                {selectedAccount ? (
                  <AccountDetailPanel
                    node={selectedAccount}
                    orgById={orgById}
                    orgs={orgs}
                    subtreeOrders={subtreeOrders}
                    bills={bills}
                  />
                ) : (
                  <div className="b3-accounts__detail-empty">
                    <p className="b3-accounts__empty-title">Account detail</p>
                    <p className="muted">
                      Select a node in the tree to inspect profile, volume, and
                      child accounts.
                    </p>
                  </div>
                )}
              </aside>
            </div>
          )
        ) : null}

        {tab === "service-bills" ? (
          tabLoading && agentBills.length === 0 && bills.length === 0 ? (
            <AgentTabEmpty
              icon="bills"
              title="Loading service bills"
              copy="Fetching bills for merchants under this agent."
            />
          ) : displayBills.length === 0 ? (
            <AgentTabEmpty
              icon="bills"
              title={
                serviceBillPeriodFilter
                  ? "No bills this period"
                  : "No service bills yet"
              }
              copy={
                serviceBillPeriodFilter
                  ? `No service bills were issued for ${serviceBillPeriodFilter.periodLabel} under this agent.`
                  : "Subscription and volume fees are invoiced to merchants in this agent’s subtree as service bills."
              }
              hints={
                serviceBillPeriodFilter
                  ? ["Try another period from Commissions", "Show all bills to see the full history"]
                  : [
                      "Onboard merchants under this agent",
                      "Bills appear after invoicing for each billing period",
                    ]
              }
            />
          ) : (
            <>
              {serviceBillPeriodFilter ? (
                <div className="b3-agent-detail__bill-filter">
                  <p className="b3-agent-detail__bill-filter-label">
                    Showing service bills for{" "}
                    <strong>{serviceBillPeriodFilter.periodLabel}</strong>
                    {" "}({filteredAgentBills.length} bill
                    {filteredAgentBills.length === 1 ? "" : "s"})
                  </p>
                  <button
                    type="button"
                    className="b3-accounts__link-btn"
                    onClick={() => setServiceBillPeriodFilter(null)}
                  >
                    Show all bills
                  </button>
                </div>
              ) : null}
              <div className="b3-agent-detail__table-scroll">
                <table className="data-table plat-bills__embed">
                  <thead>
                    <tr>
                      <th>Bill</th>
                      <th>Merchant</th>
                      <th>Total</th>
                      <th>Due</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {displayBills.map((bill) => {
                      const overdue = bill.status === "overdue";
                      return (
                        <tr key={bill.id}>
                          <td>
                            <Link
                              className="plat-bills__id"
                              to={`/platform/service-bills/${bill.id}`}
                            >
                              {formatBillId(bill.id)}
                            </Link>
                          </td>
                          <td className="plat-bills__merchant">{bill.merchantName}</td>
                          <td className="plat-bills__amount">
                            <FundAmount amount={bill.totalAmount} />
                          </td>
                          <td
                            className={
                              overdue ? "plat-bills__due is-overdue" : "plat-bills__due"
                            }
                          >
                            {formatShortDate(bill.dueAt)}
                          </td>
                          <td>
                            <span
                              className={`plat-bills__badge tone-${serviceBillStatusTone(bill.status)}${
                                overdue ? " is-pulse" : ""
                              }`}
                            >
                              {serviceBillStatusLabel(bill.status)}
                            </span>
                          </td>
                          <td>
                            <Link to={`/platform/service-bills/${bill.id}`}>
                              View
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )
        ) : null}

        {tab === "commission" ? (
          <div className="b3-agent-detail__commission">
            <div className="b3-agent-detail__kpis b3-agent-detail__kpis--2">
              <div className="b3-card glass-tone-emerald">
                <p className="b3-card__label">Commission (MTD)</p>
                <p className="b3-card__value b3-card__value--ok">
                  <FundAmount amount={displayCommissionMtd} />
                </p>
              </div>
              <div className="b3-card glass-tone-slate">
                <p className="b3-card__label">Volume (MTD)</p>
                <p className="b3-card__value">
                  <FundAmount amount={displayVolumeMtd} />
                </p>
              </div>
            </div>
            <h3 className="b3-card__heading b3-agent-detail__section-heading">
              Statement history
            </h3>
            <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
              {org.type === "agent_sub" ? (
                <>
                  Platform does not pay agent (sub) accounts directly. The parent
                  agent settles this org. Full platform → top-level agent history:{" "}
                  <Link to="/platform/commissions">Commissions</Link>.
                </>
              ) : (
                <>
                  Platform → agent payout history (QR slips + mark paid):{" "}
                  <Link to={`/platform/commissions?payee=${encodeURIComponent(org.id)}`}>
                    Open in Commissions
                  </Link>
                  . Per-agent statements also list below; agent detail:{" "}
                  <Link to={`/platform/agents/${org.id}`}>Agents → {org.name}</Link>
                  .
                </>
              )}
            </p>
            {commissionHistory.length === 0 ? (
              <AgentTabEmpty
                icon="commission"
                title="No commission statements yet"
                copy="Monthly commission is calculated from platform fees on merchant service bills in this agent’s subtree."
                hints={["Statements appear once service bills exist for merchants under this agent"]}
              />
            ) : (
            <div className="b3-agent-detail__table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Platform fee collected</th>
                    <th className="b3-num-col">Rate</th>
                    <th>Commission</th>
                    <th>Payout</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {commissionHistory.map((row) => (
                    <tr key={row.id}>
                      <td>{row.periodLabel}</td>
                      <td>
                        <FundAmount amount={row.platformFeeCollected} />
                      </td>
                      <td className="b3-num-col">{row.commissionPercent}%</td>
                      <td>
                        <FundAmount amount={row.commissionAmount} />
                      </td>
                      <td>
                        <span
                          className={`status-badge ${
                            row.payoutStatus === "paid"
                              ? "tone-ok"
                              : row.payoutStatus === "pending"
                                ? "tone-warn"
                                : "tone-muted"
                          }`}
                        >
                          {row.payoutStatus.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="b3-accounts__link-btn"
                          onClick={() => {
                            setServiceBillPeriodFilter({
                              periodKey: row.periodKey,
                              periodLabel: row.periodLabel,
                            });
                            setTab("service-bills");
                          }}
                          title={`View service bills for ${row.periodLabel}`}
                        >
                          View bills
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </div>
        ) : null}

        {tab === "team" ? (
          teamLoading ? (
            <PlatformPending
              compact
              title="Loading team"
              copy="Fetching members for this agent org."
            />
          ) : (
            <div className="b3-team">
              {team.length === 0 ? (
                <p className="b3-team__empty">No members on this agent org yet.</p>
              ) : (
                <div className="b3-agent-detail__table-scroll b3-team__table">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {team.map((m) => (
                        <tr key={m.userId}>
                          <td>{m.email}</td>
                          <td>
                            <span className="b3-team__role">
                              {m.role}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <aside className="b3-team__note" aria-label="Access note">
                <span className="b3-team__note-label">Read-only</span>
                <p className="b3-team__note-text">
                  Platform operators can view this roster but cannot invite or
                  remove members from the platform portal.
                </p>
              </aside>
            </div>
          )
        ) : null}
      </div>

      {commissionEditOpen
        ? createPortal(
            <div
              className="b3-commission-modal-backdrop"
              role="presentation"
              onClick={() => {
                if (!commissionBusy) setCommissionEditOpen(false);
              }}
            >
              <div
                className="b3-commission-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="agent-commission-edit-title"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="b3-commission-modal__head">
                  <h3 id="agent-commission-edit-title">Edit commission</h3>
                  <button
                    type="button"
                    className="b3-commission-modal__close"
                    aria-label="Close"
                    disabled={commissionBusy}
                    onClick={() => setCommissionEditOpen(false)}
                  >
                    ×
                  </button>
                </header>
                <div className="b3-commission-modal__body">
                  <p className="b3-commission-modal__hint">
                    Percent of platform fee paid to this agent. The new rate
                    applies immediately to commission accruals.
                  </p>
                  <label className="b3-commission-modal__field">
                    <span className="b3-commission-modal__label">
                      Commission rate
                    </span>
                    <div className="b3-commission-modal__input-wrap">
                      <input
                        className="b3-commission-modal__input"
                        type="text"
                        inputMode="decimal"
                        value={commissionDraft}
                        disabled={commissionBusy}
                        onChange={(e) => setCommissionDraft(e.target.value)}
                        placeholder="15"
                        autoFocus
                      />
                      <span className="b3-commission-modal__suffix">%</span>
                    </div>
                  </label>
                </div>
                <footer className="b3-commission-modal__foot">
                  <button
                    type="button"
                    className="b3-commission-modal__cancel"
                    disabled={commissionBusy}
                    onClick={() => setCommissionEditOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="b3-commission-modal__save"
                    disabled={commissionBusy || !commissionDraft.trim()}
                    onClick={() => void saveCommission()}
                  >
                    {commissionBusy ? "Saving…" : "Save changes"}
                  </button>
                </footer>
              </div>
            </div>,
            document.body,
          )
        : null}
    </aside>
  );
}
