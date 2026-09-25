import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DEFAULT_FEE_TIER_BANDS, PLATFORM_FEE_ASSET } from "@paymentgate/domain";
import { AuthToast } from "../auth/AuthToast";
import { MfaStepUpGate } from "../auth/MfaStepUpGate";
import { InviteCredentialsPanel } from "../auth/InviteCredentialsPanel";
import type { OnboardInviteCreds } from "../shared/onboardInviteState";
import { CopyGlyph } from "../shared/CopyGlyph";
import {
  ApiError,
  getFeeTierSettings,
  getOrgOverview,
  listServiceBills,
  SERVICE_BILLS_LIST_LIMIT,
  putAgentCommission,
  putAgentPayout,
  ownerContactWithMfa,
  patchOrgProfile,
  type OrgPrimaryOwnerContact,
  type AgentCommissionSettings,
  type AgentPayoutAddress,
  type FeeTierBand,
  type AuditLogEntry,
  type OrgAccount,
  type OrgMember,
  type PaymentOrder,
  type ServiceBill,
  type Session,
} from "./api";
import { OrgBrandMark } from "../shared/OrgBrandMark";
import { OrgProfileEditModal } from "../shared/OrgProfileEditModal";
import { AccountOverviewProfile } from "../shared/AccountOverviewProfile";
import { MiddleEllipsisText } from "../shared/MiddleEllipsisText";
import { AccountsDetailHero } from "./AccountsDetailHero";
import { merchantsInAgentSubtree, merchantOrgIdsInAgentSubtree } from "./agentSubtree";
import { orgTypeLabel, sessionCanManagePlatform, sessionIsPlatformOwner } from "./org";
import { FundAmount } from "./FundAmount";
import {
  buildAgentAccountsForest,
  formatOnboardDate,
  mergeActivityFeed,
  RECENT_ACTIVITY_LIMIT,
  agentCommissionMtd,
  agentSubtreePlatformFeeMtd,
  agentSubtreeVolumeMtd,
  DEFAULT_AGENT_COMMISSION_PERCENT,
} from "./orgDetailSeeds";
import { OrgTeamRoster } from "./OrgTeamRoster";
import { DetailActivityCard } from "./DetailActivityTable";
import { KpiChartIcon, KpiCoinsIcon, KpiPeopleIcon } from "./detailKpiMarks";
import { platformRoute } from "../shared/portalRouting";
import { platformFeeAsset, platformFeeNetwork } from "../shared/platformFeePair";
import { AssetIcon } from "./cryptoIcons";
import {
  HeroPauseIcon,
  HeroPersonPlusIcon,
  HeroPlayIcon,
  HeroTrashIcon,
} from "./detailHeroIcons";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "activity", label: "Recent activity" },
  { id: "team", label: "Team" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function automaticCommissionPercent(
  volumeUsd: number,
  tiers: ReadonlyArray<
    Pick<FeeTierBand, "tier" | "volumeMinUsd" | "volumeMaxUsd" | "agentCommissionPercent">
  >,
): string {
  const vol = Number.isFinite(volumeUsd) ? volumeUsd : 0;
  const rank: Record<string, number> = { enterprise: 3, mid: 2, small: 1 };
  const match = tiers
    .map((row) => ({
      tier: row.tier,
      pct: row.agentCommissionPercent?.trim() ?? "",
      min: Number(row.volumeMinUsd ?? 0),
      max:
        row.volumeMaxUsd == null || row.volumeMaxUsd === ""
          ? null
          : Number(row.volumeMaxUsd),
    }))
    .filter((band) => {
      if (!band.pct || !Number.isFinite(band.min) || vol < band.min) return false;
      if (band.max != null && Number.isFinite(band.max) && vol >= band.max) return false;
      return true;
    })
    .sort((a, b) => (rank[b.tier] ?? 0) - (rank[a.tier] ?? 0))[0];
  return match?.pct || "15";
}

type OrgEditSave = {
  name: string;
  iconKey: string | null;
  country: string;
  legalName: string;
  billingEmail: string;
  commission?: {
    rateMode: "automatic" | "fixed";
    commissionPercent: string;
  };
  payoutAddress?: string;
};

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
          ? "Fetching audit events for this agent."
          : "Sign-ins, team invites, and status changes appear here when recorded."}
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
          <div className="b3-profile__value-with-asset">
            <AssetIcon asset={platformFeeAsset()} />
            <MiddleEllipsisText
              text={payout.address}
              className="b3-profile__value mono"
              title={payout.address}
            />
          </div>
          <button
            type="button"
            className={`cg-copy-btn b3-profile__copy-icon${copied ? " is-copied" : ""}`}
            onClick={() => void copyAddress()}
            aria-label={copied ? "Payout address copied" : "Copy payout address"}
            title={copied ? "Copied" : "Copy"}
          >
            <CopyGlyph copied={copied} />
          </button>
        </div>
      ) : (
        <p className="b3-profile__value b3-profile__value-with-asset">
          <AssetIcon asset={platformFeeAsset()} />
          <span>—</span>
        </p>
      )}
    </div>
  );
}

