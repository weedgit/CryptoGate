import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import { InviteCredentialsPanel } from "../auth/InviteCredentialsPanel";
import type { OnboardInviteCreds } from "../shared/onboardInviteState";
import {
  ApiError,
  getOrgOverview,
  listServiceBills,
  SERVICE_BILLS_LIST_LIMIT,
  putAgentCommission,
  patchOrgProfile,
  type OrgPrimaryOwnerContact,
  type AgentCommissionSettings,
  type AgentPayoutAddress,
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
import { AccountsDetailHero } from "./AccountsDetailHero";
import { merchantsInAgentSubtree, merchantOrgIdsInAgentSubtree, subAgentsUnderAgent } from "./agentSubtree";
import { orgTypeLabel, sessionCanManagePlatform, sessionIsPlatformOwner } from "./org";
import { FundAmount } from "./FundAmount";
import { ChartHelpButton } from "./ui/ChartHelpButton";
import {
  buildAgentAccountsForest,
  formatOnboardDate,
  mergeActivityFeed,
  RECENT_ACTIVITY_LIMIT,
  agentCommissionMtd,
  agentSubtreePlatformFeeMtd,
  agentSubtreeVolumeMtd,
  DEFAULT_AGENT_COMMISSION_PERCENT,
  truncateAddress,
} from "./orgDetailSeeds";
import { PlatformPending } from "./ui/PlatformPending";
import { platformRoute } from "../shared/portalRouting";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "activity", label: "Recent activity" },
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
      <ChartHelpButton text={text} label="About this metric" openOnHover />
    </span>
  );
}

const KPI_HELP = {
  merchants:
    "Merchant accounts in this agent’s subtree. Sites are not counted here.",
  volumeMtd:
    "Confirmed payment-order volume from the 1st of this month through today, across the agent subtree.",
  commissionMtd:
    "Agent commission accrued month-to-date: share of platform fee collected from the subtree. Paid by PaymentGate on the monthly statement — not taken from payer on-chain payments.",
} as const;

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
  const displayCommissionMtd =
    livePlatformFeeMtd > 0
      ? agentCommissionMtd(livePlatformFeeMtd, commissionPercent)
      : 0;

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
          setPrimaryOwner(contact);
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
    setCommissionEditOpen(false);
    setCommissionError(null);
    setBills([]);
    setPrimaryOwner(null);
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
    if (!canEditCommission || commissionBusy) return;
    setCommissionBusy(true);
    setCommissionError(null);
    try {
      const updated = await putAgentCommission(org.id, {
        commissionPercent: commissionDraft.trim(),
        rateMode: "fixed",
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

  async function resetCommissionToSchedule() {
    if (!canEditCommission || commissionBusy) return;
    setCommissionBusy(true);
    setCommissionError(null);
    try {
      const updated = await putAgentCommission(org.id, {
        rateMode: "automatic",
      });
      setCommission(updated);
      setCommissionEditOpen(false);
    } catch (err) {
      setCommissionError(
        err instanceof ApiError ? err.message : "Could not reset to schedule",
      );
    } finally {
      setCommissionBusy(false);
    }
  }

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
        message={tabError ?? commissionError}
        tone="error"
        onDismiss={() => {
          setTabError(null);
          setCommissionError(null);
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
                title="Edit organization profile"
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
                to={`${platformRoute("merchants/new")}?parentId=${encodeURIComponent(org.id)}`}
              >
                Onboard
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
        requireCountry={false}
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

      {toast ? (
        <div className="banner banner-ok b3-agent-detail__toast">
          Invitation sent to the new Owner.
        </div>
      ) : null}

      <div className="platform-detail__body b3-agent-detail__shell">
      <div className="b3-agent-detail__tabs" role="tablist">
        {TABS.map((t) => {
          let label: string = t.label;
          if (t.id === "activity") {
            label = `Recent activity (${recentActivity.length})`;
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

      <div className="b3-agent-detail__body">
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
                      <p className="b3-profile__label">Commission</p>
                      <div className="b3-profile__value-row">
                        <p className="b3-profile__value">
                          {overviewLoading && !commission
                            ? "…"
                            : `${commission?.rateMode === "fixed" ? "Fixed" : "Automatic"} · ${commissionPercent}%`}
                        </p>
                        {canEditCommission ? (
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
                    <ProfilePayoutField payout={payout} loading={overviewLoading} />
                  </>
                }
              />
            </div>
          </>
        ) : null}

        {tab === "activity" ? (
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
      </div>

      {commissionEditOpen && canEditCommission
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
                    Lock a fixed commission % (Platform Owner). Automatic agents
                    follow the volume schedule. The new fixed rate applies
                    immediately to commission accruals.
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
                    className="b3-commission-modal__cancel"
                    disabled={commissionBusy}
                    onClick={() => void resetCommissionToSchedule()}
                  >
                    Use schedule
                  </button>
                  <button
                    type="button"
                    className="b3-commission-modal__save"
                    disabled={commissionBusy || !commissionDraft.trim()}
                    onClick={() => void saveCommission()}
                  >
                    {commissionBusy ? "Saving…" : "Lock fixed rate"}
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
