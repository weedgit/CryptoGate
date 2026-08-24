import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import {
  ApiError,
  listAuditLog,
  listOrgs,
  listServiceBills,
  type AuditLogEntry,
  type OrgAccount,
  type ServiceBill,
} from "./api";
import { merchantsInAgentSubtree, merchantOrgIdsInAgentSubtree } from "./agentSubtree";
import { agentDepthOf, DEFAULT_MAX_AGENT_DEPTH } from "./onboardAgent";
import { formatUsd, orgTypeLabel } from "./org";
import {
  formatBillId,
  serviceBillStatusLabel,
  serviceBillStatusTone,
} from "./serviceBillStatus";

type LocationState = {
  invitationSent?: boolean;
  displayName?: string;
};

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "merchants", label: "Merchants" },
  { id: "volume", label: "Volume" },
  { id: "service-bills", label: "Service bills" },
  { id: "commission", label: "Commission" },
  { id: "team", label: "Team" },
  { id: "audit", label: "Audit" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const AUDIT_LABEL: Record<string, string> = {
  login: "Login",
  org_create: "Org created",
  service_bill_issue: "Service bill issued",
  service_bill_mark_paid: "Bill marked paid",
  service_bill_void: "Bill voided",
  service_bill_adjust: "Bill adjusted",
};

function parseTab(raw: string | null): TabId {
  const hit = TABS.find((t) => t.id === raw);
  return hit?.id ?? "overview";
}

export function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const state = (location.state ?? {}) as LocationState;
  const tab = parseTab(searchParams.get("tab"));

  const [orgs, setOrgs] = useState<OrgAccount[]>([]);
  const [bills, setBills] = useState<ServiceBill[]>([]);
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState(state.invitationSent === true);

  const org = useMemo(
    () => (id ? (orgs.find((o) => o.id === id) ?? null) : null),
    [id, orgs],
  );

  const parentName = useMemo(() => {
    if (!org?.parentId) return null;
    return orgs.find((o) => o.id === org.parentId)?.name ?? org.parentId;
  }, [org, orgs]);

  const merchants = useMemo(
    () => (id ? merchantsInAgentSubtree(id, orgs) : []),
    [id, orgs],
  );

  const merchantIds = useMemo(
    () => (id ? merchantOrgIdsInAgentSubtree(id, orgs) : new Set<string>()),
    [id, orgs],
  );

  const agentBills = useMemo(
    () => bills.filter((b) => merchantIds.has(b.orgId)),
    [bills, merchantIds],
  );

  const depth = useMemo(() => (org ? agentDepthOf(org.id, orgs) : 0), [org, orgs]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(false), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  const loadCore = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await listOrgs();
      setOrgs(rows);
      const found = rows.find((o) => o.id === id);
      if (!found) {
        setError("Agent not found");
      } else if (found.type !== "agent" && found.type !== "agent_sub") {
        setError("Org is not an agent account");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load agent");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  useEffect(() => {
    if (!id || !org || loading) return;
    if (tab !== "service-bills" && tab !== "audit") return;

    let cancelled = false;
    setTabLoading(true);
    (async () => {
      try {
        if (tab === "service-bills") {
          const rows = await listServiceBills();
          if (!cancelled) setBills(rows);
        } else {
          const rows = await listAuditLog({ orgId: id, limit: 100 });
          if (!cancelled) setAudit(rows);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to load tab data");
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
    return <p style={{ color: "var(--muted)" }}>Loading agent…</p>;
  }

  if (error || !org) {
    return (
      <div className="panel">
        <p className="error">{error ?? "Agent not found"}</p>
        <Link to="/platform/agents">Back to agents</Link>
      </div>
    );
  }

  const title = state.displayName ?? org.name;

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <h2>{title}</h2>
          <Link className="btn-secondary" to="/platform/agents">
            Back
          </Link>
        </div>
        {toast ? (
          <div className="banner banner-ok" style={{ marginBottom: 16 }}>
            Invitation sent to the new Owner.
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
              <dt>Display name</dt>
              <dd>{org.name}</dd>
              <dt>Parent</dt>
              <dd>{parentName ?? "—"}</dd>
              <dt>Depth</dt>
              <dd>
                {depth} / {DEFAULT_MAX_AGENT_DEPTH}
              </dd>
              <dt>Status</dt>
              <dd>
                <span className="status-badge tone-ok">Active</span>
              </dd>
              <dt>Billing email</dt>
              <dd style={{ color: "var(--muted)" }}>— (not on org API yet)</dd>
              <dt>Default merchant tier</dt>
              <dd style={{ color: "var(--muted)" }}>Mid (stub — X-01)</dd>
              <dt>Commission %</dt>
              <dd style={{ color: "var(--muted)" }}>15% (stub — X-01)</dd>
            </dl>
            <p style={{ color: "var(--muted)", marginTop: 16, marginBottom: 0 }}>
              Suspend, edit commission, and internal notes (B3 actions) ship when org PATCH
              and fee APIs land.
            </p>
          </>
        ) : null}

        {tab === "merchants" ? (
          <>
            {merchants.length === 0 ? (
              <p style={{ color: "var(--muted)" }}>No merchants under this agent yet.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Structure</th>
                    <th>ID</th>
                  </tr>
                </thead>
                <tbody>
                  {merchants.map((m) => (
                    <tr key={m.id}>
                      <td>{m.name}</td>
                      <td>{orgTypeLabel(m.type)}</td>
                      <td>{m.structure?.replace("_", " ") ?? "—"}</td>
                      <td className="mono">{m.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p style={{ color: "var(--muted)", marginTop: 16, marginBottom: 0 }}>
              Merchant detail (B6) links ship when platform merchant detail route exists.
            </p>
          </>
        ) : null}

        {tab === "volume" ? (
          <p style={{ color: "var(--muted)", margin: 0 }}>
            Volume charts for this agent subtree require aggregated reporting API (B1).
            Open payment orders are visible on the platform dashboard until then.
          </p>
        ) : null}

        {tab === "service-bills" ? (
          <>
            {tabLoading ? (
              <p style={{ color: "var(--muted)" }}>Loading service bills…</p>
            ) : agentBills.length === 0 ? (
              <p style={{ color: "var(--muted)" }}>
                No service bills for merchants under this agent.
              </p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Bill</th>
                    <th>Merchant</th>
                    <th>Period</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {agentBills.map((bill) => (
                    <tr key={bill.id}>
                      <td className="mono">{formatBillId(bill.id)}</td>
                      <td>
                        {orgs.find((o) => o.id === bill.orgId)?.name ?? bill.orgId}
                      </td>
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

        {tab === "commission" ? (
          <p style={{ color: "var(--muted)", margin: 0 }}>
            Monthly commission statements require X-01 fee tier and statement API. Stub
            until platform billing contract ships.
          </p>
        ) : null}

        {tab === "team" ? (
          <>
            <p style={{ color: "var(--muted)", marginTop: 0 }}>
              Team membership is managed by the agent Owner. Platform view is read-only
              when <code>GET /v1/orgs/&#123;id&#125;/users</code> list ships.
            </p>
            <p style={{ color: "var(--muted)", marginBottom: 0 }}>
              New owners are invited during{" "}
              <Link to="/platform/agents/new">onboard agent (B4)</Link>.
            </p>
          </>
        ) : null}

        {tab === "audit" ? (
          <>
            {tabLoading ? (
              <p style={{ color: "var(--muted)" }}>Loading audit events…</p>
            ) : audit.length === 0 ? (
              <p style={{ color: "var(--muted)" }}>
                No audit events for this agent org yet.
              </p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Action</th>
                    <th>Actor</th>
                    <th>Metadata</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((row) => (
                    <tr key={row.id}>
                      <td>{new Date(row.createdAt).toLocaleString()}</td>
                      <td>{AUDIT_LABEL[row.action] ?? row.action}</td>
                      <td className="mono">{row.actorUserId?.slice(0, 8) ?? "—"}</td>
                      <td className="mono" style={{ fontSize: 11 }}>
                        {Object.keys(row.metadata).length
                          ? JSON.stringify(row.metadata)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p style={{ marginTop: 16, marginBottom: 0 }}>
              <Link to="/platform/audit">Full platform audit log (B14)</Link>
            </p>
          </>
        ) : null}
      </div>
    </>
  );
}
