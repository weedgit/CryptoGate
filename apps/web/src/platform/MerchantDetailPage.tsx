import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ApiError,
  getMatchingMode,
  getMerchantCommercial,
  listOrders,
  listOrgs,
  listServiceBills,
  listSettlement,
  listXpub,
  type MerchantCommercialSettings,
  type OrgAccount,
  type PaymentOrder,
  type ServiceBill,
  type SettlementAddress,
  type XpubSettings,
} from "./api";
import {
  merchantSites,
  parentAgentName,
  STRUCTURE_LABELS,
} from "./merchantSubtree";
import { formatUsd, orgTypeLabel } from "./org";
import { tierLabel } from "../commercialLabels";
import { matchingModeLabel } from "../merchant/matchingLabels";
import {
  formatBillId,
  serviceBillStatusLabel,
  serviceBillStatusTone,
} from "./serviceBillStatus";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "sites", label: "Sites" },
  { id: "settlement", label: "Settlement" },
  { id: "volume", label: "Volume & orders" },
  { id: "service-bills", label: "Service bills" },
  { id: "compliance", label: "Compliance" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function parseTab(raw: string | null): TabId {
  return TABS.find((t) => t.id === raw)?.id ?? "overview";
}

export function MerchantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  const [orgs, setOrgs] = useState<OrgAccount[]>([]);
  const [bills, setBills] = useState<ServiceBill[]>([]);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [settlement, setSettlement] = useState<SettlementAddress[]>([]);
  const [xpubs, setXpubs] = useState<XpubSettings[]>([]);
  const [matchingMode, setMatchingMode] = useState<string>("—");
  const [commercial, setCommercial] = useState<MerchantCommercialSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tabError, setTabError] = useState<string | null>(null);

  const org = useMemo(
    () => (id ? (orgs.find((o) => o.id === id) ?? null) : null),
    [id, orgs],
  );

  const sites = useMemo(
    () => (id ? merchantSites(id, orgs) : []),
    [id, orgs],
  );

  const agentName = useMemo(
    () => (org ? parentAgentName(org, orgs) : null),
    [org, orgs],
  );

  const structureLabel = useMemo(() => {
    if (!org?.structure) return "—";
    return STRUCTURE_LABELS[org.structure] ?? org.structure.replace("_", " ");
  }, [org]);

  const merchantBills = useMemo(
    () => bills.filter((b) => b.orgId === id),
    [bills, id],
  );

  const openOrders = useMemo(
    () =>
      orders.filter((o) =>
        ["pending", "verifying", "payment_anomaly"].includes(o.status),
      ).length,
    [orders],
  );

  const anomalies = useMemo(
    () => orders.filter((o) => o.status === "payment_anomaly").length,
    [orders],
  );

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
    if (tab !== "overview") return;

    let cancelled = false;
    (async () => {
      try {
        const row = await getMerchantCommercial(id);
        if (!cancelled) setCommercial(row);
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

    let cancelled = false;
    setTabLoading(true);
    setTabError(null);

    (async () => {
      try {
        if (tab === "service-bills") {
          const rows = await listServiceBills({ orgId: id });
          if (!cancelled) setBills(rows);
        } else if (tab === "volume") {
          const rows = await listOrders({ orgId: id, limit: 200 });
          if (!cancelled) setOrders(rows);
        } else if (tab === "settlement") {
          const [mode, addresses, xp] = await Promise.all([
            getMatchingMode(id),
            listSettlement(id),
            listXpub(id),
          ]);
          if (!cancelled) {
            setMatchingMode(mode.matchingMode);
            setSettlement(addresses);
            setXpubs(xp);
          }
        } else if (tab === "compliance") {
          // B7 override log — no dedicated API yet.
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
        <Link to="/platform/merchants">Back to merchants</Link>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{org.name}</h2>
        <Link className="btn-secondary" to="/platform/merchants">
          Back
        </Link>
      </div>

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
            <dd>{structureLabel}</dd>
            <dt>Parent agent</dt>
            <dd>{agentName ?? "—"}</dd>
            <dt>Status</dt>
            <dd>
              <span className="status-badge tone-ok">Active</span>
            </dd>
            <dt>Fee tier</dt>
            <dd>{commercial ? tierLabel(commercial.tier) : "—"}</dd>
            <dt>Effective volume fee</dt>
            <dd>
              {commercial ? (
                <>
                  {commercial.volumeFeePercent}%
                  {commercial.pendingVolumeFeePercent ? (
                    <span style={{ color: "var(--muted)" }}>
                      {" "}
                      → {commercial.pendingVolumeFeePercent}% from{" "}
                      {commercial.effectiveFrom}
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
            <dt>Subscription (USD)</dt>
            <dd>{commercial ? formatUsd(commercial.subscriptionAmountUsd) : "—"}</dd>
          </dl>
          <p style={{ color: "var(--muted)", marginTop: 16, marginBottom: 0 }}>
            Suspend and compliance override (B7) ship when org PATCH and override API
            land.
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

      {tab === "settlement" ? (
        <>
          {tabLoading ? (
            <p style={{ color: "var(--muted)" }}>Loading settlement settings…</p>
          ) : (
            <>
              <dl className="detail-grid">
                <dt>Matching mode</dt>
                <dd>{matchingModeLabel(matchingMode)}</dd>
              </dl>
              <h3 style={{ fontSize: 15, marginTop: 20 }}>Settlement addresses</h3>
              {settlement.length === 0 ? (
                <p style={{ color: "var(--muted)" }}>No settlement addresses configured.</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Network</th>
                      <th>Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlement.map((row) => (
                      <tr key={`${row.asset}-${row.network}`}>
                        <td>{row.asset}</td>
                        <td>{row.network}</td>
                        <td className="mono">{row.address}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <h3 style={{ fontSize: 15, marginTop: 20 }}>xPub (watch-only)</h3>
              {xpubs.length === 0 ? (
                <p style={{ color: "var(--muted)" }}>No xPub registered.</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Network</th>
                      <th>Configured</th>
                    </tr>
                  </thead>
                  <tbody>
                    {xpubs.map((row) => (
                      <tr key={`${row.asset}-${row.network}`}>
                        <td>{row.asset}</td>
                        <td>{row.network}</td>
                        <td>{row.xPubConfigured ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p style={{ color: "var(--muted)", marginTop: 16, marginBottom: 0 }}>
                Read-only platform view — no private keys or full xPub strings (B6).
              </p>
            </>
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
                <div className="kpi-card">
                  <p className="kpi-label">Payment anomalies</p>
                  <p className="kpi-value">{anomalies}</p>
                </div>
              </div>
              <p style={{ color: "var(--muted)", margin: 0 }}>
                Aggregate charts (B1) and anomaly drill-down ship with reporting API.
              </p>
            </>
          )}
        </>
      ) : null}

      {tab === "service-bills" ? (
        <>
          {tabLoading ? (
            <p style={{ color: "var(--muted)" }}>Loading service bills…</p>
          ) : merchantBills.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>No service bills for this merchant.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Bill</th>
                  <th>Period</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {merchantBills.map((bill) => (
                  <tr key={bill.id}>
                    <td className="mono">{formatBillId(bill.id)}</td>
                    <td>
                      {bill.periodStart} → {bill.periodEnd}
                    </td>
                    <td>{formatUsd(bill.totalAmount)}</td>
                    <td>
                      <span
                        className={`status-badge tone-${serviceBillStatusTone(bill.status)}`}
                      >
                        {serviceBillStatusLabel(bill.status)}
                      </span>
                    </td>
                    <td>
                      <Link to={`/platform/service-bills/${bill.id}`}>View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : null}

      {tab === "compliance" ? (
        <p style={{ color: "var(--muted)", margin: 0 }}>
          Compliance override log and B7 modal require platform override API. Audit
          events for this merchant are visible on the{" "}
          <Link to={`/platform/audit?orgId=${encodeURIComponent(org.id)}`}>
            platform audit log
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
