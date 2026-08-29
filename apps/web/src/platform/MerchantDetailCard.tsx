import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  getFeeTierSettings,
  getMatchingMode,
  getOrgOverview,
  listComplianceOverrides,
  listServiceBills,
  listSettlement,
  listXpub,
  updateMerchantCommercial,
  type ComplianceOverride,
  type FeeTierBand,
  type AuditLogEntry,
  type MerchantCommercialSettings,
  type OrgAccount,
  type OrgMember,
  type PaymentOrder,
  type ServiceBill,
  type SettlementAddress,
  type XpubSettings,
} from "./api";
import { ComplianceOverrideModal } from "./ComplianceOverrideModal";
import { relativeAlertTime, upsertPlatformAlert } from "./platformAlerts";
import {
  merchantSites,
  STRUCTURE_LABELS,
} from "./merchantSubtree";
import { FundAmount } from "./FundAmount";
import {
  formatOnboardDate,
  merchantBillingPeriodStartMs,
  mergeActivityFeed,
  RECENT_ACTIVITY_LIMIT,
  truncateAddress,
} from "./orgDetailSeeds";
import { tierLabel } from "../commercialLabels";
import type { MerchantTier } from "../commercialLabels";
import { matchingModeLabel, matchingModeScope } from "../merchant/matchingLabels";
import {
  formatBillId,
  serviceBillStatusLabel,
  serviceBillStatusTone,
} from "./serviceBillStatus";
import { formatShortDate } from "./org";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "sites", label: "Sites" },
  { id: "settlement", label: "Settlement" },
  { id: "service-bills", label: "Service bills" },
  { id: "compliance", label: "Compliance" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const MERCHANT_TIERS: MerchantTier[] = ["small", "mid", "enterprise"];

function defaultVolumeForTier(tiers: FeeTierBand[], tier: MerchantTier): string {
  const band = tiers.find((t) => t.tier === tier);
  return band?.defaultSignupPercent ?? "1.5";
}

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
          ? "Fetching audit events for this merchant."
          : "Team invites, status changes, and service bills appear here when recorded."}
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

function MerchantSitesEmpty({ structure }: { structure: string | null | undefined }) {
  const isMulti = structure === "multi_location";
  return (
    <div className="b3-agent-detail__empty" role="status">
      <div className="b3-agent-detail__empty-mark" aria-hidden>
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
      </div>
      <p className="b3-agent-detail__empty-title">
        {isMulti ? "No merchant sites yet" : "Single-location merchant"}
      </p>
      <p className="b3-agent-detail__empty-copy">
        {isMulti
          ? "This merchant is multi-location, but no site orgs are linked yet. Sites appear here once created under this account."
          : "This account operates as one location. Payment orders and settlement stay on the merchant — separate site orgs are not used."}
      </p>
      <ul className="b3-agent-detail__empty-hints">
        {isMulti ? (
          <>
            <li>Each outlet is a merchant (site) under this parent</li>
            <li>Sites can override wallet or matching only with merchant Owner approval</li>
          </>
        ) : (
          <>
            <li>Structure is set at onboard and shown on Overview → Profile</li>
            <li>Switch to multi-location only when the merchant needs separate site orgs</li>
          </>
        )}
      </ul>
    </div>
  );
}

function SettlementSectionEmpty({
  title,
  copy,
}: {
  title: string;
  copy: string;
}) {
  return (
    <div className="b3-settlement__section-empty" role="status">
      <div className="b3-settlement__section-empty-mark" aria-hidden>
        <svg viewBox="0 0 48 48" width="28" height="28" fill="none">
          <rect
            x="10"
            y="14"
            width="28"
            height="20"
            rx="3"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M16 24h16M16 28h10"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity="0.55"
          />
        </svg>
      </div>
      <div>
        <p className="b3-settlement__section-empty-title">{title}</p>
        <p className="b3-settlement__section-empty-copy">{copy}</p>
      </div>
    </div>
  );
}

