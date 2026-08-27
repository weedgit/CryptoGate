import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { AuditAction } from "@cryptogate/domain";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  getPlatformOrgs,
  listAuditLog,
  listOrgUsers,
  peekPlatformOrgs,
  type AuditLogEntry,
  type OrgAccount,
} from "./api";
import { PlatformPending, PlatformTableSkeleton } from "./ui/PlatformPending";
import { OrgListPagination } from "./OrgListPagination";

const PAGE_SIZE = 10;
const LIMIT_OPTIONS = [50, 100, 200, 500] as const;

const ACTION_LABEL: Record<string, string> = {
  login: "Login",
  logout: "Logout",
  mfa_enroll: "MFA enroll",
  mfa_verify_enroll: "MFA verify enroll",
  mfa_verify_login: "MFA verify login",
  org_create: "Org created",
  org_status: "Org status",
  org_delete: "Org deleted",
  org_user_invite: "Team invite",
  org_user_role: "Role changed",
  org_user_pause: "Member paused",
  org_user_resume: "Member resumed",
  org_user_remove: "Member removed",
  settlement_put: "Settlement updated",
  matching_mode_put: "Matching mode updated",
  xpub_put: "xPub updated",
  webhook_register: "Webhook registered",
  webhook_delete: "Webhook deleted",
  service_bill_issue: "Service bill issued",
  service_bill_mark_paid: "Bill marked paid",
  service_bill_void: "Bill voided",
  service_bill_adjust: "Bill adjusted",
  api_key_create: "API key created",
  api_key_revoke: "API key revoked",
  api_key_rotate: "API key rotated",
  fee_tier_put: "Fee tiers saved",
  org_policy_put: "Org policy saved",
  merchant_commercial_put: "Merchant commercial updated",
  enterprise_rate_decide: "Enterprise rate decided",
  agent_payout_put: "Agent payout updated",
  agent_commission_put: "Agent commission updated",
  password_reset_request: "Password reset requested",
  password_reset_complete: "Password reset completed",
};

const ACTION_FILTERS = Object.values(AuditAction).sort();

function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action.replace(/_/g, " ");
}

function orgNameMap(orgs: OrgAccount[]): Map<string, string> {
  return new Map(orgs.map((o) => [o.id, o.name]));
}

