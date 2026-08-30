import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  getMerchantCommercial,
  listOrders,
  listOrgs,
  listServiceBills,
  updateMerchantCommercial,
  type MerchantCommercialSettings,
  type OrgAccount,
  type PaymentOrder,
  type ServiceBill,
} from "./api";
import { tierLabel } from "../commercialLabels";
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
  const [commercial, setCommercial] = useState<MerchantCommercialSettings | null>(null);
  const [editTier, setEditTier] = useState("");
  const [editVolume, setEditVolume] = useState("");
  const [editReason, setEditReason] = useState("");
  const [commercialBusy, setCommercialBusy] = useState(false);
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
    if (tab !== "overview" && tab !== "commission") return;

    let cancelled = false;
    (async () => {
      try {
        const row = await getMerchantCommercial(id);
        if (!cancelled) {
          setCommercial(row);
          setEditTier(row.tier);
          setEditVolume(row.volumeFeePercent);
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
        <AuthToast
          message={error ?? "Merchant not found"}
          tone="error"
          onDismiss={() => setError(null)}
        />
        <p className="muted">Could not load this merchant.</p>
        <Link to="/agent/merchants">← Back to merchants</Link>
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
            <dt>Structure</dt>
            <dd>{structure}</dd>
            <dt>Status</dt>
            <dd>
              <span className="status-badge tone-ok">Active</span>
            </dd>
            <dt>Fee tier</dt>
            <dd>{commercial ? tierLabel(commercial.tier) : "—"}</dd>
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
              {org.structure === "multi_location"
                ? "No merchant (site) orgs under this account yet."
                : "Single-location merchant — no separate site orgs."}
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
                    <td>{site.billingEmail?.trim() || "—"}</td>
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
        commercial ? (
          <form
            className="form-stack"
            style={{ maxWidth: 480 }}
            onSubmit={async (e) => {
              e.preventDefault();
              if (!id) return;
              setCommercialBusy(true);
              setTabError(null);
              try {
                const updated = await updateMerchantCommercial(id, {
                  tier: editTier,
                  volumeFeePercent: editVolume.trim(),
                  reason: editReason.trim() || undefined,
                });
                setCommercial(updated);
                setEditReason("");
              } catch (err) {
                setTabError(
                  err instanceof ApiError ? err.message : "Failed to update commercial",
                );
              } finally {
                setCommercialBusy(false);
              }
            }}
          >
            <p style={{ color: "var(--muted)", marginTop: 0 }}>
              Adjust tier or volume fee within platform bands. Changes apply
              immediately. Enterprise outside band queues platform approval.
            </p>
            <div className="field">
              <label htmlFor="c-tier">Tier</label>
              <select
                id="c-tier"
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
              <label htmlFor="c-volume">Volume fee %</label>
              <input
                id="c-volume"
                className="field-control"
                value={editVolume}
                onChange={(e) => setEditVolume(e.target.value)}
                disabled={commercialBusy}
              />
              <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 8 }}>
                Band {commercial.bandMinPercent}% – {commercial.bandMaxPercent}%
              </p>
            </div>
            <div className="field">
              <label htmlFor="c-reason">Note (optional)</label>
              <input
                id="c-reason"
                className="field-control"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                disabled={commercialBusy}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={commercialBusy}>
              {commercialBusy ? "Saving…" : "Save changes"}
            </button>
          </form>
        ) : (
          <p style={{ color: "var(--muted)", margin: 0 }}>
            Commercial settings not configured for this merchant.
          </p>
        )
      ) : null}
    </div>
  );
}
