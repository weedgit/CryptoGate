import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { platformRoute } from "../shared/portalRouting";
import { AuthToast } from "../auth/AuthToast";
import { InviteCredentialsPanel } from "../auth/InviteCredentialsPanel";
import type { OnboardInviteCreds } from "../shared/onboardInviteState";
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
  patchOrgProfile,
  type ComplianceOverride,
  type FeeTierBand,
  type AuditLogEntry,
  type MerchantCommercialSettings,
  type OrgAccount,
  type OrgPrimaryOwnerContact,
  type PaymentOrder,
  type ServiceBill,
  type SettlementAddress,
  type XpubSettings,
} from "./api";
import { ComplianceOverrideModal } from "./ComplianceOverrideModal";
import type { Session } from "../merchant/api";
import { relativeAlertTime, upsertPlatformAlert } from "./platformAlerts";
import {
  merchantSites,
} from "./merchantSubtree";
import { FundAmount } from "./FundAmount";
import { OrgBrandMark } from "../shared/OrgBrandMark";
import { OrgProfileEditModal } from "../shared/OrgProfileEditModal";
import { AccountOverviewProfile } from "../shared/AccountOverviewProfile";
import { AccountsDetailHero } from "./AccountsDetailHero";
import {
  formatOnboardDate,
  merchantBillingPeriodStartMs,
  mergeActivityFeed,
  RECENT_ACTIVITY_LIMIT,
  truncateAddress,
} from "./orgDetailSeeds";
import { tierLabel } from "../commercialLabels";
import type { MerchantTier } from "../commercialLabels";
import { matchingModeLabel, matchingModeScope, matchingModeTooltip } from "../merchant/matchingLabels";
import { displayNetworkForPair } from "../shared/assetNetworks";
import { CopyableChainValue } from "../shared/CopyableChainValue";
import { AssetIcon, NetworkIcon } from "./cryptoIcons";
import {
  formatBillId,
  serviceBillStatusLabel,
  serviceBillStatusTone,
} from "./serviceBillStatus";
import { formatShortDate, orgTypeLabel, sessionIsPlatformOwner } from "./org";

const TABS = [
  { id: "overview", label: "Overview" },
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
          <span className="cg-spinner cg-spinner--sm b3-agent-detail__activity-empty-spinner" />
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
          to={platformRoute("audit")}
          title="Open platform audit log"
        >
          Platform audit log
          <span aria-hidden>→</span>
        </Link>
      ) : null}
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

const XPUB_HELP =
  "An xPub is a watch-only key from the merchant’s wallet. PaymentGate can derive temporary receive addresses from it when Smart address matching needs them — but it cannot spend or move funds. Private keys never leave the merchant. Standard, amount fingerprint, and memo modes do not need an xPub; they use the fixed settlement address only.";

const COMPLIANCE_OVERRIDE_HELP =
  "Break-glass controls for Platform Owner or Administrator only. You can change where funds settle, switch how payments are matched, stop new payment orders, or suspend the merchant. Every change needs MFA and is saved in the audit log — guests and cashiers cannot use this.";

function SettlementHelpTip({ text }: { text: string }) {
  return (
    <span className="plat-card-help b3-settlement__heading-help">
      <button type="button" className="plat-card-help__btn" aria-label={text}>
        ?
      </button>
      <span className="plat-card-help__tip" role="tooltip">
        {text}
      </span>
    </span>
  );
}

