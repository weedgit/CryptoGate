import { useEffect, useMemo, useState } from "react";
import { useProfileUpdatedTick } from "../shared/profileUpdated";
import { businessTimezoneField } from "../shared/businessTimezone";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { platformRoute } from "../shared/portalRouting";
import { billsReviewQuery, volumeReviewQuery } from "./accountReviewLinks";
import { useAccountsPortal } from "./accountsPortal";
import { AuthToast } from "../auth/AuthToast";
import { MfaStepUpGate } from "../auth/MfaStepUpGate";
import { InviteCredentialsPanel } from "../auth/InviteCredentialsPanel";
import type { OnboardInviteCreds } from "../shared/onboardInviteState";
import {
  ApiError,
  getBillingCalendarSettings,
  getFeeTierSettings,
  getMatchingMode,
  getOrgOverview,
  ownerContactFromTeam,
  ownerContactWithMfa,
  listSettlement,
  listXpub,
  updateMerchantCommercial,
  patchOrgProfile,
  type FeeTierBand,
  type AuditLogEntry,
  type MerchantCommercialSettings,
  type OrgAccount,
  type OrgMember,
  type OrgPrimaryOwnerContact,
  type OrgOverviewMetrics,
  type SettlementAddress,
  type XpubSettings,
} from "./api";
import {
  getMerchantPricingSettings,
  putMatchingMode,
  putMerchantPricingSettings,
  putXpub,
  type Session,
} from "../merchant/api";
import { FundAmount } from "./FundAmount";
import { AnimatedText } from "../shared/AnimatedText";
import { OrgBrandMark } from "../shared/OrgBrandMark";
import {
  OrgProfileEditModal,
} from "../shared/OrgProfileEditModal";
import { AccountOverviewProfile } from "../shared/AccountOverviewProfile";
import { AccountsDetailHero } from "./AccountsDetailHero";
import {
  mergeActivityFeed,
  RECENT_ACTIVITY_LIMIT,
} from "./orgDetailSeeds";
import {
  billingScheduleParts,
  billingScheduleSummary,
  tierLabel,
  waivedMonthsLabel,
} from "../commercialLabels";
import { tierForMonthlyVolume, type MerchantTier } from "../commercialLabels";
import { orgTypeLabel, sessionCanManagePlatform, sessionIsPlatformOwner } from "./org";
import { OrgTeamRoster } from "./OrgTeamRoster";
import { DetailActivityCard } from "./DetailActivityTable";
import { MerchantSettlementPanel } from "./MerchantSettlementPanel";
import { OrgNetworkRailPanel } from "./OrgNetworkRailPanel";
import { KpiChartIcon, KpiCoinsIcon, KpiPeopleIcon } from "./detailKpiMarks";
import {
  HeroPauseIcon,
  HeroPersonPlusIcon,
  HeroPlayIcon,
  HeroTrashIcon,
} from "./detailHeroIcons";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "team", label: "Team" },
  { id: "cashiers", label: "Cashiers" },
  { id: "networks", label: "Networks" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const MERCHANT_TIERS: MerchantTier[] = ["small", "mid", "enterprise"];

const PRICING_MODE_LABEL: Record<string, string> = {
  pegged_1to1: "Pegged 1:1",
  market: "Always market",
  token_to_usd: "Token amount to USD",
  usd_to_token: "USD to token",
};

function defaultVolumeForTier(tiers: FeeTierBand[], tier: MerchantTier): string {
  const band = tiers.find((t) => t.tier === tier);
  return band?.defaultSignupPercent ?? "1.5";
}

/** 2.0 → 2, 1.20 → 1.2, 1.05 → 1.05 */
function formatRatePercent(raw: string | null | undefined): string | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2).replace(/\.?0+$/, "");
}

const AUDIT_LABEL: Record<string, string> = {
  login: "Sign-in",
  org_create: "Org created",
  org_status: "Status changed",
  org_user_invite: "Team invite",
  service_bill_issue: "Service bill issued",
  service_bill_mark_paid: "Bill marked paid",
  service_bill_waive: "Bill waived",
  service_bill_cancel: "Bill cancelled",
  service_bill_void: "Bill cancelled",
  service_bill_adjust: "Bill adjusted",
  billing_waiver_put: "Billing waiver set",
  billing_waiver_delete: "Billing waiver removed",
  compliance_override: "Compliance override",
};

