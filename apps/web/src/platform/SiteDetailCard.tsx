import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import { InviteCredentialsPanel } from "../auth/InviteCredentialsPanel";
import type { OnboardInviteCreds } from "../shared/onboardInviteState";
import {
  ApiError,
  getOrgOverview,
  ownerContactWithMfa,
  patchOrgProfile,
  type AuditLogEntry,
  type OrgAccount,
  type OrgMember,
  type OrgPrimaryOwnerContact,
  type PaymentOrder,
} from "./api";
import { OrgBrandMark } from "../shared/OrgBrandMark";
import { OrgProfileEditModal } from "../shared/OrgProfileEditModal";
import { AccountOverviewProfile } from "../shared/AccountOverviewProfile";
import { AccountsDetailHero } from "./AccountsDetailHero";
import { FundAmount } from "./FundAmount";
import { orgTypeLabel, sessionIsPlatformOwner } from "./org";
import { OrgTeamRoster } from "./OrgTeamRoster";
import { DetailActivityCard } from "./DetailActivityTable";
import { KpiCoinsIcon, KpiOrdersIcon, KpiPeopleIcon } from "./detailKpiMarks";
import {
  merchantBillingPeriodStartMs,
  mergeActivityFeed,
  RECENT_ACTIVITY_LIMIT,
} from "./orgDetailSeeds";
import { platformRoute } from "../shared/portalRouting";
import {
  HeroPauseIcon,
  HeroPersonPlusIcon,
  HeroPlayIcon,
  HeroTrashIcon,
} from "./detailHeroIcons";
import type { Session } from "../merchant/api";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "team", label: "Team" },
  { id: "cashiers", label: "Cashiers" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const VALID_TABS = new Set<string>(TABS.map((t) => t.id));

const AUDIT_LABEL: Record<string, string> = {
  login: "Sign-in",
  org_create: "Org created",
  org_status: "Status changed",
  org_user_invite: "Team invite",
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
          ? "Fetching audit events for this site."
          : "Sign-ins, team invites, and status changes appear here when recorded."}
      </p>
      {!loading ? (
        <Link
          className="b3-agent-detail__activity-audit b3-agent-detail__activity-audit--inline"
          to={platformRoute("audit")}
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
  inviteCreds?: OnboardInviteCreds | null;
  initialTab?: TabId;
  onPause: () => void;
  onRun: () => void;
  onDelete: () => void;
  onOrgPatched?: (org: OrgAccount) => void;
};

/** Site detail — same shell as `AgentDetailCard` (Overview, activity, team, cashiers). */
export function SiteDetailCard({
  org,
  orgs,
  session,
  canManage,
  busy,
  inviteCreds,
  initialTab,
  onPause,
  onRun,
  onDelete,
  onOrgPatched,
}: Props) {
  const canSupportOwner = useMemo(
    () => sessionIsPlatformOwner(session),
    [session],
  );
  const [tab, setTab] = useState<TabId>(() =>
    initialTab && VALID_TABS.has(initialTab) ? initialTab : "overview",
  );
  const [primaryOwner, setPrimaryOwner] = useState<OrgPrimaryOwnerContact | null>(
    null,
  );
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [profileEditBusy, setProfileEditBusy] = useState(false);
  const [profileEditError, setProfileEditError] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [team, setTeam] = useState<OrgMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [tabError, setTabError] = useState<string | null>(null);

  const status = org.status ?? "active";
  const parent = useMemo(
    () => (org.parentId ? orgs.find((o) => o.id === org.parentId) ?? null : null),
    [org.parentId, orgs],
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
  const displayVolume = useMemo(() => {
    let total = 0;
    for (const o of mtdOrders) {
      if (o.status !== "completed") continue;
      const n = Number(o.payableAmount.amount);
      if (Number.isFinite(n)) total += n;
    }
    return total;
  }, [mtdOrders]);
  const cashierCount = team.filter((member) => member.role === "cashier").length;
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
    setTeam([]);
    setAudit([]);
    setOrders([]);
    setPrimaryOwner(null);
  }, [org.id, initialTab]);

  useEffect(() => {
    let cancelled = false;
    setOverviewLoading(true);
    setTeamLoading(true);
    void getOrgOverview(org.id)
      .then((data) => {
        if (cancelled) return;
        setTeam(data.team ?? []);
        setAudit(data.audit);
        setOrders(data.orders);
        const contact = data.primaryOwnerContact ?? null;
        if (contact) {
          setPrimaryOwner(ownerContactWithMfa(contact, data.team ?? []));
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
                  mfaEnrolled: ownerRow.mfaEnrolled === true,
                }
              : null,
          );
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setTeam([]);
          setAudit([]);
          setOrders([]);
          setPrimaryOwner(null);
          setTabError(err instanceof ApiError ? err.message : "Failed to load site");
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

  return (
    <aside className="platform-detail b3-agent-detail" aria-label="Site detail">
      <AuthToast message={tabError} tone="error" onDismiss={() => setTabError(null)} />
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
            className={`platform-detail__status${status === "paused" ? " is-paused" : ""}`}
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
                <HeroPersonPlusIcon />
                New Site
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
          {TABS.map((t) => {
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
                      {teamLoading && team.length === 0 ? "…" : cashierCount}
                    </p>
                  </div>
                </div>
                <div className="b3-card b3-card--kpi">
                  <span className="b3-kpi__mark tone-gold" aria-hidden>
                    <KpiCoinsIcon />
                  </span>
                  <div className="b3-kpi__copy">
                    <p className="b3-card__label">Volume (MTD)</p>
                    <p className="b3-card__value b3-card__value--gold">
                      <FundAmount amount={displayVolume} />
                    </p>
                  </div>
                </div>
                <div className="b3-card b3-card--kpi">
                  <span className="b3-kpi__mark tone-green" aria-hidden>
                    <KpiOrdersIcon />
                  </span>
                  <div className="b3-kpi__copy">
                    <p className="b3-card__label">Orders (MTD)</p>
                    <p className="b3-card__value">{mtdOrders.length}</p>
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
                  onEditOrg={() => {
                    setProfileEditError(null);
                    setProfileEditOpen(true);
                  }}
                  onOwnerUpdated={setPrimaryOwner}
                  extras={
                    <div className="b3-profile__field">
                      <p className="b3-profile__label">Parent</p>
                      <p className="b3-profile__value">
                        {parent
                          ? `${parent.name} · ${orgTypeLabel(parent.type)}`
                          : "—"}
                      </p>
                    </div>
                  }
                />
                <DetailActivityCard
                  subtitle="Latest events for this site"
                  rows={recentActivity.slice(0, 4)}
                  loading={overviewLoading && audit.length === 0}
                  empty={<ActivitySectionEmpty loading={overviewLoading && audit.length === 0} />}
                  action={
                    <Link className="b3-agent-detail__view-all" to={platformRoute("audit")}>
                      View all activity
                      <span aria-hidden>→</span>
                    </Link>
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
              canManage={canManage}
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
              canManage={canManage}
              onMembersChange={setTeam}
              variant="cashiers"
            />
          ) : null}
        </div>
      </div>
    </aside>
  );
}