type Props = {
  org: OrgAccount;
  orgs: OrgAccount[];
  session: Session;
  canManage: boolean;
  busy: boolean;
  invitationSent?: boolean;
  inviteCreds?: OnboardInviteCreds | null;
  onPause: () => void;
  onRun: () => void;
  onDelete: () => void;
  onOrgPatched?: (org: OrgAccount) => void;
};

/** Figma `b3-agent-detail` — solid card (no gradient); lives in Agents master–detail. */
export function AgentDetailCard({
  org,
  orgs,
  session,
  canManage,
  busy,
  invitationSent,
  inviteCreds,
  onPause,
  onRun,
  onDelete,
  onOrgPatched,
}: Props) {
  const canEditCommission = useMemo(
    () => sessionIsPlatformOwner(session),
    [session],
  );
  const canEditPayout = useMemo(
    () => sessionCanManagePlatform(session),
    [session],
  );
  const canSupportOwner = useMemo(
    () => sessionIsPlatformOwner(session),
    [session],
  );
  const [primaryOwner, setPrimaryOwner] = useState<OrgPrimaryOwnerContact | null>(
    null,
  );
  const [tab, setTab] = useState<TabId>("overview");
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [profileEditBusy, setProfileEditBusy] = useState(false);
  const [profileEditError, setProfileEditError] = useState<string | null>(null);
  const [pendingPayoutSave, setPendingPayoutSave] = useState<OrgEditSave | null>(
    null,
  );
  const [bills, setBills] = useState<ServiceBill[]>([]);
  const [subtreeOrders, setSubtreeOrders] = useState<PaymentOrder[]>([]);
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [team, setTeam] = useState<OrgMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [tabError, setTabError] = useState<string | null>(null);
  const [toast, setToast] = useState(
    invitationSent === true && inviteCreds == null,
  );
  const [payout, setPayout] = useState<AgentPayoutAddress | null>(null);
  const [commission, setCommission] = useState<AgentCommissionSettings | null>(
    null,
  );
  const [scheduleTiers, setScheduleTiers] = useState<FeeTierBand[] | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  const status = org.status ?? "active";
  const merchants = useMemo(
    () => merchantsInAgentSubtree(org.id, orgs),
    [org.id, orgs],
  );
  const orgNameById = useMemo(
    () => new Map(orgs.map((o) => [o.id, o.name])),
    [orgs],
  );
  const accountsForest = useMemo(
    () =>
      buildAgentAccountsForest({
        agentId: org.id,
        agentName: org.name,
        liveMerchants: merchants,
        parentNameById: orgNameById,
      }),
    [org.id, org.name, merchants, orgNameById],
  );
  /** Matches Agents list MERCHANTS — live merchant accounts only (sites excluded). */
  const liveMerchantCount = accountsForest.liveMerchantCount;
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
  const merchantIds = useMemo(
    () => merchantOrgIdsInAgentSubtree(org.id, orgs),
    [org.id, orgs],
  );
  const agentBills = useMemo(
    () => bills.filter((b) => merchantIds.has(b.orgId)),
    [bills, merchantIds],
  );
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
  const automaticRate = useMemo(() => {
    const tiers =
      scheduleTiers && scheduleTiers.length > 0
        ? scheduleTiers
        : DEFAULT_FEE_TIER_BANDS;
    return automaticCommissionPercent(displayVolumeMtd, tiers);
  }, [displayVolumeMtd, scheduleTiers]);

  useEffect(() => {
    if (!canEditCommission) return;
    let cancelled = false;
    void getFeeTierSettings()
      .then((settings) => {
        if (!cancelled) setScheduleTiers(settings.tiers);
      })
      .catch(() => {
        if (!cancelled) setScheduleTiers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canEditCommission]);

  const displayCommissionMtd =
    livePlatformFeeMtd > 0
      ? agentCommissionMtd(livePlatformFeeMtd, commissionPercent)
      : 0;

  async function saveOrgEdits(next: OrgEditSave, mfaCode?: string) {
    setProfileEditBusy(true);
    setProfileEditError(null);
    try {
      if (mfaCode && next.payoutAddress?.trim()) {
        const row = await putAgentPayout(org.id, {
          asset: PLATFORM_FEE_ASSET,
          network: platformFeeNetwork(),
          address: next.payoutAddress.trim(),
          mfaCode,
        });
        setPayout(row);
      }
      const updated = await patchOrgProfile(org.id, next);
      onOrgPatched?.(updated);
      if (next.commission && canEditCommission) {
        const currentMode = commission?.rateMode === "fixed" ? "fixed" : "automatic";
        const modeChanged = next.commission.rateMode !== currentMode;
        const percentChanged =
          next.commission.rateMode === "fixed" &&
          next.commission.commissionPercent !== commissionPercent;
        if (modeChanged || percentChanged) {
          const updatedCommission = await putAgentCommission(
            org.id,
            next.commission.rateMode === "automatic"
              ? { rateMode: "automatic" }
              : {
                  rateMode: "fixed",
                  commissionPercent: next.commission.commissionPercent,
                },
          );
          setCommission(updatedCommission);
        }
      }
      setPendingPayoutSave(null);
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
        const contact = data.primaryOwnerContact ?? null;
        if (contact) {
          setPrimaryOwner(ownerContactWithMfa(contact, data.team));
        } else {
          const ownerRow =
            data.team.find((m) => m.role === "owner") ?? data.team[0] ?? null;
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
                  mfaEnrolled: ownerRow.mfaEnrolled === true,
                }
              : null,
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTeam([]);
          setAudit([]);
          setPayout(null);
          setCommission(null);
          setSubtreeOrders([]);
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
  }, [org.id]);

  useEffect(() => {
    setTab("overview");
    setTabError(null);
    setTeam([]);
    setCommission(null);
    setBills([]);
    setPrimaryOwner(null);
  }, [org.id]);

  useEffect(() => {
    setToast(invitationSent === true && inviteCreds == null);
  }, [invitationSent, inviteCreds, org.id]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(false), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  /** Bills feed commission MTD KPI on Overview (no bills/commissions tabs). */
  useEffect(() => {
    let cancelled = false;
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
              : "Failed to load commission metrics",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [org.id]);

  return (
    <aside className="platform-detail b3-agent-detail" aria-label="Agent detail">
      <AuthToast
        message={tabError}
        tone="error"
        onDismiss={() => setTabError(null)}
      />
      <AccountsDetailHero
        eyebrow={orgTypeLabel(org.type)}
        title={org.name}
        subtitle="Trusted partner in global payments"
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
            {status === "paused" ? "PAUSED" : "ACTIVE"}
          </span>
        }
        actions={
          canManage ? (
            <>
              <Link
                className="b3-agent-detail__onboard"
                to={`${platformRoute("merchants/new")}?parentId=${encodeURIComponent(org.id)}`}
              >
                <HeroPersonPlusIcon />
                Onboard
              </Link>
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
        requireCountry={false}
        typeLabel={orgTypeLabel(org.type)}
        payoutAddress={canEditPayout ? (payout?.address ?? "") : undefined}
        automaticRate={canEditCommission ? automaticRate : null}
        canLockFixedRates={canEditCommission}
        commission={
          canEditCommission
            ? {
                rateMode: commission?.rateMode === "fixed" ? "fixed" : "automatic",
                commissionPercent,
              }
            : null
        }
        busy={profileEditBusy}
        error={profileEditError}
        onClose={() => {
          if (!profileEditBusy) setProfileEditOpen(false);
        }}
        onSave={async (next) => {
          const prev = (payout?.address ?? "").trim();
          const nextAddr = (next.payoutAddress ?? "").trim();
          if (next.payoutAddress !== undefined && nextAddr && nextAddr !== prev) {
            setPendingPayoutSave({ ...next, payoutAddress: nextAddr });
            return;
          }
          await saveOrgEdits(next);
        }}
      />
      {pendingPayoutSave ? (
        <MfaStepUpGate
          session={session}
          actionLabel="change payout address"
          onClose={() => {
            if (!profileEditBusy) setPendingPayoutSave(null);
          }}
          onVerify={(mfaCode) => saveOrgEdits(pendingPayoutSave, mfaCode)}
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

      {toast ? (
        <div className="banner banner-ok b3-agent-detail__toast">
          Invitation sent to the new Owner.
        </div>
      ) : null}

      <div className="platform-detail__body b3-agent-detail__shell">
      <div className="b3-agent-detail__tabs" role="tablist">
        {TABS.map((t) => {
          let label: string = t.label;
          if (t.id === "team") label = `Team (${team.length})`;
          if (t.id === "activity") {
            label = `Recent activity (${recentActivity.length})`;
          }
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
                  <p className="b3-card__label">Merchants</p>
                  <p className="b3-card__value">{liveMerchantCount}</p>
                </div>
              </div>
              <div className="b3-card b3-card--kpi">
                <span className="b3-kpi__mark tone-gold" aria-hidden>
                  <KpiCoinsIcon />
                </span>
                <div className="b3-kpi__copy">
                  <p className="b3-card__label">Volume (MTD)</p>
                  <p className="b3-card__value b3-card__value--gold">
                    <FundAmount amount={displayVolumeMtd} unit="code" />
                  </p>
                </div>
              </div>
              <div className="b3-card b3-card--kpi">
                <span className="b3-kpi__mark tone-teal" aria-hidden>
                  <KpiChartIcon />
                </span>
                <div className="b3-kpi__copy">
                  <p className="b3-card__label">Commission (MTD)</p>
                  <p className="b3-card__value b3-card__value--teal">
                    <FundAmount amount={displayCommissionMtd} unit="code" />
                  </p>
                </div>
              </div>
            </div>

            <div className="b3-agent-detail__overview-stack">
              <AccountOverviewProfile
                org={org}
                owner={primaryOwner}
                ownerLoading={overviewLoading && !primaryOwner}
                canEditOrg={canManage}
                canEditOwner={canSupportOwner}
                setupKind="agent"
                orgFieldMode="account"
                walletSet={Boolean(payout?.address?.trim())}
                onEditOrg={() => {
                  setProfileEditError(null);
                  setProfileEditOpen(true);
                }}
                onOwnerUpdated={setPrimaryOwner}
                extras={
                  <>
                    <div className="b3-profile__field">
                      <p className="b3-profile__label">Commission</p>
                      <p className="b3-profile__value">
                        {overviewLoading && !commission
                          ? "…"
                          : `${commission?.rateMode === "fixed" ? "Fixed" : "Automatic"} - ${commissionPercent}%`}
                      </p>
                    </div>
                    <ProfilePayoutField payout={payout} loading={overviewLoading} />
                  </>
                }
              />
              <DetailActivityCard
                subtitle="Latest events for this agent"
                rows={recentActivity.slice(0, 4)}
                loading={overviewLoading && audit.length === 0}
                empty={<ActivitySectionEmpty loading={overviewLoading && audit.length === 0} />}
                action={
                  <Link
                    className="b3-agent-detail__view-all"
                    to={platformRoute("audit")}
                    title={`Platform audit log (up to ${RECENT_ACTIVITY_LIMIT} events shown here)`}
                  >
                    View all activity
                    <span aria-hidden>→</span>
                  </Link>
                }
              />
            </div>
          </>
        ) : null}

        {tab === "activity" ? (
          <DetailActivityCard
            subtitle="All recent events for this agent"
            rows={recentActivity}
            loading={overviewLoading && audit.length === 0}
            empty={<ActivitySectionEmpty loading={overviewLoading && audit.length === 0} />}
            action={
              <Link
                className="b3-agent-detail__view-all"
                to={platformRoute("audit")}
                title="Open platform audit log"
              >
                View all activity
                <span aria-hidden>→</span>
              </Link>
            }
          />
        ) : null}

        {tab === "team" ? (
          <OrgTeamRoster
            org={org}
            orgs={orgs}
            members={team}
            loading={teamLoading}
            canManage={canManage}
            onMembersChange={setTeam}
            variant="team"
          />
        ) : null}
      </div>
      </div>

    </aside>
  );
}