function MerchantCompliancePanel({
  orgId,
  orders,
  commercial,
  loading,
  canManage,
  onOpenOverride,
}: {
  orgId: string;
  orders: PaymentOrder[];
  commercial: MerchantCommercialSettings | null;
  loading: boolean;
  canManage: boolean;
  onOpenOverride: () => void;
}) {
  const [overrides, setOverrides] = useState<ComplianceOverride[]>([]);
  const [overridesLoading, setOverridesLoading] = useState(true);
  const [overridesHint, setOverridesHint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setOverridesLoading(true);
    listComplianceOverrides(orgId)
      .then((res) => {
        if (cancelled) return;
        setOverrides(res.items);
        setOverridesHint(
          res.softEmpty
            ? "Override log empty until migration 028 is applied."
            : null,
        );
      })
      .catch(() => {
        if (!cancelled) {
          setOverrides([]);
          setOverridesHint("Could not load override log.");
        }
      })
      .finally(() => {
        if (!cancelled) setOverridesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const anomalies = useMemo(
    () =>
      orders.filter(
        (o) => o.orgId === orgId && o.status === "payment_anomaly",
      ),
    [orders, orgId],
  );
  const enterprisePending = commercial?.enterpriseApprovalStatus === "pending";

  if (loading) {
    return (
      <div className="b3-agent-detail__empty" role="status">
        <div className="b3-agent-detail__empty-mark is-busy" aria-hidden>
          <span className="b3-agent-detail__activity-empty-spinner" />
        </div>
        <p className="b3-agent-detail__empty-title">Loading compliance</p>
        <p className="b3-agent-detail__empty-copy">
          Checking payment anomalies and enterprise rate status for this merchant.
        </p>
      </div>
    );
  }

  return (
    <div className="b3-compliance">
      <section className="b3-card b3-card--section b3-card--flat">
        <div className="b3-profile__head">
          <h3 className="b3-card__heading">Compliance override</h3>
          {canManage ? (
            <button
              type="button"
              className="b3-compliance__danger-btn"
              onClick={onOpenOverride}
            >
              Override…
            </button>
          ) : null}
        </div>
        <p className="b3-compliance__copy">
          Platform Owner/Administrator may change settlement, matching mode, or
          suspend order create / the merchant — MFA required; every action is
          audited.
        </p>
        {overridesHint ? (
          <p className="b3-compliance__copy">{overridesHint}</p>
        ) : null}
        {overridesLoading ? (
          <p className="b3-compliance__copy">Loading override log…</p>
        ) : overrides.length === 0 ? (
          <p className="b3-compliance__copy">No overrides recorded yet.</p>
        ) : (
          <table className="data-table b3-compliance__table">
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {overrides.slice(0, 8).map((row) => (
                <tr key={row.id}>
                  <td className="mono">
                    {new Date(row.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                  <td>{row.overrideType.replaceAll("_", " ")}</td>
                  <td>{row.reasonCode.replaceAll("_", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {enterprisePending ? (
        <section className="b3-card b3-card--section b3-card--flat">
          <div className="b3-profile__head">
            <h3 className="b3-card__heading">Enterprise rate approval</h3>
            <span className="b3-agent-detail__activity-cap">Pending</span>
          </div>
          <p className="b3-compliance__copy">
            A custom Enterprise volume fee is awaiting Platform Owner approval
            before it applies to this merchant.
          </p>
          <Link className="b3-compliance__link" to="/platform/settings/fee-tiers?tab=overrides">
            Review on Platform fees
          </Link>
        </section>
      ) : null}

      {anomalies.length > 0 ? (
        <section className="b3-card b3-card--section b3-card--flat">
          <div className="b3-profile__head">
            <h3 className="b3-card__heading">Payment anomalies</h3>
            <span className="b3-agent-detail__activity-cap">
              {anomalies.length} open
            </span>
          </div>
          <p className="b3-compliance__copy">
            On-chain payments that could not be matched cleanly to an open order.
            Resolve in the merchant portal — never mark paid from here alone.
          </p>
          <table className="data-table b3-compliance__table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {anomalies.slice(0, 8).map((order) => (
                <tr key={order.id}>
                  <td className="mono">{order.id.slice(0, 8)}…</td>
                  <td>
                    <FundAmount amount={order.payableAmount.amount} />
                  </td>
                  <td>
                    <span className="status-badge tone-anomaly">Anomaly</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {anomalies.length > 8 ? (
            <p className="b3-compliance__more muted">
              +{anomalies.length - 8} more in merchant order history
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function MerchantServiceBillsEmpty({ loading }: { loading?: boolean }) {
  return (
    <div className="b3-agent-detail__empty" role="status">
      <div
        className={`b3-agent-detail__empty-mark${loading ? " is-busy" : ""}`}
        aria-hidden
      >
        {loading ? (
          <span className="b3-agent-detail__activity-empty-spinner" />
        ) : (
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
        )}
      </div>
      <p className="b3-agent-detail__empty-title">
        {loading ? "Loading service bills" : "No service bills yet"}
      </p>
      <p className="b3-agent-detail__empty-copy">
        {loading
          ? "Fetching subscription and volume-fee invoices for this merchant."
          : "Service bills invoice subscription and volume fees to this merchant account. They appear here after each billing period is issued."}
      </p>
      {!loading ? (
        <ul className="b3-agent-detail__empty-hints">
          <li>Volume fee is billed separately from on-chain payer payments</li>
          <li>Issue bills from Platform → Service bills when ready</li>
        </ul>
      ) : null}
    </div>
  );
}

function MerchantSettlementPanel({
  matchingMode,
  settlement,
  xpubs,
  loading,
}: {
  matchingMode: string;
  settlement: SettlementAddress[];
  xpubs: XpubSettings[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="b3-agent-detail__empty" role="status">
        <div className="b3-agent-detail__empty-mark is-busy" aria-hidden>
          <span className="b3-agent-detail__activity-empty-spinner" />
        </div>
        <p className="b3-agent-detail__empty-title">Loading settlement</p>
        <p className="b3-agent-detail__empty-copy">
          Fetching matching mode, receive addresses, and watch-only xPub status.
        </p>
      </div>
    );
  }

  return (
    <div className="b3-settlement">
      <section className="b3-card b3-card--section b3-card--flat">
        <div className="b3-profile__head">
          <h3 className="b3-card__heading">Matching</h3>
        </div>
        <dl className="b3-settlement__meta">
          <div>
            <dt>Mode</dt>
            <dd>
              <span className="b3-settlement__mode-pill">
                {matchingModeLabel(matchingMode)}
              </span>
            </dd>
          </div>
          <div>
            <dt>Scope</dt>
            <dd>{matchingModeScope(matchingMode)}</dd>
          </div>
        </dl>
      </section>

      <section className="b3-card b3-card--section b3-card--flat">
        <div className="b3-profile__head">
          <h3 className="b3-card__heading">Settlement addresses</h3>
          <span className="b3-agent-detail__activity-cap">
            {settlement.length}{" "}
            {settlement.length === 1 ? "address" : "addresses"}
          </span>
        </div>
        {settlement.length === 0 ? (
          <SettlementSectionEmpty
            title="No settlement addresses"
            copy="Merchant Owner configures receive addresses in the merchant portal. Platform views them read-only."
          />
        ) : (
          <table className="data-table b3-settlement__table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Network</th>
                <th>Address</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {settlement.map((row) => (
                <tr key={`${row.asset}-${row.network}`}>
                  <td>{row.asset}</td>
                  <td>{row.network}</td>
                  <td className="mono" title={row.address}>
                    {truncateAddress(row.address)}
                  </td>
                  <td>
                    <span
                      className={`status-badge ${
                        row.status === "pending_cool_down"
                          ? "tone-warn"
                          : "tone-ok"
                      }`}
                    >
                      {row.status === "pending_cool_down"
                        ? "COOL-DOWN"
                        : "ACTIVE"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="b3-card b3-card--section b3-card--flat">
        <div className="b3-profile__head">
          <h3 className="b3-card__heading">xPub (watch-only)</h3>
          <span className="b3-agent-detail__activity-cap">
            {xpubs.length} {xpubs.length === 1 ? "network" : "networks"}
          </span>
        </div>
        {xpubs.length === 0 ? (
          <SettlementSectionEmpty
            title={
              matchingMode === "S"
                ? "No xPub registered"
                : "xPub not required for this mode"
            }
            copy={
              matchingMode === "S"
                ? "Mode S HD pools need a watch-only xPub on the merchant account. Full strings stay in the merchant portal."
                : "Only Smart address (Mode S) uses a watch-only xPub. Standard, fingerprint, and memo modes use settlement addresses alone."
            }
          />
        ) : (
          <table className="data-table b3-settlement__table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Network</th>
                <th>Configured</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {xpubs.map((row) => (
                <tr key={`${row.asset}-${row.network}`}>
                  <td>{row.asset}</td>
                  <td>{row.network}</td>
                  <td>{row.xPubConfigured ? "Yes" : "No"}</td>
                  <td>
                    <span
                      className={`status-badge ${
                        row.status === "pending_cool_down"
                          ? "tone-warn"
                          : "tone-ok"
                      }`}
                    >
                      {row.status === "pending_cool_down"
                        ? "COOL-DOWN"
                        : "ACTIVE"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="b3-settlement__notice">
        Read-only on platform — no private keys or full xPub strings are shown.
      </p>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase() || "MC";
}

function shortId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function preferredOrgEmail(members: OrgMember[]): string | null {
  const preferred =
    members.find((m) => /owner/i.test(m.role)) ??
    members.find((m) => /admin/i.test(m.role)) ??
    members[0];
  const email = preferred?.email?.trim();
  return email || null;
}

type Props = {
  org: OrgAccount;
  orgs: OrgAccount[];
  canManage: boolean;
  busy: boolean;
  initialTab?: TabId;
  onPause: () => void;
  onRun: () => void;
  onDelete: () => void;
  onOrgPatched?: (org: OrgAccount) => void;
};

const VALID_TABS = new Set<string>(TABS.map((t) => t.id));

/** B6 merchant detail — solid card shell matching `b3-agent-detail` (no gradient). */
export function MerchantDetailCard({
  org,
  orgs,
  canManage,
  busy,
  initialTab,
  onPause,
  onRun,
  onDelete,
  onOrgPatched,
}: Props) {
  const [tab, setTab] = useState<TabId>(() =>
    initialTab && VALID_TABS.has(initialTab) ? initialTab : "overview",
  );
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [complianceTick, setComplianceTick] = useState(0);

  useEffect(() => {
    if (initialTab && VALID_TABS.has(initialTab)) {
      setTab(initialTab);
    }
  }, [org.id, initialTab]);
  const [bills, setBills] = useState<ServiceBill[]>([]);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [settlement, setSettlement] = useState<SettlementAddress[]>([]);
  const [xpubs, setXpubs] = useState<XpubSettings[]>([]);
  const [matchingMode, setMatchingMode] = useState("—");
  const [commercial, setCommercial] = useState<MerchantCommercialSettings | null>(
    null,
  );
  const [tabLoading, setTabLoading] = useState(false);
  const [tabError, setTabError] = useState<string | null>(null);
  const [team, setTeam] = useState<OrgMember[]>([]);
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [commercialEditOpen, setCommercialEditOpen] = useState(false);
  const [commercialBusy, setCommercialBusy] = useState(false);
  const [commercialError, setCommercialError] = useState<string | null>(null);
  const [editTier, setEditTier] = useState<MerchantTier>("mid");
  const [editVolume, setEditVolume] = useState("");
  const [editReason, setEditReason] = useState("");
  const [feeTiers, setFeeTiers] = useState<FeeTierBand[]>([]);

  const status = org.status ?? "active";
  const structureLabel = org.structure
    ? (STRUCTURE_LABELS[org.structure] ?? org.structure.replace("_", " "))
    : "—";
  const sites = useMemo(() => merchantSites(org.id, orgs), [org.id, orgs]);
  const merchantBills = useMemo(
    () => bills.filter((b) => b.orgId === org.id),
    [bills, org.id],
  );
  const profileEmail = useMemo(
    () => preferredOrgEmail(team) ?? "—",
    [team],
  );
  const periodStart = useMemo(
    () => merchantBillingPeriodStartMs(org.createdAt ?? new Date().toISOString()),
    [org.createdAt],
  );
  const mtdOrders = useMemo(
    () =>
      orders.filter((o) => {
        const created = o.createdAt ? Date.parse(o.createdAt) : NaN;
        return Number.isFinite(created) ? created >= periodStart : true;
      }),
    [orders, periodStart],
  );
  const settledVolume = useMemo(() => {
    let total = 0;
    for (const o of mtdOrders) {
      if (o.status !== "completed") continue;
      const n = Number(o.payableAmount.amount);
      if (Number.isFinite(n)) total += n;
    }
    return total;
  }, [mtdOrders]);
  const displayVolume = settledVolume;
  const displayOrders = mtdOrders.length;
  const feePct = Number(commercial?.volumeFeePercent);
  const displayPlatformFeeMtd =
    Number.isFinite(feePct) && settledVolume > 0
      ? Math.round(settledVolume * (feePct / 100) * 100) / 100
      : 0;
  const recentActivity = useMemo(() => {
    const feed = mergeActivityFeed(
      audit,
      org.id,
      (action) => AUDIT_LABEL[action] ?? action.replace(/_/g, " "),
      RECENT_ACTIVITY_LIMIT,
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
  }, [audit, org.id, org.name, org.createdAt]);

  useEffect(() => {
    setTab("overview");
    setTabError(null);
    setCommercial(null);
    setTeam([]);
    setAudit([]);
    setOrders([]);
    setSettlement([]);
    setXpubs([]);
    setMatchingMode("—");
    setBills([]);
    setCommercialEditOpen(false);
    setCommercialError(null);
  }, [org.id]);

  const selectedBand = useMemo(
    () => feeTiers.find((t) => t.tier === editTier) ?? null,
    [feeTiers, editTier],
  );

  useEffect(() => {
    if (!commercialEditOpen || !canManage) return;
    void getFeeTierSettings()
      .then((settings) => setFeeTiers(settings.tiers))
      .catch(() => setFeeTiers([]));
  }, [commercialEditOpen, canManage]);

  useEffect(() => {
    if (!commercialEditOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !commercialBusy) setCommercialEditOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commercialEditOpen, commercialBusy]);

  async function saveCommercial() {
    if (!canManage || commercialBusy || !commercial) return;
    setCommercialBusy(true);
    setCommercialError(null);
    try {
      const updated = await updateMerchantCommercial(org.id, {
        tier: editTier,
        volumeFeePercent: editVolume.trim(),
        reason: editReason.trim() || undefined,
      });
      setCommercial(updated);
      setCommercialEditOpen(false);
      setEditReason("");
    } catch (err) {
      setCommercialError(
        err instanceof ApiError ? err.message : "Could not update commercial tier",
      );
    } finally {
      setCommercialBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setOverviewLoading(true);
    void getOrgOverview(org.id)
      .then((data) => {
        if (cancelled) return;
        setTeam(data.team);
        setAudit(data.audit);
        setCommercial(data.commercial);
        setOrders(data.orders);
      })
      .catch(() => {
        if (!cancelled) {
          setTeam([]);
          setAudit([]);
          setCommercial(null);
          setOrders([]);
        }
      })
      .finally(() => {
        if (!cancelled) setOverviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [org.id]);

  useEffect(() => {
    if (tab === "overview" || tab === "compliance") return;
    let cancelled = false;
    setTabLoading(true);
    setTabError(null);
    (async () => {
      try {
        if (tab === "settlement") {
          const [addrs, xp, mode] = await Promise.all([
            listSettlement(org.id),
            listXpub(org.id),
            getMatchingMode(org.id),
          ]);
          if (!cancelled) {
            setSettlement(addrs);
            setXpubs(xp);
            setMatchingMode(mode.matchingMode);
          }
        } else if (tab === "service-bills") {
          const rows = await listServiceBills({ orgId: org.id });
          if (!cancelled) setBills(rows);
        }
      } catch (err) {
        if (!cancelled) {
          setTabError(err instanceof ApiError ? err.message : "Failed to load tab");
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
    <aside className="b3-agent-detail" aria-label="Merchant detail">
      <AuthToast
        message={tabError ?? commercialError}
        tone="error"
        onDismiss={() => {
          setTabError(null);
          setCommercialError(null);
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
            {profileEmail !== "—" ? (
              <a
                className="b3-agent-detail__email"
                href={`mailto:${profileEmail}`}
                title={profileEmail}
              >
                {profileEmail}
              </a>
            ) : (
              <span className="b3-agent-detail__email">{profileEmail}</span>
            )}
          </div>
        </div>
        <div className="b3-agent-detail__head-actions">
          {canManage ? (
            <>
              <button
                type="button"
                className="b3-agent-detail__suspend b3-agent-detail__override"
                disabled={busy}
                onClick={() => setOverrideOpen(true)}
              >
                Override
              </button>
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

      <div className="b3-agent-detail__tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className={`b3-agent-detail__tab${tab === t.id ? " is-active" : ""}`}
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="b3-agent-detail__body">
        {tab === "overview" ? (
          <>
            <div className="b3-agent-detail__kpis b3-agent-detail__kpis--3">
              <div className="b3-card glass-tone-slate b3-card--kpi">
                <p className="b3-card__label">Volume (MTD)</p>
                <p className="b3-card__value b3-card__value--ok">
                  <FundAmount amount={displayVolume} />
                </p>
              </div>
              <div className="b3-card glass-tone-blue b3-card--kpi">
                <p className="b3-card__label">Orders (MTD)</p>
                <p className="b3-card__value">{displayOrders}</p>
              </div>
              <div className="b3-card glass-tone-emerald b3-card--kpi">
                <p className="b3-card__label">Platform fee (MTD)</p>
                <p className="b3-card__value b3-card__value--ok">
                  <FundAmount amount={displayPlatformFeeMtd} />
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
                    <p className="b3-profile__label">Structure</p>
                    <p className="b3-profile__value">{structureLabel}</p>
                  </div>
                  <div className="b3-profile__field">
                    <div className="b3-profile__field-head">
                      <p className="b3-profile__label">Commercial tier</p>
                      <div className="b3-profile__field-head-end">
                        {overviewLoading && !commercial ? (
                          <p className="b3-profile__value">…</p>
                        ) : commercial ? (
                          <>
                            <span className="b3-profile__pill b3-profile__pill--tier">
                              {tierLabel(commercial.tier)}
                            </span>
                            {canManage ? (
                              <button
                                type="button"
                                className="b3-profile__edit-btn"
                                disabled={busy || commercialBusy}
                                onClick={() => {
                                  setEditTier(commercial.tier as MerchantTier);
                                  setEditVolume(commercial.volumeFeePercent);
                                  setEditReason("");
                                  setCommercialError(null);
                                  setCommercialEditOpen(true);
                                }}
                              >
                                Edit
                              </button>
                            ) : null}
                          </>
                        ) : (
                          <p className="b3-profile__value">—</p>
                        )}
                      </div>
                    </div>
                    {commercial ? (
                      <p className="b3-profile__meta">
                        {commercial.volumeFeePercent}% volume fee ·{" "}
                        <FundAmount amount={commercial.subscriptionAmountUsd} />{" "}
                        / mo subscription
                        {commercial.enterpriseApprovalStatus === "pending" ? (
                          <> · Enterprise rate pending approval</>
                        ) : null}
                        {commercial.pendingVolumeFeePercent &&
                        commercial.pendingVolumeFeePercent !==
                          commercial.volumeFeePercent ? (
                          <>
                            {" "}
                            · {commercial.pendingVolumeFeePercent}% scheduled
                            from {formatOnboardDate(commercial.effectiveFrom)}
                          </>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                  <div className="b3-profile__field">
                    <p className="b3-profile__label">Sites</p>
                    <p className="b3-profile__value">{sites.length}</p>
                  </div>
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

        {tab === "sites" ? (
          sites.length === 0 ? (
            <MerchantSitesEmpty structure={org.structure} />
          ) : (
            <section className="b3-card b3-card--section b3-card--flat b3-merchant-sites">
              <div className="b3-profile__head">
                <h3 className="b3-card__heading">Merchant sites</h3>
                <span className="b3-agent-detail__activity-cap">
                  {sites.length} {sites.length === 1 ? "site" : "sites"}
                </span>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Site name</th>
                    <th>Status</th>
                    <th>ID</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((site) => (
                    <tr key={site.id}>
                      <td>{site.name}</td>
                      <td>
                        <span
                          className={`status-badge ${
                            site.status === "paused" ? "tone-warn" : "tone-ok"
                          }`}
                        >
                          {(site.status ?? "active").toUpperCase()}
                        </span>
                      </td>
                      <td className="mono">{shortId(site.id)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )
        ) : null}

        {tab === "settlement" ? (
          <MerchantSettlementPanel
            matchingMode={matchingMode}
            settlement={settlement}
            xpubs={xpubs}
            loading={tabLoading}
          />
        ) : null}

        {tab === "service-bills" ? (
          tabLoading || merchantBills.length === 0 ? (
            <MerchantServiceBillsEmpty loading={tabLoading} />
          ) : (
            <section className="b3-card b3-card--section b3-card--flat">
              <div className="b3-profile__head">
                <h3 className="b3-card__heading">Service bills</h3>
                <span className="b3-agent-detail__activity-cap">
                  {merchantBills.length}{" "}
                  {merchantBills.length === 1 ? "bill" : "bills"}
                </span>
              </div>
              <table className="data-table plat-bills__embed">
                <thead>
                  <tr>
                    <th>Bill</th>
                    <th>Total</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {merchantBills.map((bill) => {
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
                          <Link to={`/platform/service-bills/${bill.id}`}>View</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )
        ) : null}

        {tab === "compliance" ? (
          <MerchantCompliancePanel
            key={`${org.id}-${complianceTick}`}
            orgId={org.id}
            orders={orders}
            commercial={commercial}
            loading={overviewLoading}
            canManage={canManage}
            onOpenOverride={() => setOverrideOpen(true)}
          />
        ) : null}
      </div>

      {overrideOpen ? (
        <ComplianceOverrideModal
          org={org}
          canApply={canManage}
          onClose={() => setOverrideOpen(false)}
          onApplied={({ org: next }) => {
            setComplianceTick((n) => n + 1);
            if (next) onOrgPatched?.(next);
            upsertPlatformAlert({
              id: `compliance-override-${org.id}`,
              category: "security",
              title: "Compliance override applied",
              body: `Override logged for ${org.name}.`,
              at: relativeAlertTime(),
              unread: true,
              tone: "warn",
              href: `/platform/merchants?id=${encodeURIComponent(org.id)}&tab=compliance`,
              hrefLabel: "Open merchant",
            });
          }}
        />
      ) : null}

      {commercialEditOpen && commercial
        ? createPortal(
            <div
              className="b3-commission-modal-backdrop"
              role="presentation"
              onClick={() => {
                if (!commercialBusy) setCommercialEditOpen(false);
              }}
            >
              <div
                className="b3-commission-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="merchant-commercial-edit-title"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="b3-commission-modal__head">
                  <h3 id="merchant-commercial-edit-title">Edit commercial tier</h3>
                  <button
                    type="button"
                    className="b3-commission-modal__close"
                    aria-label="Close"
                    disabled={commercialBusy}
                    onClick={() => setCommercialEditOpen(false)}
                  >
                    ×
                  </button>
                </header>
                <div className="b3-commission-modal__body">
                  <p className="b3-commission-modal__hint">
                    Set the merchant tier and volume fee within platform bands.
                    The new rate applies immediately. Enterprise custom rates
                    outside the band require Compliance approval.
                  </p>
                  <label className="b3-commission-modal__field">
                    <span className="b3-commission-modal__label">
                      Commercial tier
                    </span>
                    <select
                      className="b3-commission-modal__select"
                      value={editTier}
                      disabled={commercialBusy}
                      onChange={(e) => {
                        const tier = e.target.value as MerchantTier;
                        setEditTier(tier);
                        setEditVolume(defaultVolumeForTier(feeTiers, tier));
                      }}
                    >
                      {MERCHANT_TIERS.map((t) => (
                        <option key={t} value={t}>
                          {tierLabel(t)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="b3-commission-modal__field">
                    <span className="b3-commission-modal__label">
                      Volume fee rate
                    </span>
                    <div className="b3-commission-modal__input-wrap">
                      <input
                        className="b3-commission-modal__input"
                        type="text"
                        inputMode="decimal"
                        value={editVolume}
                        disabled={commercialBusy}
                        onChange={(e) => setEditVolume(e.target.value)}
                        autoFocus
                      />
                      <span className="b3-commission-modal__suffix">%</span>
                    </div>
                    {selectedBand ? (
                      <span className="b3-commission-modal__band">
                        Allowed band: {selectedBand.volumeFeeMinPercent}% –{" "}
                        {selectedBand.volumeFeeMaxPercent}%
                      </span>
                    ) : commercial.tier === editTier ? (
                      <span className="b3-commission-modal__band">
                        Allowed band: {commercial.bandMinPercent}% –{" "}
                        {commercial.bandMaxPercent}%
                      </span>
                    ) : null}
                  </label>
                  <label className="b3-commission-modal__field">
                    <span className="b3-commission-modal__label">
                      Note (optional)
                    </span>
                    <textarea
                      className="b3-suspend-modal__reason"
                      rows={2}
                      value={editReason}
                      disabled={commercialBusy}
                      onChange={(e) => setEditReason(e.target.value)}
                      placeholder="e.g. agent request, tier upgrade, promotional rate"
                    />
                  </label>
                </div>
                <footer className="b3-commission-modal__foot">
                  <button
                    type="button"
                    className="b3-commission-modal__cancel"
                    disabled={commercialBusy}
                    onClick={() => setCommercialEditOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="b3-commission-modal__save"
                    disabled={commercialBusy || !editVolume.trim()}
                    onClick={() => void saveCommercial()}
                  >
                    {commercialBusy ? "Saving…" : "Save changes"}
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
