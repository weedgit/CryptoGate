import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import {
  ApiError,
  listOrders,
  listOrgs,
  listServiceBills,
  type OrgAccount,
  type PaymentOrder,
  type ServiceBill,
} from "./api";
import { merchantSites } from "./merchantSubtree";
import { STRUCTURE_LABELS, type MerchantStructure } from "./onboardMerchant";
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

export function MerchantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const state = (location.state ?? {}) as LocationState;
  const tab = parseTab(searchParams.get("tab"));

  const [orgs, setOrgs] = useState<OrgAccount[]>([]);
  const [bills, setBills] = useState<ServiceBill[]>([]);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tabError, setTabError] = useState<string | null>(null);
  const [toastInvite, setToastInvite] = useState(state.invitationSent === true);
  const [toastEnterprise, setToastEnterprise] = useState(
    state.enterprisePending === true,
  );

  const org = useMemo(
    () => (id ? (orgs.find((o) => o.id === id) ?? null) : null),
    [id, orgs],
  );

  const sites = useMemo(
    () => (id ? merchantSites(id, orgs) : []),
    [id, orgs],
  );

  const structure = useMemo(() => {
    if (!org?.structure) return "—";
    if (org.structure in STRUCTURE_LABELS) {
      return STRUCTURE_LABELS[org.structure as MerchantStructure];
    }
    return org.structure;
  }, [org]);

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
    setLoading(true);
    setError(null);
    try {
      const rows = await listOrgs();
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
    if (tab !== "service-bills" && tab !== "volume") return;

    let cancelled = false;
    setTabLoading(true);
    setTabError(null);

    (async () => {
      try {
        if (tab === "service-bills") {
          const rows = await listServiceBills({ orgId: id });
          if (!cancelled) setBills(rows);
        } else {
          const rows = await listOrders({ orgId: id, limit: 200 });
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
        <p className="error">{error ?? "Merchant not found"}</p>
        <Link to="/agent/merchants">Back to merchants</Link>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{org.name}</h2>
        <Link className="btn-secondary" to="/agent/merchants">
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
          Enterprise tier selected (stub) — would require platform approval when X-01
          ships.
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

      {tabError ? <p className="error">{tabError}</p> : null}

      {tab === "overview" ? (
        <>
          <dl className="detail-grid">
            <dt>Org ID</dt>
            <dd className="mono">{org.id}</dd>
            <dt>Type</dt>
            <dd>{orgTypeLabel(org.type)}</dd>
            <dt>Structure</dt>
            <dd>{structure}</dd>
            <dt>Status</dt>
            <dd>
              <span className="status-badge tone-ok">Active</span>
            </dd>
            <dt>Fee tier</dt>
            <dd style={{ color: "var(--muted)" }}>Mid (stub — X-01)</dd>
            <dt>Volume fee %</dt>
            <dd style={{ color: "var(--muted)" }}>— (stub — C8)</dd>
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
              {org.structure === "multi_location"
                ? "No merchant (site) orgs under this account yet."
                : "Single-location merchant — no separate site orgs."}
            </p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Site name</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => (
                  <tr key={site.id}>
                    <td>{site.name}</td>
                    <td className="mono">{site.id}</td>
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
                      <Link to={`/agent/service-bills/${bill.id}`}>View</Link>
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
        <p style={{ color: "var(--muted)", margin: 0 }}>
          Commission attribution statements require X-01 fee tier API. Volume fee edit
          (C8) ships when band contract lands.
        </p>
      ) : null}
    </div>
  );
}
