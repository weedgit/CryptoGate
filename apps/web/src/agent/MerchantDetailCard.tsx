import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { agentRoute } from "../shared/portalRouting";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  getMerchantCommercial,
  listAuditLog,
  listOrders,
  listOrgUsers,
  listOrgMemberEmails,
  listServiceBills,
  updateMerchantCommercial,
  type AuditLogEntry,
  type MerchantCommercialSettings,
  type OrgAccount,
  type OrgMember,
  type PaymentOrder,
  type ServiceBill,
} from "./api";
import { tierLabel } from "../commercialLabels";
import { FundAmount } from "../platform/FundAmount";
import { PlatformPending } from "../platform/ui/PlatformPending";
import {
  formatOnboardDate,
  merchantBillingPeriodStartMs,
  mergeActivityFeed,
  RECENT_ACTIVITY_LIMIT,
  type SeedAuditEntry,
} from "../platform/orgDetailSeeds";
import { merchantSites } from "./merchantSubtree";
import {
  STRUCTURE_LABELS,
  type MerchantStructure,
} from "./onboardMerchant";
import { formatShortDate, formatUsd } from "./org";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "sites", label: "Sites" },
  { id: "volume", label: "Volume" },
  { id: "service-bills", label: "Service bills" },
  { id: "commission", label: "Commission" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const STATUS_LABEL: Record<string, string> = {
  issued: "Issued",
  paid: "Paid",
  overdue: "Overdue",
  voided: "Voided",
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase() || "M";
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

type SiteEmailIndex = Map<
  string,
  { emails: string[]; ownerEmail?: string | null }
>;

function siteContactEmail(
  site: OrgAccount,
  emailByOrg: SiteEmailIndex,
): string {
  const row = emailByOrg.get(site.id);
  return (
    row?.ownerEmail?.trim() ||
    row?.emails.find((e) => e.trim())?.trim() ||
    "—"
  );
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

function parseTab(raw: string | undefined): TabId {
  return TABS.find((t) => t.id === raw)?.id ?? "overview";
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
            <circle
              cx="38"
              cy="36"
              r="4"
              stroke="currentColor"
              strokeWidth="1.6"
              opacity="0.55"
            />
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
    </div>
  );
}

function MerchantSitesEmpty({
  structure,
}: {
  structure: string | null | undefined;
}) {
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

type Props = {
  org: OrgAccount;
  orgs: OrgAccount[];
  canEditCommercial: boolean;
  canManage?: boolean;
  busy?: boolean;
  initialTab?: string;
  onPause?: () => void;
  onRun?: () => void;
  onDelete?: () => void;
};

/** Merchant detail card — platform b3 chrome, agent-scoped (no settlement keys). */
export function MerchantDetailCard({
  org,
  orgs,
  canEditCommercial,
  canManage = false,
  busy = false,
  initialTab,
  onPause,
  onRun,
  onDelete,
}: Props) {
  const [tab, setTab] = useState<TabId>(() => parseTab(initialTab));
  const [bills, setBills] = useState<ServiceBill[]>([]);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [team, setTeam] = useState<OrgMember[]>([]);
  const [commercial, setCommercial] =
    useState<MerchantCommercialSettings | null>(null);
  const [editTier, setEditTier] = useState("");
  const [editVolume, setEditVolume] = useState("");
  const [editReason, setEditReason] = useState("");
  const [commercialBusy, setCommercialBusy] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [tabError, setTabError] = useState<string | null>(null);
  const [siteEmails, setSiteEmails] = useState<SiteEmailIndex>(() => new Map());

  const status = org.status ?? "active";
  const sites = useMemo(() => merchantSites(org.id, orgs), [org.id, orgs]);
  const structureLabel = useMemo(() => {
    if (!org.structure) return "—";
    if (org.structure in STRUCTURE_LABELS) {
      return STRUCTURE_LABELS[org.structure as MerchantStructure];
    }
    return org.structure;
  }, [org.structure]);
  const parent = useMemo(
    () =>
      org.parentId ? (orgs.find((o) => o.id === org.parentId) ?? null) : null,
    [org.parentId, orgs],
  );
  const profileEmail = useMemo(
    () => preferredOrgEmail(team) ?? "—",
    [team],
  );
  const periodStart = useMemo(
    () =>
      merchantBillingPeriodStartMs(
        org.createdAt ?? new Date().toISOString(),
      ),
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
  const displayOrders = mtdOrders.length;
  const feePct = Number(commercial?.volumeFeePercent);
  const displayPlatformFeeMtd =
    Number.isFinite(feePct) && settledVolume > 0
      ? Math.round(settledVolume * (feePct / 100) * 100) / 100
      : 0;
  const openOrders = useMemo(
    () =>
      orders.filter((o) =>
        ["pending", "verifying", "payment_anomaly"].includes(o.status),
      ).length,
    [orders],
  );
  const recentActivity = useMemo(() => {
    const feed = mergeActivityFeed(
      audit as SeedAuditEntry[],
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
    setTab(parseTab(initialTab));
    setTabError(null);
    setCommercial(null);
    setBills([]);
    setOrders([]);
    setAudit([]);
    setTeam([]);
  }, [org.id, initialTab]);

  useEffect(() => {
    let cancelled = false;
    setOverviewLoading(true);
    void Promise.all([
      getMerchantCommercial(org.id).catch(() => null),
      listOrders({ orgId: org.id, limit: 200 }).catch(
        () => [] as PaymentOrder[],
      ),
      listAuditLog({ orgId: org.id, limit: 20 }).catch(
        () => [] as AuditLogEntry[],
      ),
      listOrgUsers(org.id).catch(() => [] as OrgMember[]),
    ])
      .then(([comm, ord, aud, teamRows]) => {
        if (cancelled) return;
        setCommercial(comm);
        if (comm) {
          setEditTier(comm.tier);
          setEditVolume(comm.volumeFeePercent);
        }
        setOrders(ord);
        setAudit(aud);
        setTeam(teamRows);
      })
      .finally(() => {
        if (!cancelled) setOverviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [org.id]);

  useEffect(() => {
    if (tab !== "sites" || sites.length === 0) {
      setSiteEmails(new Map());
      return;
    }
    let cancelled = false;
    void listOrgMemberEmails({ types: ["merchant_site"] })
      .then((items) => {
        if (cancelled) return;
        const map: SiteEmailIndex = new Map();
        for (const item of items) {
          map.set(item.orgId, {
            emails: item.emails ?? [],
            ownerEmail: item.ownerEmail,
          });
        }
        setSiteEmails(map);
      })
      .catch(() => {
        if (!cancelled) setSiteEmails(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [tab, sites]);

  useEffect(() => {
    if (tab !== "service-bills" && tab !== "volume") return;
    if (tab === "volume" && orders.length > 0) return;
    let cancelled = false;
    setTabLoading(true);
    setTabError(null);
    void (async () => {
      try {
        if (tab === "service-bills") {
          const rows = await listServiceBills({ orgId: org.id });
          if (!cancelled) setBills(rows);
        } else {
          const rows = await listOrders({ orgId: org.id, limit: 200 });
          if (!cancelled) setOrders(rows);
        }
      } catch (err) {
        if (!cancelled) {
          setTabError(
            err instanceof ApiError ? err.message : "Failed to load tab",
          );
        }
      } finally {
        if (!cancelled) setTabLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [org.id, tab, orders.length]);

  return (
    <aside className="b3-agent-detail" aria-label="Merchant detail">
      <AuthToast
        message={tabError}
        tone="error"
        onDismiss={() => setTabError(null)}
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
      </header>

      <div
        className="b3-agent-detail__tabs"
        role="tablist"
        aria-label="Merchant tabs"
      >
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
                  <FundAmount amount={settledVolume} />
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
                    <p className="b3-profile__label">Parent agent</p>
                    <p className="b3-profile__value">
                      {parent?.name ?? org.parentId ?? "—"}
                    </p>
                  </div>
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
                            {canEditCommercial ? (
                              <button
                                type="button"
                                className="b3-profile__edit-btn"
                                disabled={commercialBusy}
                                onClick={() => setTab("commission")}
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
                  <div className="b3-profile__field">
                    <p className="b3-profile__label">Country</p>
                    <p className="b3-profile__value">
                      {org.country?.trim() || "—"}
                    </p>
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
                )}
              </section>
            </div>

            <p className="b3-settlement__notice">
              Settlement addresses, API keys, webhooks, and credentials are
              managed by the merchant — agent view is read-only.
            </p>
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
              <table className="data-table b3-merchant-sites__table">
                <thead>
                  <tr>
                    <th>Site name</th>
                    <th>Email</th>
                    <th>Created</th>
                    <th>Status</th>
                    <th>ID</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((site) => (
                    <tr key={site.id}>
                      <td>
                        <span className="b3-merchant-sites__name">
                          {site.name}
                        </span>
                        {site.country ? (
                          <span className="b3-merchant-sites__meta">
                            {site.country}
                          </span>
                        ) : null}
                      </td>
                      <td className="b3-merchant-sites__email">
                        {siteContactEmail(site, siteEmails)}
                      </td>
                      <td className="b3-merchant-sites__created">
                        {site.createdAt
                          ? formatOnboardDate(site.createdAt)
                          : "—"}
                      </td>
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

        {tab === "volume" ? (
          tabLoading ? (
            <PlatformPending
              compact
              title="Loading volume"
              copy="Fetching payment orders for this merchant."
            />
          ) : (
            <>
              <div className="b3-agent-detail__kpis b3-agent-detail__kpis--3">
                <div className="b3-card glass-tone-slate b3-card--kpi">
                  <p className="b3-card__label">Volume (MTD)</p>
                  <p className="b3-card__value b3-card__value--ok">
                    <FundAmount amount={settledVolume} />
                  </p>
                </div>
                <div className="b3-card glass-tone-blue b3-card--kpi">
                  <p className="b3-card__label">Orders (MTD)</p>
                  <p className="b3-card__value">{displayOrders}</p>
                </div>
                <div className="b3-card glass-tone-emerald b3-card--kpi">
                  <p className="b3-card__label">Open orders</p>
                  <p className="b3-card__value">{openOrders}</p>
                </div>
              </div>
              <p className="b3-settlement__notice">
                Detailed volume charts ship with reporting API follow-up.
              </p>
            </>
          )
        ) : null}

        {tab === "service-bills" ? (
          tabLoading ? (
            <PlatformPending
              compact
              title="Loading service bills"
              copy="Fetching bills for this merchant."
            />
          ) : bills.length === 0 ? (
            <div className="b3-agent-detail__empty" role="status">
              <p className="b3-agent-detail__empty-title">No service bills</p>
              <p className="b3-agent-detail__empty-copy">
                Bills appear here when platform issues them for this merchant.
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
                        <Link to={agentRoute(`service-bills/${bill.id}`)}>View</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {tab === "commission" ? (
          commercial ? (
            canEditCommercial ? (
              <form
                className="form-stack"
                style={{ maxWidth: 480 }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  setCommercialBusy(true);
                  setTabError(null);
                  try {
                    const updated = await updateMerchantCommercial(org.id, {
                      tier: editTier,
                      volumeFeePercent: editVolume.trim(),
                      reason: editReason.trim() || undefined,
                    });
                    setCommercial(updated);
                    setEditReason("");
                  } catch (err) {
                    setTabError(
                      err instanceof ApiError
                        ? err.message
                        : "Failed to update commercial",
                    );
                  } finally {
                    setCommercialBusy(false);
                  }
                }}
              >
                <p style={{ color: "var(--muted)", marginTop: 0 }}>
                  Adjust tier or volume fee within platform bands. Enterprise
                  outside band queues platform approval.
                </p>
                <div className="field">
                  <label htmlFor="agent-m-tier">Tier</label>
                  <select
                    id="agent-m-tier"
                    className="field-control"
                    value={editTier}
                    onChange={(e) => setEditTier(e.target.value)}
                    disabled={commercialBusy}
                  >
                    {(["small", "mid", "enterprise"] as const).map((t) => (
                      <option key={t} value={t}>
                        {tierLabel(t)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="agent-m-volume">Volume fee %</label>
                  <input
                    id="agent-m-volume"
                    className="field-control"
                    value={editVolume}
                    onChange={(e) => setEditVolume(e.target.value)}
                    disabled={commercialBusy}
                  />
                  <p
                    style={{
                      color: "var(--muted)",
                      fontSize: 12,
                      marginTop: 8,
                    }}
                  >
                    Band {commercial.bandMinPercent}% –{" "}
                    {commercial.bandMaxPercent}%
                  </p>
                </div>
                <div className="field">
                  <label htmlFor="agent-m-reason">Note (optional)</label>
                  <input
                    id="agent-m-reason"
                    className="field-control"
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    disabled={commercialBusy}
                  />
                </div>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={commercialBusy}
                >
                  {commercialBusy ? "Saving…" : "Save changes"}
                </button>
              </form>
            ) : (
              <section className="b3-card b3-card--section b3-card--flat">
                <div className="b3-profile__head">
                  <h3 className="b3-card__heading">Commercial</h3>
                </div>
                <div className="b3-profile">
                  <div className="b3-profile__field">
                    <p className="b3-profile__label">Tier</p>
                    <p className="b3-profile__value">
                      {tierLabel(commercial.tier)}
                    </p>
                  </div>
                  <div className="b3-profile__field">
                    <p className="b3-profile__label">Volume fee %</p>
                    <p className="b3-profile__value">
                      {commercial.volumeFeePercent}%
                    </p>
                  </div>
                  <div className="b3-profile__field">
                    <p className="b3-profile__label">Band</p>
                    <p className="b3-profile__value">
                      {commercial.bandMinPercent}% – {commercial.bandMaxPercent}%
                    </p>
                  </div>
                </div>
                <p className="b3-settlement__notice">
                  Viewer accounts cannot change commercial rates.
                </p>
              </section>
            )
          ) : overviewLoading ? (
            <PlatformPending
              compact
              title="Loading commercial"
              copy="Fetching commercial settings for this merchant."
            />
          ) : (
            <div className="b3-agent-detail__empty" role="status">
              <p className="b3-agent-detail__empty-title">
                No commercial settings
              </p>
              <p className="b3-agent-detail__empty-copy">
                Commercial settings are not configured for this merchant yet.
              </p>
            </div>
          )
        ) : null}
      </div>
    </aside>
  );
}
