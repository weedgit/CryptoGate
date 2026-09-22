import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { agentRoute } from "../shared/portalRouting";
import { AuthToast } from "../auth/AuthToast";
import { getAgentOrgs, peekAgentOrgs } from "./agentOrgList";
import { getAgentOrders } from "./agentOrdersList";
import { getAgentServiceBills } from "./agentServiceBillsList";
import {
  ApiError,
  getMerchantCommercial,
  listOrgMemberEmails,
  type MerchantCommercialSettings,
  type OrgAccount,
  type PaymentOrder,
  type ServiceBill,
} from "./api";
import { tierLabel } from "../commercialLabels";
import { merchantSites } from "./merchantSubtree";
import { formatShortDate, formatUsd, orgTypeLabel } from "./org";

type LocationState = {
  invitationSent?: boolean;
  enterprisePending?: boolean;
};

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

function parseTab(raw: string | null): TabId {
  return TABS.find((t) => t.id === raw)?.id ?? "overview";
}

function siteContactEmail(
  site: OrgAccount,
  emailByOrg: Map<string, { emails: string[]; ownerEmail?: string | null }>,
): string {
  const row = emailByOrg.get(site.id);
  return (
    row?.ownerEmail?.trim() ||
    row?.emails.find((e) => e.trim())?.trim() ||
    "—"
  );
}