function MerchantCompliancePanel({
  org,
  session,
  commercial,
  canManage,
  onApplied,
}: {
  org: OrgAccount;
  session: Session;
  commercial: MerchantCommercialSettings | null;
  canManage: boolean;
  onApplied: (result: { org?: OrgAccount }) => void;
}) {
  const orgId = org.id;
  const [overrides, setOverrides] = useState<ComplianceOverride[]>([]);
  const [overridesLoading, setOverridesLoading] = useState(true);
  const [overridesHint, setOverridesHint] = useState<string | null>(null);
  const [historyTick, setHistoryTick] = useState(0);

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
  }, [orgId, historyTick]);

  const enterprisePending = commercial?.enterpriseApprovalStatus === "pending";

  return (
    <div className="b3-compliance">
      <section className="b3-card b3-card--section b3-card--flat b3-compliance__apply-card">
        <div className="b3-profile__head">
          <h3 className="b3-card__heading b3-settlement__heading-with-help">
            Compliance override
            <SettlementHelpTip text={COMPLIANCE_OVERRIDE_HELP} />
          </h3>
        </div>
        <ComplianceOverrideModal
          org={org}
          session={session}
          canApply={canManage}
          variant="inline"
          onApplied={(result) => {
            setHistoryTick((n) => n + 1);
            onApplied(result);
          }}
        />
      </section>

      <section className="b3-card b3-card--section b3-card--flat">
        <div className="b3-profile__head">
          <h3 className="b3-card__heading">Override history</h3>
          <span className="b3-agent-detail__activity-cap">
            {overridesLoading ? "…" : `${overrides.length} recorded`}
          </span>
        </div>
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
          <Link className="b3-compliance__link" to={platformRoute("settings/fee-tiers?tab=overrides")}>
            Review on Platform fees
          </Link>
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
          <span className="cg-spinner cg-spinner--sm b3-agent-detail__activity-empty-spinner" />
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
          <span className="cg-spinner cg-spinner--sm b3-agent-detail__activity-empty-spinner" />
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
            <dt>
              <span className="b3-settlement__meta-label">
                Mode
                <span className="plat-card-help b3-settlement__meta-help">
                  <button
                    type="button"
                    className="plat-card-help__btn"
                    aria-label={matchingModeTooltip(matchingMode)}
                  >
                    ?
                  </button>
                  <span className="plat-card-help__tip" role="tooltip">
                    {matchingModeTooltip(matchingMode)}
                  </span>
                </span>
              </span>
            </dt>
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
                  <td>
                    <span className="b3-settlement__pair-cell">
                      <AssetIcon asset={row.asset} />
                      <span>{row.asset}</span>
                    </span>
                  </td>
                  <td>
                    <span className="b3-settlement__pair-cell">
                      <NetworkIcon network={row.network} />
                      <span>{displayNetworkForPair(row.asset, row.network)}</span>
                    </span>
                  </td>
                  <td>
                    <CopyableChainValue
                      className="b3-settlement__addr-value"
                      value={row.address}
                      network={row.network}
                      kind="address"
                      display={truncateAddress(row.address)}
                    />
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

      <section className="b3-card b3-card--section b3-card--flat b3-settlement__xpub-card">
        <div className="b3-profile__head">
          <h3 className="b3-card__heading b3-settlement__heading-with-help">
            xPub (watch-only)
            <SettlementHelpTip text={XPUB_HELP} />
          </h3>
          <span className="b3-agent-detail__activity-cap">
            {xpubs.length} {xpubs.length === 1 ? "network" : "networks"}
          </span>
        </div>
        {xpubs.length === 0 ? (
          <SettlementSectionEmpty
            title={
              matchingMode === "S"
                ? "No xPub registered"
                : "Not needed for this matching mode"
            }
            copy={
              matchingMode === "S"
                ? "Smart address needs a watch-only xPub so temporary receive addresses can be created when two open orders would collide. The merchant registers it in their portal — full xPub strings are not shown here."
                : "This merchant uses a matching mode that only needs a fixed settlement address. An xPub is only required for Smart address matching."
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
                  <td>
                    <span className="b3-settlement__pair-cell">
                      <AssetIcon asset={row.asset} />
                      <span>{row.asset}</span>
                    </span>
                  </td>
                  <td>
                    <span className="b3-settlement__pair-cell">
                      <NetworkIcon network={row.network} />
                      <span>{displayNetworkForPair(row.asset, row.network)}</span>
                    </span>
                  </td>
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

type Props = {
  org: OrgAccount;
  orgs: OrgAccount[];
  session: Session;
  canManage: boolean;
  busy: boolean;
  initialTab?: TabId;
  onPause: () => void;
  onRun: () => void;
  onDelete: () => void;
  onOrgPatched?: (org: OrgAccount) => void;
  inviteCreds?: OnboardInviteCreds | null;
};

const VALID_TABS = new Set<string>(TABS.map((t) => t.id));

/** B6 merchant detail — solid card shell matching `b3-agent-detail` (no gradient). */
export function MerchantDetailCard({
  org,
  orgs,
  session,
  canManage,
  busy,
  initialTab,
  onPause,
  onRun,
  onDelete,
  onOrgPatched,
  inviteCreds,
}: Props) {
  const canEditCommercial = useMemo(
    () => sessionIsPlatformOwner(session),
    [session],
  );
  const canSupportOwner = canEditCommercial;
  const [primaryOwner, setPrimaryOwner] = useState<OrgPrimaryOwnerContact | null>(
    null,
  );
  const [tab, setTab] = useState<TabId>(() =>
    initialTab && VALID_TABS.has(initialTab) ? initialTab : "overview",
  );

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
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [profileEditBusy, setProfileEditBusy] = useState(false);
  const [profileEditError, setProfileEditError] = useState<string | null>(null);
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
  const sites = useMemo(() => merchantSites(org.id, orgs), [org.id, orgs]);
  const merchantBills = useMemo(
    () => bills.filter((b) => b.orgId === org.id),
    [bills, org.id],
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
    setTab(
      initialTab && VALID_TABS.has(initialTab)
        ? (initialTab as TabId)
        : "overview",
    );
    setTabError(null);
    setCommercial(null);
    setAudit([]);
    setOrders([]);
    setSettlement([]);
    setXpubs([]);
    setMatchingMode("—");
    setBills([]);
    setCommercialEditOpen(false);
    setCommercialError(null);
    setPrimaryOwner(null);
  }, [org.id, initialTab]);

  const selectedBand = useMemo(
    () => feeTiers.find((t) => t.tier === editTier) ?? null,
    [feeTiers, editTier],
  );

  useEffect(() => {
    if (!commercialEditOpen || !canEditCommercial) return;
    void getFeeTierSettings()
      .then((settings) => setFeeTiers(settings.tiers))
      .catch(() => setFeeTiers([]));
  }, [commercialEditOpen, canEditCommercial]);

  useEffect(() => {
    if (!commercialEditOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !commercialBusy) setCommercialEditOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commercialEditOpen, commercialBusy]);

  async function saveCommercial() {
    if (!canEditCommercial || commercialBusy || !commercial) return;
    setCommercialBusy(true);
    setCommercialError(null);
    try {
      const updated = await updateMerchantCommercial(org.id, {
        tier: editTier,
        volumeFeePercent: editVolume.trim(),
        rateMode: "fixed",
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

  async function resetCommercialToSchedule() {
    if (!canEditCommercial || commercialBusy || !commercial) return;
    setCommercialBusy(true);
    setCommercialError(null);
    try {
      const updated = await updateMerchantCommercial(org.id, {
        rateMode: "automatic",
        reason: editReason.trim() || "reset to volume schedule",
      });
      setCommercial(updated);
      setCommercialEditOpen(false);
      setEditReason("");
    } catch (err) {
      setCommercialError(
        err instanceof ApiError ? err.message : "Could not reset to schedule",
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
        setAudit(data.audit);
        setCommercial(data.commercial);
        setOrders(data.orders);
        const contact = data.primaryOwnerContact ?? null;
        if (contact) {
          setPrimaryOwner(contact);
        } else {
          const ownerRow =
            (data.team ?? []).find((m) => m.role === "owner") ??
            (data.team ?? [])[0] ??
            null;
          setPrimaryOwner(
            ownerRow
              ? {
                  userId: ownerRow.userId,
                  email: ownerRow.email,
                  phone: null,
                  timezone: "",
                  emailVerified: false,
                  phoneVerified: false,
                  firstName: null,
                  lastName: null,
                }
              : null,
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAudit([]);
          setCommercial(null);
          setOrders([]);
          setPrimaryOwner(null);
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
    <aside className="platform-detail b3-agent-detail" aria-label="Merchant detail">
      <AuthToast
        message={tabError ?? commercialError}
        tone="error"
        onDismiss={() => {
          setTabError(null);
          setCommercialError(null);
        }}
      />
      <AccountsDetailHero
        eyebrow={orgTypeLabel(org.type)}
        title={org.name}
        mark={
          <div className="platform-detail__mark-wrap b3-agent-detail__avatar-wrap">
            <OrgBrandMark
              name={org.name}
              iconKey={org.iconKey}
              size={72}
              className="platform-detail__mark b3-agent-detail__avatar"
            />
            {canManage ? (
              <button
                type="button"
                className="b3-agent-detail__avatar-edit"
                disabled={busy || profileEditBusy}
                onClick={() => {
                  setProfileEditError(null);
                  setProfileEditOpen(true);
                }}
                title="Edit name and icon"
              >
                Edit
              </button>
            ) : null}
          </div>
        }
        status={
          <span
            className={`platform-detail__status${
              status === "paused" ? " is-paused" : ""
            }`}
          >
            {status === "paused" ? "PAUSED" : "ACTIVE"}
          </span>
        }
        actions={
          canManage ? (
            <>
              <Link
                className="b3-agent-detail__onboard"
                to={`${platformRoute("sites/new")}?parentId=${encodeURIComponent(org.id)}`}
              >
                New Site
              </Link>
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
          ) : null
        }
      />

      <OrgProfileEditModal
        open={profileEditOpen}
        name={org.name}
        iconKey={org.iconKey}
        country={org.country}
        legalName={org.legalName}
        billingEmail={org.billingEmail}
        requireCountry={true}
        busy={profileEditBusy}
        error={profileEditError}
        onClose={() => {
          if (!profileEditBusy) setProfileEditOpen(false);
        }}
        onSave={async (next) => {
          setProfileEditBusy(true);
          setProfileEditError(null);
          try {
            const updated = await patchOrgProfile(org.id, next);
            onOrgPatched?.(updated);
            setProfileEditOpen(false);
          } catch (err) {
            setProfileEditError(
              err instanceof ApiError ? err.message : "Failed to update profile",
            );
          } finally {
            setProfileEditBusy(false);
          }
        }}
      />

      {inviteCreds ? (
        <div className="b3-agent-detail__invite-creds">
          <InviteCredentialsPanel
            email={inviteCreds.invitedEmail}
            temporaryPassword={inviteCreds.temporaryPassword}
            inviteUrl={inviteCreds.inviteUrl}
            invitePath={inviteCreds.invitePath}
            emailDeliveryStatus={inviteCreds.emailDelivery?.status}
          />
        </div>
      ) : null}

      <div className="platform-detail__body b3-agent-detail__shell">
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
              <AccountOverviewProfile
                org={org}
                owner={primaryOwner}
                ownerLoading={overviewLoading && !primaryOwner}
                canEditOrg={canManage}
                canEditOwner={canSupportOwner}
                onEditOrg={() => {
                  setProfileEditError(null);
                  setProfileEditOpen(true);
                }}
                onOwnerUpdated={setPrimaryOwner}
                extras={
                  <>
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
                              {canEditCommercial ? (
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
                          {commercial.rateMode === "fixed" ? "Fixed" : "Automatic"}{" "}
                          · {commercial.volumeFeePercent}% volume fee ·{" "}
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
                  </>
                }
              />

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
                      to={platformRoute("audit")}
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
                            to={platformRoute(`service-bills/${bill.id}`)}
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
                          <Link to={platformRoute(`service-bills/${bill.id}`)}>View</Link>
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
            org={org}
            session={session}
            commercial={commercial}
            canManage={canManage}
            onApplied={({ org: next }) => {
              if (next) onOrgPatched?.(next);
              upsertPlatformAlert({
                id: `compliance-override-${org.id}`,
                category: "security",
                title: "Compliance override applied",
                body: `Override logged for ${org.name}.`,
                at: relativeAlertTime(),
                unread: true,
                tone: "warn",
                /** Notice only — action already done; do not pin Action required dock. */
                unresolved: false,
                href: `${platformRoute(`accounts/merchants/${encodeURIComponent(org.id)}`)}?tab=compliance`,
                hrefLabel: "Open merchant",
              });
            }}
          />
        ) : null}
      </div>
      </div>

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
                    Lock a fixed special rate (Platform Owner). Automatic
                    merchants follow the volume schedule at bill time. Fixed
                    rates apply immediately and skip band approval.
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
                    className="b3-commission-modal__cancel"
                    disabled={commercialBusy}
                    onClick={() => void resetCommercialToSchedule()}
                  >
                    Use schedule
                  </button>
                  <button
                    type="button"
                    className="b3-commission-modal__save"
                    disabled={commercialBusy || !editVolume.trim()}
                    onClick={() => void saveCommercial()}
                  >
                    {commercialBusy ? "Saving…" : "Lock fixed rate"}
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
