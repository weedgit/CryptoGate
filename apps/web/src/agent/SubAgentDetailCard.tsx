import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { agentRoute } from "../shared/portalRouting";
import { AuthToast } from "../auth/AuthToast";
import { InviteCredentialsPanel } from "../auth/InviteCredentialsPanel";
import type { OnboardInviteCreds } from "../shared/onboardInviteState";
import {
  ApiError,
  listOrgUsers,
  listServiceBills,
  type OrgAccount,
  type OrgMember,
  type ServiceBill,
} from "./api";
import { merchantsInAgentSubtree } from "./agentSubtree";
import { formatShortDate, formatUsd, orgTypeLabel } from "./org";
import { formatOnboardDate } from "../platform/orgDetailSeeds";
import { PlatformPending } from "../platform/ui/PlatformPending";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "accounts", label: "Accounts" },
  { id: "service-bills", label: "Service bills" },
  { id: "team", label: "Team" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const STATUS_LABEL: Record<string, string> = {
  issued: "Issued",
  paid: "Paid",
  overdue: "Overdue",
  voided: "Voided",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase() || "AG";
}

function preferredOrgEmail(members: OrgMember[]): string | null {
  const preferred =
    members.find((m) => /owner/i.test(m.role)) ??
    members.find((m) => /admin/i.test(m.role)) ??
    members[0];
  const email = preferred?.email?.trim();
  return email || null;
}

function fieldText(raw: string | null | undefined): {
  text: string;
  empty: boolean;
} {
  const text = raw?.trim() ?? "";
  return text ? { text, empty: false } : { text: "—", empty: true };
}

type Props = {
  org: OrgAccount;
  orgs: OrgAccount[];
  canManage?: boolean;
  busy?: boolean;
  inviteCreds?: OnboardInviteCreds | null;
  ownerEmail?: string | null;
  onPause?: () => void;
  onRun?: () => void;
  onDelete?: () => void;
};

/** Sub-agent detail card — platform b3 chrome, agent-scoped actions on direct children. */
export function SubAgentDetailCard({
  org,
  orgs,
  canManage = false,
  busy = false,
  inviteCreds,
  ownerEmail,
  onPause,
  onRun,
  onDelete,
}: Props) {
  const [tab, setTab] = useState<TabId>("overview");
  const [bills, setBills] = useState<ServiceBill[]>([]);
  const [team, setTeam] = useState<OrgMember[]>([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [teamLoading, setTeamLoading] = useState(false);
  const [tabError, setTabError] = useState<string | null>(null);

  const status = org.status ?? "active";
  const parent = useMemo(
    () => (org.parentId ? orgs.find((o) => o.id === org.parentId) ?? null : null),
    [org.parentId, orgs],
  );
  const merchants = useMemo(
    () =>
      merchantsInAgentSubtree(org.id, orgs).filter((o) => o.type === "merchant"),
    [org.id, orgs],
  );
  const sites = useMemo(
    () =>
      merchantsInAgentSubtree(org.id, orgs).filter(
        (o) => o.type === "merchant_site",
      ),
    [org.id, orgs],
  );

  useEffect(() => {
    setTab("overview");
    setTabError(null);
  }, [org.id]);

  useEffect(() => {
    if (tab !== "service-bills") return;
    let cancelled = false;
    setTabLoading(true);
    setTabError(null);
    void listServiceBills()
      .then((rows) => {
        if (cancelled) return;
        const merchantIds = new Set(
          merchantsInAgentSubtree(org.id, orgs).map((m) => m.id),
        );
        setBills(rows.filter((b) => merchantIds.has(b.orgId)));
      })
      .catch((err) => {
        if (!cancelled) {
          setTabError(
            err instanceof ApiError ? err.message : "Failed to load service bills",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setTabLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [org.id, orgs, tab]);

  useEffect(() => {
    let cancelled = false;
    setTeamLoading(true);
    void listOrgUsers(org.id)
      .then((rows) => {
        if (!cancelled) setTeam(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setTeam([]);
          if (!ownerEmail && !inviteCreds?.invitedEmail) {
            setTabError(
              err instanceof ApiError ? err.message : "Failed to load team",
            );
          }
        }
      })
      .finally(() => {
        if (!cancelled) setTeamLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [org.id, inviteCreds?.invitedEmail, ownerEmail]);

  const profileEmail = useMemo(() => {
    const fromInvite = inviteCreds?.invitedEmail?.trim();
    if (fromInvite) return fromInvite;
    const fromBulk = ownerEmail?.trim();
    if (fromBulk) return fromBulk;
    const fromTeam = preferredOrgEmail(team);
    if (fromTeam) return fromTeam;
    return "—";
  }, [inviteCreds?.invitedEmail, ownerEmail, team]);
  const country = fieldText(org.country);

  return (
    <div className="b3-agent-detail">
      <AuthToast
        message={tabError}
        tone="error"
        onDismiss={() => setTabError(null)}
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
      <div className="b3-agent-detail__head">
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
                {status === "paused" ? "Paused" : "Active"}
              </span>
            </div>
            <p className="b3-agent-detail__id">
              {profileEmail !== "—" ? (
                <a
                  className="b3-agent-detail__email"
                  href={`mailto:${profileEmail}`}
                  title={profileEmail}
                >
                  {profileEmail}
                </a>
              ) : (
                <span className="b3-agent-detail__email">
                  {teamLoading && !ownerEmail && !inviteCreds?.invitedEmail
                    ? "…"
                    : "—"}
                </span>
              )}
              <span> · {orgTypeLabel(org.type)}</span>
            </p>
          </div>
        </div>
        {canManage ? (
          <div className="b3-agent-detail__head-actions">
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
                Resume
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
          </div>
        ) : null}
      </div>

      <div className="b3-agent-detail__tabs" role="tablist" aria-label="Sub-agent tabs">
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
            <div className="b3-agent-detail__kpis b3-agent-detail__kpis--2">
              <div className="b3-card glass-tone-blue b3-card--kpi">
                <p className="b3-card__label">Merchants</p>
                <p className="b3-card__value">{merchants.length}</p>
              </div>
              <div className="b3-card glass-tone-slate b3-card--kpi">
                <p className="b3-card__label">Sites</p>
                <p className="b3-card__value">{sites.length}</p>
              </div>
            </div>

            <div className="b3-agent-detail__overview-stack">
              <section className="b3-card b3-card--section b3-card--flat">
                <div className="b3-profile__head">
                  <h3 className="b3-card__heading">Profile</h3>
                </div>
                <div className="b3-profile">
                  <div className="b3-profile__field">
                    <p className="b3-profile__label">Parent</p>
                    <p
                      className={`b3-profile__value${
                        parent?.name || org.parentId ? "" : " is-empty"
                      }`}
                    >
                      {parent?.name ?? org.parentId ?? "—"}
                    </p>
                  </div>
                  <div className="b3-profile__field">
                    <p className="b3-profile__label">Type</p>
                    <span className="b3-profile__pill b3-profile__pill--tier">
                      {orgTypeLabel(org.type)}
                    </span>
                  </div>
                  <div className="b3-profile__field">
                    <p className="b3-profile__label">Status</p>
                    <span
                      className={`b3-profile__pill${
                        status === "paused"
                          ? " b3-profile__pill--paused"
                          : " b3-profile__pill--ok"
                      }`}
                    >
                      {status === "paused" ? "Paused" : "Active"}
                    </span>
                  </div>
                  <div className="b3-profile__field">
                    <p className="b3-profile__label">Onboarded</p>
                    <p
                      className={`b3-profile__value${
                        org.createdAt ? "" : " is-empty"
                      }`}
                    >
                      {formatOnboardDate(org.createdAt)}
                    </p>
                  </div>
                  <div className="b3-profile__field">
                    <p className="b3-profile__label">Owner email</p>
                    {profileEmail !== "—" ? (
                      <a
                        className={`b3-profile__value b3-profile__value--link${
                          teamLoading && !ownerEmail && !inviteCreds?.invitedEmail
                            ? " is-empty"
                            : ""
                        }`}
                        href={`mailto:${profileEmail}`}
                      >
                        {profileEmail}
                      </a>
                    ) : (
                      <p
                        className={`b3-profile__value${
                          teamLoading ? "" : " is-empty"
                        }`}
                      >
                        {teamLoading ? "…" : "—"}
                      </p>
                    )}
                  </div>
                  <div className="b3-profile__field">
                    <p className="b3-profile__label">Country</p>
                    <p
                      className={`b3-profile__value${
                        country.empty ? " is-empty" : ""
                      }`}
                    >
                      {country.text}
                    </p>
                  </div>
                </div>
              </section>
            </div>

            {!canManage ? (
              <p className="b3-settlement__notice">
                You can view merchants and sites under this sub-agent, but only
                the sub-agent (or platform) may manage them. Commission edits
                remain platform-only.
              </p>
            ) : (
              <p className="b3-settlement__notice muted">
                Merchants and sites onboarded under this sub-agent are managed by
                the sub-agent team, not from your agent account.
              </p>
            )}
          </>
        ) : null}

        {tab === "accounts" ? (
          merchants.length === 0 && sites.length === 0 ? (
            <div className="b3-agent-detail__empty" role="status">
              <p className="b3-agent-detail__empty-title">No accounts yet</p>
              <p className="b3-agent-detail__empty-copy">
                Merchants and sites under this sub-agent appear here.
              </p>
            </div>
          ) : (
            <div className="b3-agent-detail__table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {[...merchants, ...sites].map((row) => (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td>{orgTypeLabel(row.type)}</td>
                      <td>
                        {(row.status ?? "active") === "paused"
                          ? "Paused"
                          : "Active"}
                      </td>
                      <td>
                        {row.type === "merchant" ? (
                          <Link
                            className="b3-agent-detail__row-action"
                            to={agentRoute(`merchants/${row.id}`)}
                          >
                            Open
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {tab === "service-bills" ? (
          tabLoading ? (
            <PlatformPending
              compact
              title="Loading service bills"
              copy="Fetching bills for merchants under this sub-agent."
            />
          ) : bills.length === 0 ? (
            <div className="b3-agent-detail__empty" role="status">
              <p className="b3-agent-detail__empty-title">No service bills</p>
              <p className="b3-agent-detail__empty-copy">
                Bills for merchants in this sub-agent’s subtree show here when
                issued.
              </p>
            </div>
          ) : (
            <div className="b3-agent-detail__table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Due</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {bills.map((bill) => (
                    <tr key={bill.id}>
                      <td>
                        {bill.periodStart} → {bill.periodEnd}
                      </td>
                      <td>{formatUsd(bill.totalAmount)}</td>
                      <td>{STATUS_LABEL[bill.status] ?? bill.status}</td>
                      <td>{formatShortDate(bill.dueAt)}</td>
                      <td>
                        <Link
                          className="b3-agent-detail__row-action"
                          to={agentRoute(`service-bills/${bill.id}`)}
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {tab === "team" ? (
          teamLoading ? (
            <PlatformPending
              compact
              title="Loading team"
              copy="Fetching memberships for this sub-agent."
            />
          ) : team.length === 0 ? (
            <div className="b3-agent-detail__empty" role="status">
              <p className="b3-agent-detail__empty-title">No team members</p>
              <p className="b3-agent-detail__empty-copy">
                Owner and staff invites for this sub-agent appear here.
              </p>
            </div>
          ) : (
            <div className="b3-agent-detail__table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {team.map((m) => (
                    <tr key={m.userId}>
                      <td>{m.email}</td>
                      <td>{m.role}</td>
                      <td>{m.status === "paused" ? "Paused" : "Active"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