export function MerchantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const state = (location.state ?? {}) as LocationState;
  const tab = parseTab(searchParams.get("tab"));

  const [orgs, setOrgs] = useState<OrgAccount[]>(() => peekAgentOrgs() ?? []);
  const [bills, setBills] = useState<ServiceBill[]>([]);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [commercial, setCommercial] = useState<MerchantCommercialSettings | null>(null);
  const [loading, setLoading] = useState(
    () => !(id && peekAgentOrgs()?.some((o) => o.id === id)),
  );
  const [tabLoading, setTabLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tabError, setTabError] = useState<string | null>(null);
  const [toastInvite, setToastInvite] = useState(state.invitationSent === true);
  const [toastEnterprise, setToastEnterprise] = useState(
    state.enterprisePending === true,
  );
  const [siteEmails, setSiteEmails] = useState<
    Map<string, { emails: string[]; ownerEmail?: string | null }>
  >(() => new Map());

  const org = useMemo(
    () => (id ? (orgs.find((o) => o.id === id) ?? null) : null),
    [id, orgs],
  );

  const sites = useMemo(
    () => (id ? merchantSites(id, orgs) : []),
    [id, orgs],
  );

  const openOrders = useMemo(
    () =>
      orders.filter((o) =>
        ["pending", "verifying", "payment_anomaly"].includes(o.status),
      ).length,
    [orders],
  );

  useEffect(() => {
    if (!toastInvite && !toastEnterprise) return;
    const t = setTimeout(() => {
      setToastInvite(false);
      setToastEnterprise(false);
    }, 8000);
    return () => clearTimeout(t);
  }, [toastInvite, toastEnterprise]);

  const loadCore = useCallback(async () => {
    if (!id) return;
    if (!peekAgentOrgs()?.some((o) => o.id === id)) setLoading(true);
    setError(null);
    try {
      const rows = await getAgentOrgs();
      setOrgs(rows);
      const found = rows.find((o) => o.id === id) ?? null;
      if (!found) {
        setError("Merchant not found");
      } else if (found.type !== "merchant" && found.type !== "merchant_site") {
        setError("Org is not a merchant account");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load merchant");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  useEffect(() => {
    if (!id || !org || loading) return;
    if (tab !== "sites" || sites.length === 0) {
      setSiteEmails(new Map());
      return;
    }

    let cancelled = false;
    void listOrgMemberEmails({ types: ["merchant_site"] })
      .then((items) => {
        if (cancelled) return;
        const map = new Map<
          string,
          { emails: string[]; ownerEmail?: string | null }
        >();
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
  }, [id, org, tab, loading, sites.length]);

  useEffect(() => {
    if (!id || !org || loading) return;
    if (tab !== "overview" && tab !== "commission") return;

    let cancelled = false;
    (async () => {
      try {
        const row = await getMerchantCommercial(id);
        if (!cancelled) {
          setCommercial(row);
        }
      } catch {
        if (!cancelled) setCommercial(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, org, tab, loading]);

  useEffect(() => {
    if (!id || !org || loading) return;
    if (tab !== "service-bills" && tab !== "volume") return;

    let cancelled = false;
    setTabLoading(true);
    setTabError(null);

    (async () => {
      try {
        if (tab === "service-bills") {
          const rows = (await getAgentServiceBills()).filter((b) => b.orgId === id);
          if (!cancelled) setBills(rows);
        } else {
          const rows = (await getAgentOrders()).filter((o) => o.orgId === id);
          if (!cancelled) setOrders(rows);
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
  }, [id, org, tab, loading]);

  function setTab(next: TabId) {
    setSearchParams(next === "overview" ? {} : { tab: next }, { replace: true });
  }

  if (loading) {
    return <p style={{ color: "var(--muted)" }}>Loading merchant…</p>;
  }

  if (error || !org) {
    return (
      <div className="panel">
        <AuthToast
          message={error ?? "Merchant not found"}
          tone="error"
          onDismiss={() => setError(null)}
        />
        <p className="muted">Could not load this merchant.</p>
        <Link to={agentRoute("merchants")}>← Back to merchants</Link>
      </div>
    );
  }

  return (
    <div className="panel">
      <AuthToast
        message={tabError}
        tone="error"
        onDismiss={() => setTabError(null)}
      />
      <div className="panel-head">
        <h2>{org.name}</h2>
        <Link className="btn-secondary" to={agentRoute("merchants")}>
          Back
        </Link>
      </div>
      {toastInvite ? (
        <div className="banner banner-ok" style={{ marginBottom: 12 }}>
          Invitation sent to merchant Owner.
        </div>
      ) : null}
      {toastEnterprise ? (
        <div className="banner banner-warn" style={{ marginBottom: 12 }}>
          Enterprise rate submitted — platform Owner must approve on Fee tiers (B8)
          before the custom rate applies.
        </div>
      ) : null}

      <div className="filter-tabs" role="tablist" style={{ marginBottom: 20 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className={`filter-tab${tab === t.id ? " active" : ""}`}
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <>
          <dl className="detail-grid">
            <dt>Org ID</dt>
            <dd className="mono">{org.id}</dd>
            <dt>Type</dt>
            <dd>{orgTypeLabel(org.type)}</dd>
            <dt>Status</dt>
            <dd>
              <span className="status-badge tone-ok">Active</span>
            </dd>
            <dt>Fee tier</dt>
            <dd>{commercial ? tierLabel(commercial.tier) : "—"}</dd>
            <dt>Rate mode</dt>
            <dd>
              {commercial
                ? commercial.rateMode === "fixed"
                  ? "Fixed"
                  : "Automatic"
                : "—"}
            </dd>
            <dt>Volume fee %</dt>
            <dd>
              {commercial ? (
                <>
                  {commercial.volumeFeePercent}%
                  {commercial.pendingVolumeFeePercent ? (
                    <span style={{ color: "var(--muted)" }}>
                      {" "}
                      → {commercial.pendingVolumeFeePercent}% next period
                    </span>
                  ) : null}
                  {commercial.enterpriseApprovalStatus === "pending" ? (
                    <span className="status-badge tone-warn" style={{ marginLeft: 8 }}>
                      Pending approval
                    </span>
                  ) : null}
                </>
              ) : (
                "—"
              )}
            </dd>
          </dl>
          <p style={{ color: "var(--muted)", marginTop: 16, marginBottom: 0 }}>
            Settlement addresses, API keys, webhooks, and credentials are{" "}
            <strong>managed by merchant</strong> — agent view is read-only (C7).
          </p>
        </>
      ) : null}

      {tab === "sites" ? (
        <>
          {sites.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>
              No sites under this account yet.
            </p>
          ) : (
            <table className="data-table b3-merchant-sites__table">
              <thead>
                <tr>
                  <th>Site name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => (
                  <tr key={site.id}>
                    <td>{site.name}</td>
                    <td>{siteContactEmail(site, siteEmails)}</td>
                    <td>
                      <span
                        className={`status-badge ${
                          site.status === "paused" ? "tone-warn" : "tone-ok"
                        }`}
                      >
                        {(site.status ?? "active").toUpperCase()}
                      </span>
                    </td>
                    <td className="mono">{site.id.slice(0, 8)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : null}

      {tab === "volume" ? (
        <>
          {tabLoading ? (
            <p style={{ color: "var(--muted)" }}>Loading orders…</p>
          ) : (
            <>
              <div className="kpi-grid" style={{ marginBottom: 16 }}>
                <div className="kpi-card">
                  <p className="kpi-label">Orders loaded</p>
                  <p className="kpi-value">{orders.length}</p>
                </div>
                <div className="kpi-card">
                  <p className="kpi-label">Open</p>
                  <p className="kpi-value">{openOrders}</p>
                </div>
              </div>
              <p style={{ color: "var(--muted)", margin: 0 }}>
                Volume charts and commission attribution require reporting API (C7/C8).
              </p>
            </>
          )}
        </>
      ) : null}

      {tab === "service-bills" ? (
        <>
          {tabLoading ? (
            <p style={{ color: "var(--muted)" }}>Loading service bills…</p>
          ) : bills.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>No service bills for this merchant.</p>
          ) : (
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
          )}
          <p style={{ color: "var(--muted)", marginTop: 16, marginBottom: 0 }}>
            Read-only — issue and adjust remain platform-only (C9).
          </p>
        </>
      ) : null}

      {tab === "commission" ? (
        commercial ? (
          <dl className="detail-grid">
            <dt>Mode</dt>
            <dd>
              {commercial.rateMode === "fixed" ? "Fixed" : "Automatic"}
            </dd>
            <dt>Tier</dt>
            <dd>{tierLabel(commercial.tier)}</dd>
            <dt>Volume fee %</dt>
            <dd>
              {commercial.volumeFeePercent}%
              {commercial.pendingVolumeFeePercent ? (
                <span style={{ color: "var(--muted)" }}>
                  {" "}
                  → {commercial.pendingVolumeFeePercent}% next period
                </span>
              ) : null}
            </dd>
            <dt>Band</dt>
            <dd>
              {commercial.bandMinPercent}% – {commercial.bandMaxPercent}%
            </dd>
            <dt>Note</dt>
            <dd style={{ color: "var(--muted)" }}>
              Rates follow the platform volume schedule. Fixed specials are set
              by Platform Owner only.
            </dd>
          </dl>
        ) : (
          <p style={{ color: "var(--muted)", margin: 0 }}>
            Commercial settings not configured for this merchant.
          </p>
        )
      ) : null}
    </div>
  );
}