function ActivitySectionEmpty({ loading }: { loading?: boolean }) {
  const portal = useAccountsPortal();
  const auditHref = portal ? portal.auditHref : platformRoute("audit");
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
          : "Sign-ins, team invites, and status changes appear here when recorded."}
      </p>
      {!loading && auditHref ? (
        <Link
          className="b3-agent-detail__activity-audit b3-agent-detail__activity-audit--inline"
          to={auditHref}
          title="Open platform audit log"
        >
          Platform audit log
          <span aria-hidden>→</span>
        </Link>
      ) : null}
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

type MerchantEditSave = {
  name: string;
  iconKey: string | null;
  country: string;
  legalName: string;
  billingEmail: string;
  merchant?: {
    rateMode: "automatic" | "fixed";
    tier: string;
    volumeFeePercent: string;
    matchingMode: string;
    pricingMode: string;
    publicKey?: string;
  };
};

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
  const portal = useAccountsPortal();
  const route = portal?.route ?? platformRoute;
  const auditHref = portal ? portal.auditHref : platformRoute("audit");
  const canEditCommercial = useMemo(
    () => (portal ? false : sessionCanManagePlatform(session)),
    [portal, session],
  );
  const canLockFixedRates = useMemo(
    () => (portal ? false : sessionIsPlatformOwner(session)),
    [portal, session],
  );
  const canSupportOwner = useMemo(
    () => (portal ? false : sessionIsPlatformOwner(session)),
    [portal, session],
  );
  const canOnboardHere = portal ? portal.canOnboardUnder(org) : canManage;
  const canLifecycleHere = portal ? portal.canLifecycle(org) : canManage;
  const canEditOrg = portal ? portal.canEditProfile(org) : canManage;
  const canManageTeam = portal ? portal.canManageTeam(org) : canManage;
  /** Network rail settings are Platform-only on the API. */
  const tabs = portal ? TABS.filter((t) => t.id !== "networks") : TABS;
  const [primaryOwner, setPrimaryOwner] = useState<OrgPrimaryOwnerContact | null>(
    null,
  );
  const [tab, setTab] = useState<TabId>(() =>
    initialTab && VALID_TABS.has(initialTab) ? initialTab : "overview",
  );

  const [metrics, setMetrics] = useState<OrgOverviewMetrics | null>(null);
  const [team, setTeam] = useState<OrgMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [settlement, setSettlement] = useState<SettlementAddress[]>([]);
  const [xpubs, setXpubs] = useState<XpubSettings[]>([]);
  const [matchingMode, setMatchingMode] = useState("—");
  const [pricingMode, setPricingMode] = useState("");
  const [commercial, setCommercial] = useState<MerchantCommercialSettings | null>(
    null,
  );
  const [tabLoading, setTabLoading] = useState(false);
  const [tabError, setTabError] = useState<string | null>(null);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [profileEditBusy, setProfileEditBusy] = useState(false);
  const [pendingOrgSave, setPendingOrgSave] = useState<MerchantEditSave | null>(null);
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
  const [activationFeeUsd, setActivationFeeUsd] = useState("49.00");
  const [localOrg, setLocalOrg] = useState<OrgAccount>(org);

  useEffect(() => {
    setLocalOrg(org);
  }, [org]);

  const status = localOrg.status ?? "active";
  const settledVolume = metrics?.settledVolumeMtdUsd ?? 0;
  const displayVolume = settledVolume;
  const cashierCount = team.filter((member) => member.role === "cashier").length;
  const scheduleTier = useMemo(
    () => tierForMonthlyVolume(displayVolume, feeTiers),
    [displayVolume, feeTiers],
  );
  const commercialTier = scheduleTier ?? commercial?.tier ?? "small";
  const commercialRate = formatRatePercent(
    feeTiers.find((t) => t.tier === commercialTier)?.defaultSignupPercent ??
      commercial?.volumeFeePercent,
  );
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
    setMetrics(null);
    setSettlement([]);
    setXpubs([]);
    setMatchingMode("—");
    setPricingMode("");
    setTeam([]);
    setCommercialEditOpen(false);
    setCommercialError(null);
    setPrimaryOwner(null);
  }, [org.id, initialTab]);

  const selectedBand = useMemo(
    () => feeTiers.find((t) => t.tier === editTier) ?? null,
    [feeTiers, editTier],
  );

  useEffect(() => {
    let cancelled = false;
    void getFeeTierSettings()
      .then((settings) => {
        if (!cancelled) setFeeTiers(settings.tiers);
      })
      .catch(() => {
        if (!cancelled) setFeeTiers([]);
      });
    if (!portal) {
      void getBillingCalendarSettings()
        .then((cal) => {
          if (!cancelled && cal.activationFeeUsd?.trim()) {
            setActivationFeeUsd(cal.activationFeeUsd.trim());
          }
        })
        .catch(() => {
          /* keep default activation fee */
        });
    }
    return () => {
      cancelled = true;
    };
  }, [org.id, portal]);

  useEffect(() => {
    if (!commercialEditOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !commercialBusy) setCommercialEditOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commercialEditOpen, commercialBusy]);

  async function saveCommercial() {
    if (!canLockFixedRates || commercialBusy || !commercial) return;
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

  const profileTick = useProfileUpdatedTick();

  useEffect(() => {
    let cancelled = false;
    setOverviewLoading(true);
    setTeamLoading(true);
    void getOrgOverview(org.id)
      .then(async (data) => {
        if (cancelled) return;
        let teamRows = data.team ?? [];
        if (portal && teamRows.length === 0) {
          teamRows = await portal.loadTeam(org.id).catch(() => []);
          if (cancelled) return;
        }
        setTeam(teamRows);
        setAudit(data.audit);
        setCommercial(data.commercial);
        setMetrics(data.metrics);
        const contact = data.primaryOwnerContact ?? null;
        if (contact) {
          setPrimaryOwner(ownerContactWithMfa(contact, teamRows));
        } else {
          setPrimaryOwner(ownerContactFromTeam(teamRows));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTeam([]);
          setAudit([]);
          setCommercial(null);
          setMetrics(null);
          setPrimaryOwner(null);
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
  }, [org.id, portal, profileTick]);

  useEffect(() => {
    let cancelled = false;
    setTabLoading(true);
    setTabError(null);
    Promise.all([
      listSettlement(org.id),
      listXpub(org.id),
      getMatchingMode(org.id),
    ])
      .then(([addrs, xp, mode]) => {
        if (cancelled) return;
        setSettlement(addrs);
        setXpubs(xp);
        setMatchingMode(mode.matchingMode);
      })
      .catch((err) => {
        if (!cancelled) {
          setTabError(
            err instanceof ApiError ? err.message : "Failed to load settlement",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setTabLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [org.id]);

  useEffect(() => {
    let cancelled = false;
    void getMerchantPricingSettings(org.id)
      .then((row) => {
        if (!cancelled) setPricingMode(row.pricingMode || "pegged_1to1");
      })
      .catch(() => {
        if (!cancelled) setPricingMode("pegged_1to1");
      });
    return () => {
      cancelled = true;
    };
  }, [org.id]);

  const savedPublicKey = useMemo(() => {
    const row =
      xpubs.find((r) => r.asset === "USDT" && r.network === "tron") ??
      xpubs.find((r) => r.xPubConfigured) ??
      null;
    return row?.xPub?.trim() ?? "";
  }, [xpubs]);

  async function saveMerchantEdits(next: MerchantEditSave, mfaCode?: string) {
    setProfileEditBusy(true);
    setProfileEditError(null);
    try {
      if (mfaCode && next.merchant) {
        const nextKey = (next.merchant.publicKey ?? "").trim();
        if (nextKey && nextKey !== savedPublicKey) {
          const savedXpub = await putXpub(org.id, {
            asset: "USDT",
            network: "tron",
            xPub: nextKey,
            mfaCode,
          });
          setXpubs((rows) => {
            const rest = rows.filter(
              (row) => !(row.asset === "USDT" && row.network === "tron"),
            );
            return [...rest, { ...savedXpub, xPub: nextKey }];
          });
        }
      }
      const updated = await patchOrgProfile(org.id, next);
      onOrgPatched?.(updated);
      if (next.merchant && commercial) {
        const currentMode = commercial.rateMode === "fixed" ? "fixed" : "automatic";
        const commercialChanged =
          next.merchant.rateMode !== currentMode ||
          (next.merchant.rateMode === "fixed" &&
            (next.merchant.tier !== commercial.tier ||
              next.merchant.volumeFeePercent !== commercial.volumeFeePercent));
        if (commercialChanged) {
          const saved = await updateMerchantCommercial(
            org.id,
            next.merchant.rateMode === "automatic"
              ? { rateMode: "automatic" }
              : {
                  tier: next.merchant.tier,
                  volumeFeePercent: next.merchant.volumeFeePercent,
                  rateMode: "fixed",
                },
          );
          setCommercial(saved);
        }
        if (next.merchant.matchingMode !== matchingMode) {
          const mode = await putMatchingMode(org.id, next.merchant.matchingMode);
          setMatchingMode(mode.matchingMode);
        }
        if (next.merchant.pricingMode !== pricingMode) {
          await putMerchantPricingSettings(org.id, {
            pricingMode: next.merchant.pricingMode,
          });
          setPricingMode(next.merchant.pricingMode);
        }
      }
      setPendingOrgSave(null);
      setProfileEditOpen(false);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Failed to update profile";
      if (mfaCode) throw new Error(message);
      setProfileEditError(message);
    } finally {
      setProfileEditBusy(false);
    }
  }

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
          </div>
        }
        status={
          <span
            className={`platform-detail__status${
              status === "paused" ? " is-paused" : ""
            }`}
          >
            {status === "paused" ? "SUSPENDED" : "ACTIVE"}
          </span>
        }
        actions={
          canOnboardHere || canLifecycleHere ? (
            <>
              {canOnboardHere ? (
                <Link
                  className="b3-agent-detail__onboard"
                  to={`${route("sites/new")}?parentId=${encodeURIComponent(org.id)}`}
                >
                  <HeroPersonPlusIcon />
                  New Site
                </Link>
              ) : null}
              {canLifecycleHere ? (
                <>
                  {status === "active" ? (
                    <button
                      type="button"
                      className="b3-agent-detail__suspend"
                      disabled={busy}
                      onClick={onPause}
                    >
                      <HeroPauseIcon />
                      Suspend
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="b3-agent-detail__suspend"
                      disabled={busy}
                      onClick={onRun}
                    >
                      <HeroPlayIcon />
                      Run
                    </button>
                  )}
                  <button
                    type="button"
                    className="b3-agent-detail__delete"
                    disabled={busy}
                    onClick={onDelete}
                  >
                    <HeroTrashIcon />
                    Delete
                  </button>
                </>
              ) : null}
            </>
          ) : null
        }
      />
      {status === "paused" ? (
        <p className="platform-detail__pause-reason muted" role="status">
          Suspended
          {localOrg.statusReason ? `: ${localOrg.statusReason}` : ""}
          {localOrg.statusReasonBillId ? (
            <>
              {" — "}
              <Link
                to={route(
                  `service-bills/${encodeURIComponent(localOrg.statusReasonBillId)}`,
                )}
              >
                Open invoice
              </Link>
            </>
          ) : null}
          . Sites under this merchant are watch-only.
        </p>
      ) : null}

      <OrgProfileEditModal
        open={profileEditOpen}
        name={org.name}
        iconKey={org.iconKey}
        country={org.country}
        legalName={org.legalName}
        billingEmail={org.billingEmail}
        businessTimezone={businessTimezoneField(org, [])}
        requireCountry={true}
        typeLabel={orgTypeLabel(org.type)}
        busy={profileEditBusy}
        error={profileEditError}
        canLockFixedRates={canLockFixedRates}
        onClose={() => {
          if (!profileEditBusy) setProfileEditOpen(false);
        }}
        merchant={
          commercial && matchingMode !== "—" && pricingMode
            ? {
                rateMode: commercial.rateMode === "fixed" ? "fixed" : "automatic",
                tier:
                  commercial.rateMode === "fixed" ? commercial.tier : commercialTier,
                volumeFeePercent: commercial.volumeFeePercent,
                scheduleLabel: `${tierLabel(commercialTier)}${
                  commercialRate ? ` (${commercialRate}%)` : ""
                }`,
                tiers: MERCHANT_TIERS.map((tier) => {
                  const band = feeTiers.find((t) => t.tier === tier);
                  return {
                    id: tier,
                    label: tierLabel(tier),
                    defaultPercent: defaultVolumeForTier(feeTiers, tier),
                    minPercent: band?.volumeFeeMinPercent,
                    maxPercent: band?.volumeFeeMaxPercent,
                  };
                }),
                matchingMode,
                pricingMode,
                publicKey: savedPublicKey,
                billingSchedule: canEditCommercial
                  ? { statusLabel: billingScheduleSummary(commercial, activationFeeUsd) }
                  : undefined,
              }
            : null
        }
        onSave={async (next) => {
          const publicKeyChanged =
            next.merchant != null &&
            (next.merchant.publicKey ?? "").trim() !== savedPublicKey;
          if (publicKeyChanged) {
            setPendingOrgSave(next);
            return;
          }
          await saveMerchantEdits(next);
        }}
      />
      {pendingOrgSave ? (
        <MfaStepUpGate
          session={session}
          actionLabel="change merchant public key"
          onClose={() => {
            if (!profileEditBusy) setPendingOrgSave(null);
          }}
          onVerify={(mfaCode) => saveMerchantEdits(pendingOrgSave, mfaCode)}
        />
      ) : null}

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
        {tabs.map((t) => {
          let label: string = t.label;
          if (t.id === "team") {
            const teamCount = team.filter((m) => m.role !== "cashier").length;
            label = `Team (${teamCount})`;
          }
          if (t.id === "cashiers") label = `Cashiers (${cashierCount})`;
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

      <div className="b3-agent-detail__body">
        {tab === "overview" ? (
          <>
            <div className="b3-agent-detail__kpis b3-agent-detail__kpis--3">
              <div className="b3-card b3-card--kpi">
                <span className="b3-kpi__mark tone-blue" aria-hidden>
                  <KpiPeopleIcon />
                </span>
                <div className="b3-kpi__copy">
                  <div className="b3-kpi__label-row">
                    <p className="b3-card__label">Cashiers</p>
                    <button
                      type="button"
                      className="b3-kpi__more"
                      onClick={() => setTab("cashiers")}
                    >
                      View more →
                    </button>
                  </div>
                  <p className="b3-card__value">
                    {teamLoading && team.length === 0 ? "…" : <AnimatedText text={cashierCount} />}
                  </p>
                </div>
              </div>
              <div className="b3-card b3-card--kpi">
                <span className="b3-kpi__mark tone-gold" aria-hidden>
                  <KpiCoinsIcon />
                </span>
                <div className="b3-kpi__copy">
                  <div className="b3-kpi__label-row">
                    <p className="b3-card__label">Volume (MTD)</p>
                    {portal ? null : (
                      <Link
                        className="b3-kpi__more"
                        to={`${platformRoute("invoices")}?${volumeReviewQuery({ merchantId: org.id })}`}
                        aria-label="Review this month's completed invoices"
                      >
                        Review →
                      </Link>
                    )}
                  </div>
                  <p className="b3-card__value b3-card__value--gold">
                    <FundAmount animate amount={displayVolume} />
                  </p>
                </div>
              </div>
              <div className="b3-card b3-card--kpi">
                <span className="b3-kpi__mark tone-green" aria-hidden>
                  <KpiChartIcon />
                </span>
                <div className="b3-kpi__copy">
                  <div className="b3-kpi__label-row">
                    <p className="b3-card__label">Platform fee (MTD)</p>
                    {portal ? null : (
                      <Link
                        className="b3-kpi__more"
                        to={`${platformRoute("service-bills")}?${billsReviewQuery({ merchantId: org.id })}`}
                        aria-label="Review service bills for this month"
                      >
                        Review →
                      </Link>
                    )}
                  </div>
                  <p className="b3-card__value b3-card__value--ok">
                    <FundAmount animate amount={displayPlatformFeeMtd} />
                  </p>
                </div>
              </div>
            </div>

            <div className="b3-agent-detail__overview-stack">
              <AccountOverviewProfile
                org={org}
                owner={primaryOwner}
                ownerLoading={overviewLoading && !primaryOwner}
                canEditOrg={canEditOrg}
                canEditOwner={canSupportOwner}
                setupKind="merchant"
                walletSet={settlement.some(
                  (r) => typeof r.address === "string" && r.address.trim().length > 0,
                )}
                onEditOrg={() => {
                  setProfileEditError(null);
                  setProfileEditOpen(true);
                }}
                onOwnerUpdated={setPrimaryOwner}
                extras={
                  <>
                    <div className="b3-profile__field">
                      <p className="b3-profile__label">Commercial tier</p>
                      <p className="b3-profile__value">
                        {overviewLoading && !commercial
                          ? "…"
                          : commercial?.rateMode === "fixed"
                            ? `Fixed · ${tierLabel(commercial.tier)}${
                                formatRatePercent(commercial.volumeFeePercent)
                                  ? ` (${formatRatePercent(commercial.volumeFeePercent)}%)`
                                  : ""
                              }`
                            : `Automatic · ${tierLabel(commercialTier)}${
                                commercialRate ? ` (${commercialRate}%)` : ""
                              }`}
                      </p>
                    </div>
                    <div className="b3-profile__field">
                      <p className="b3-profile__label">Billing schedule</p>
                      <p className="b3-profile__value">
                        {!commercial ? (
                          "…"
                        ) : commercial.billingAnchorAt ? (
                          billingScheduleParts(commercial).join(" · ")
                        ) : (
                          <>
                            Not activated ·{" "}
                            {commercial.activationWaived ? (
                              "Activation waived"
                            ) : (
                              <FundAmount amount={activationFeeUsd} />
                            )}
                            {commercial.waivedMonthsLeft
                              ? ` · ${waivedMonthsLabel(commercial.waivedMonthsLeft)}`
                              : null}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="b3-profile__field">
                      <p className="b3-profile__label">Mode</p>
                      <p className="b3-profile__value">
                        {!matchingMode || matchingMode === "—"
                          ? "…"
                          : `Mode ${matchingMode}${
                              pricingMode
                                ? ` · ${PRICING_MODE_LABEL[pricingMode] ?? pricingMode}`
                                : ""
                            }`}
                      </p>
                    </div>
                  </>
                }
              />
              <MerchantSettlementPanel
                orgId={org.id}
                session={session}
                canManage={canSupportOwner}
                settlement={settlement}
                loading={tabLoading}
                onSettlementChange={setSettlement}
              />
              <DetailActivityCard
                subtitle="Latest events for this merchant"
                rows={recentActivity.slice(0, 4)}
                loading={overviewLoading && audit.length === 0}
                empty={<ActivitySectionEmpty loading={overviewLoading && audit.length === 0} />}
                action={
                  auditHref ? (
                    <Link
                      className="b3-agent-detail__view-all"
                      to={auditHref}
                      title={`Platform audit log (up to ${RECENT_ACTIVITY_LIMIT} events shown here)`}
                    >
                      View all activity
                      <span aria-hidden>→</span>
                    </Link>
                  ) : undefined
                }
              />
            </div>
          </>
        ) : null}

        {tab === "team" ? (
          <OrgTeamRoster
            org={org}
            orgs={orgs}
            members={team}
            loading={teamLoading}
            canManage={canManageTeam}
            onMembersChange={setTeam}
            variant="team"
          />
        ) : null}

        {tab === "cashiers" ? (
          <OrgTeamRoster
            org={org}
            orgs={orgs}
            members={team}
            loading={teamLoading}
            canManage={canManageTeam}
            onMembersChange={setTeam}
            variant="cashiers"
          />
        ) : null}

        {tab === "networks" && !portal ? (
          <OrgNetworkRailPanel
            session={session}
            scope="merchant"
            scopeId={org.id}
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
                    Lock a fixed special rate (Platform Owner or Administrator). Automatic
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