function shortId(id: string | null | undefined): string {
  if (!id) return "—";
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function metadataIp(
  metadata: Record<string, string | number | boolean | null>,
): string {
  for (const key of ["ip", "ipAddress", "clientIp", "remoteAddr"]) {
    const v = metadata[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "—";
}

function metadataRole(
  metadata: Record<string, string | number | boolean | null>,
): string {
  for (const key of ["role", "actorRole", "callerRole"]) {
    const v = metadata[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "—";
}

function metadataResource(
  metadata: Record<string, string | number | boolean | null>,
): string {
  for (const key of [
    "billId",
    "orderId",
    "resource",
    "resourceId",
    "targetUserId",
    "email",
    "name",
  ]) {
    const v = metadata[key];
    if (v != null && String(v).trim()) {
      const s = String(v);
      return s.length > 36 ? `${s.slice(0, 36)}…` : s;
    }
  }
  return "—";
}

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function orgDetailPath(orgId: string, orgs: OrgAccount[]): string {
  const type = orgs.find((o) => o.id === orgId)?.type;
  if (type === "merchant") return `/platform/merchants/${orgId}`;
  if (type === "agent" || type === "agent_sub") {
    return `/platform/agents/${orgId}`;
  }
  return "/platform/architecture";
}

function fromDateStart(isoDate: string): string | undefined {
  if (!isoDate) return undefined;
  const d = new Date(`${isoDate}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function toDateEnd(isoDate: string): string | undefined {
  if (!isoDate) return undefined;
  const d = new Date(`${isoDate}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadAuditCsv(
  rows: AuditLogEntry[],
  orgNames: Map<string, string>,
  actorEmails: Map<string, string>,
) {
  const header = [
    "createdAt",
    "action",
    "actorUserId",
    "actorEmail",
    "orgId",
    "orgName",
    "role",
    "ip",
    "resource",
    "metadata",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.createdAt,
        row.action,
        row.actorUserId ?? "",
        row.actorUserId ? (actorEmails.get(row.actorUserId) ?? "") : "",
        row.orgId ?? "",
        row.orgId ? (orgNames.get(row.orgId) ?? "") : "",
        metadataRole(row.metadata),
        metadataIp(row.metadata),
        metadataResource(row.metadata),
        JSON.stringify(row.metadata),
      ]
        .map((c) => csvEscape(String(c)))
        .join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cryptogate-audit-${toDateInputValue(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** B14 — Append-only platform audit log. */
export function AuditLogPage() {
  const defaultFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toDateInputValue(d);
  }, []);

  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [orgNames, setOrgNames] = useState<Map<string, string>>(() => {
    const cached = peekPlatformOrgs();
    return cached ? orgNameMap(cached) : new Map();
  });
  const [orgOptions, setOrgOptions] = useState<OrgAccount[]>(
    () => peekPlatformOrgs() ?? [],
  );
  const [actorEmails, setActorEmails] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [action, setAction] = useState("");
  const [orgId, setOrgId] = useState("");
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(() => toDateInputValue(new Date()));
  const [limit, setLimit] = useState<number>(100);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
  const [topbarActionsSlot, setTopbarActionsSlot] = useState<HTMLElement | null>(
    null,
  );

  const dismissToast = useCallback(() => setError(null), []);

  useLayoutEffect(() => {
    setTopbarSlot(document.getElementById("platform-topbar-center"));
    setTopbarActionsSlot(document.getElementById("platform-topbar-actions"));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, orgs] = await Promise.all([
        listAuditLog({
          action: action || undefined,
          orgId: orgId || undefined,
          from: fromDateStart(fromDate),
          to: toDateEnd(toDate),
          limit,
        }),
        getPlatformOrgs(),
      ]);
      setItems(rows);
      setOrgOptions(orgs);
      setOrgNames(orgNameMap(orgs));
      setPage(1);
      setExpandedId(null);

      const platform = orgs.find((o) => o.type === "platform");
      if (platform) {
        try {
          const members = await listOrgUsers(platform.id);
          setActorEmails(new Map(members.map((m) => [m.userId, m.email])));
        } catch {
          /* actor emails stay empty */
        }
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code === "rate_limited"
            ? "Too many requests — wait a moment and retry."
            : err.message
          : "Failed to load audit log",
      );
    } finally {
      setLoading(false);
    }
  }, [action, orgId, fromDate, toDate, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((row) => {
      const org = row.orgId
        ? (orgNames.get(row.orgId) ?? row.orgId).toLowerCase()
        : "";
      const actor = row.actorUserId
        ? (
            actorEmails.get(row.actorUserId) ??
            row.actorUserId
          ).toLowerCase()
        : "";
      const meta = JSON.stringify(row.metadata).toLowerCase();
      return (
        actionLabel(row.action).toLowerCase().includes(q) ||
        row.action.toLowerCase().includes(q) ||
        org.includes(q) ||
        actor.includes(q) ||
        meta.includes(q) ||
        metadataIp(row.metadata).toLowerCase().includes(q) ||
        metadataResource(row.metadata).toLowerCase().includes(q)
      );
    });
  }, [items, query, orgNames, actorEmails]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const orgSelectOptions = useMemo(() => {
    const platform = orgOptions.filter((o) => o.type === "platform");
    const agents = orgOptions
      .filter((o) => o.type === "agent" || o.type === "agent_sub")
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 200);
    const merchants = orgOptions
      .filter((o) => o.type === "merchant")
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 300);
    return [...platform, ...agents, ...merchants];
  }, [orgOptions]);

  return (
    <div className="plat-audit">
      <AuthToast message={error} tone="error" onDismiss={dismissToast} />

      {topbarSlot
        ? createPortal(
            <label className="org-agents__search-wrap plat-audit__search-wrap">
              <span className="org-agents__search-icon" aria-hidden>
                <svg viewBox="0 0 20 20" fill="none" width="14" height="14">
                  <circle
                    cx="8.5"
                    cy="8.5"
                    r="5.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                  <path
                    d="M12.75 12.75 16.5 16.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <input
                className="field-control org-agents__search plat-audit__search"
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search actor, org, action…"
                aria-label="Search audit log"
              />
            </label>,
            topbarSlot,
          )
        : null}

      {topbarActionsSlot
        ? createPortal(
            <div
              className="org-agents__actions plat-audit__topbar-actions"
              aria-label="Audit actions"
            >
              <button
                type="button"
                className="plat-audit__topbar-btn"
                disabled={loading || filtered.length === 0}
                onClick={() =>
                  downloadAuditCsv(filtered, orgNames, actorEmails)
                }
              >
                Export CSV
              </button>
              <button
                type="button"
                className="plat-audit__topbar-btn"
                disabled={loading}
                onClick={() => void load()}
              >
                {loading ? "Loading…" : "Refresh"}
              </button>
            </div>,
            topbarActionsSlot,
          )
        : null}

      <div className="plat-audit__banner" role="note">
        <span className="plat-audit__banner-label">Append-only</span>
        <p>
          Platform audit trail is immutable — no delete or edit. Metadata is
          redacted (secrets never appear). Role and IP show when recorded in
          event metadata.
        </p>
      </div>

      <div className="plat-audit__filters" aria-label="Audit filters">
        <label className="plat-audit__field">
          <span>From</span>
          <input
            className="plat-audit__input"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </label>
        <label className="plat-audit__field">
          <span>To</span>
          <input
            className="plat-audit__input"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </label>
        <label className="plat-audit__field plat-audit__field--wide">
          <span>Action</span>
          <select
            className="plat-audit__input"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="">All actions</option>
            {ACTION_FILTERS.map((a) => (
              <option key={a} value={a}>
                {actionLabel(a)}
              </option>
            ))}
          </select>
        </label>
        <label className="plat-audit__field plat-audit__field--wide">
          <span>Org</span>
          <select
            className="plat-audit__input"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
          >
            <option value="">All orgs</option>
            {orgSelectOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.type})
              </option>
            ))}
          </select>
        </label>
        <label className="plat-audit__field">
          <span>Limit</span>
          <select
            className="plat-audit__input"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            {LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} rows
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="plat-audit__kpis">
        <div className="plat-audit__kpi">
          <p className="plat-audit__kpi-label">Fetched</p>
          <p className="plat-audit__kpi-value">
            {loading ? "…" : items.length.toLocaleString()}
          </p>
          <p className="plat-audit__kpi-copy">Server page (max {limit})</p>
        </div>
        <div className="plat-audit__kpi">
          <p className="plat-audit__kpi-label">Visible</p>
          <p className="plat-audit__kpi-value">
            {loading ? "…" : filtered.length.toLocaleString()}
          </p>
          <p className="plat-audit__kpi-copy">After search filter</p>
        </div>
        <div className="plat-audit__kpi">
          <p className="plat-audit__kpi-label">Range</p>
          <p className="plat-audit__kpi-value plat-audit__kpi-value--sm">
            {fromDate || "—"} → {toDate || "—"}
          </p>
          <p className="plat-audit__kpi-copy">Inclusive local dates</p>
        </div>
      </div>

      <div className="plat-audit__table-wrap">
        {loading ? (
          <div className="plat-audit__pending">
            <PlatformPending
              compact
              title="Loading audit log"
              copy="Fetching append-only platform events."
            />
            <PlatformTableSkeleton columns={7} rows={8} />
          </div>
        ) : null}

        {!loading && filtered.length === 0 ? (
          <div className="plat-audit__empty" role="status">
            <p className="plat-audit__empty-title">No audit events</p>
            <p className="plat-audit__empty-copy">
              {items.length === 0
                ? "Nothing in this date range and filter. Widen the range or clear action/org."
                : "No rows match the search box. Clear search to see fetched events."}
            </p>
          </div>
        ) : null}

        {!loading && filtered.length > 0 ? (
          <table className="plat-audit__table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Role</th>
                <th>Action</th>
                <th>Org / resource</th>
                <th>IP</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((row, index) => {
                const expanded = expandedId === row.id;
                const orgName = row.orgId
                  ? (orgNames.get(row.orgId) ?? shortId(row.orgId))
                  : "—";
                const actorEmail = row.actorUserId
                  ? actorEmails.get(row.actorUserId)
                  : null;
                const resource = metadataResource(row.metadata);
                const hasMeta = Object.keys(row.metadata).length > 0;
                return (
                  <tr
                    key={row.id}
                    className={expanded ? "is-expanded" : undefined}
                    style={{
                      animationDelay: `${Math.min(index, 20) * 30}ms`,
                    }}
                  >
                    <td className="plat-audit__when">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                    <td>
                      <div className="plat-audit__actor">
                        <span className="plat-audit__actor-email">
                          {actorEmail ?? shortId(row.actorUserId)}
                        </span>
                        {actorEmail && row.actorUserId ? (
                          <span className="plat-audit__actor-id">
                            {shortId(row.actorUserId)}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <span className="plat-audit__role">
                        {metadataRole(row.metadata)}
                      </span>
                    </td>
                    <td>
                      <span className="plat-audit__action">
                        {actionLabel(row.action)}
                      </span>
                    </td>
                    <td>
                      <div className="plat-audit__resource">
                        {row.orgId ? (
                          <Link
                            className="plat-audit__org"
                            to={orgDetailPath(row.orgId, orgOptions)}
                          >
                            {orgName}
                          </Link>
                        ) : (
                          <span className="plat-audit__org">{orgName}</span>
                        )}
                        <span className="plat-audit__resource-id">{resource}</span>
                      </div>
                    </td>
                    <td className="plat-audit__ip">{metadataIp(row.metadata)}</td>
                    <td>
                      {hasMeta ? (
                        <button
                          type="button"
                          className={`plat-audit__detail-toggle${
                            expanded ? " is-open" : ""
                          }`}
                          aria-expanded={expanded}
                          onClick={() =>
                            setExpandedId(expanded ? null : row.id)
                          }
                        >
                          {expanded ? "Hide JSON" : "Show JSON"}
                        </button>
                      ) : (
                        <span className="plat-audit__detail-empty">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}

        {!loading &&
        filtered.length > 0 &&
        expandedId &&
        paged.some((r) => r.id === expandedId) ? (
          <div className="plat-audit__json-panel" role="region" aria-label="Event detail">
            <pre>
              {JSON.stringify(
                paged.find((r) => r.id === expandedId)?.metadata ?? {},
                null,
                2,
              )}
            </pre>
          </div>
        ) : null}

        {!loading && filtered.length > 0 ? (
          <OrgListPagination
            page={page}
            pageCount={pageCount}
            total={filtered.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        ) : null}
      </div>

      <p className="plat-audit__footnote">
        B14 · Read-only audit log ·{" "}
        <Link to="/platform/service-bills">Service bills</Link>
        {" · "}
        <Link to="/platform/settings/team">Platform team</Link>
      </p>
    </div>
  );
}
