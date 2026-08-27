import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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

type Props = {
  org: OrgAccount;
  orgs: OrgAccount[];
};

/** Sub-agent detail card — platform b3 chrome, agent-scoped read-only actions. */
export function SubAgentDetailCard({ org, orgs }: Props) {
  const [tab, setTab] = useState<TabId>("overview");
  const [bills, setBills] = useState<ServiceBill[]>([]);
  const [team, setTeam] = useState<OrgMember[]>([]);
  const [tabLoading, setTabLoading] = useState(false);
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
    if (tab !== "team") return;
    let cancelled = false;
    setTabLoading(true);
    setTabError(null);
    void listOrgUsers(org.id)
      .then((rows) => {
        if (!cancelled) setTeam(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setTabError(
            err instanceof ApiError ? err.message : "Failed to load team",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setTabLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [org.id, tab]);

  return (
    <div className="b3-agent-detail">
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
              <span className="mono">{org.id}</span>
              <span> · {orgTypeLabel(org.type)}</span>
            </p>
          </div>
        </div>
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
        {tabError ? <p className="error">{tabError}</p> : null}

        {tab === "overview" ? (
          <>
            <div className="b3-agent-detail__kpis">
              <div className="b3-card b3-card--kpi">
                <p className="b3-accounts__kpi-label">Merchants</p>
                <p className="b3-accounts__kpi-value">{merchants.length}</p>
              </div>
              <div className="b3-card b3-card--kpi">
                <p className="b3-accounts__kpi-label">Sites</p>
                <p className="b3-accounts__kpi-value">{sites.length}</p>
              </div>
            </div>
            <div className="b3-card b3-card--section b3-card--flat">
              <dl className="detail-grid">
                <dt>Parent</dt>
                <dd>{parent?.name ?? org.parentId ?? "—"}</dd>
                <dt>Type</dt>
                <dd>{orgTypeLabel(org.type)}</dd>
                <dt>Status</dt>
                <dd>{status === "paused" ? "Paused" : "Active"}</dd>
                <dt>Country</dt>
                <dd>{org.country?.trim() || "—"}</dd>
                <dt>Billing email</dt>
                <dd>{org.billingEmail?.trim() || "—"}</dd>
              </dl>
              <p style={{ color: "var(--muted)", marginTop: 16, marginBottom: 0 }}>
                Pause, delete, and commission edits are platform-only. Onboard
                merchants under this sub-agent from Architecture or Merchants.
              </p>
            </div>
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
                          <Link to={`/agent/merchants/${row.id}`}>Open</Link>
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
                        <Link to={`/agent/service-bills/${bill.id}`}>View</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {tab === "team" ? (
          tabLoading ? (
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
