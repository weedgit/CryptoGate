import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { AuditAction } from "@paymentgate/domain";
import { AuthToast } from "../auth/AuthToast";
import { DefaultUserAvatar } from "../auth/DefaultUserAvatar";
import {
  addDaysYmd,
  formatViewerDateTime,
  zonedEndOfDay,
  zonedStartOfDay,
  zoneAbbrev,
  zonedYmd,
} from "../shared/dateTime";
import { useViewerTimeZone } from "../shared/useViewerTimeZone";
import {
  ApiError,
  getPlatformOrgs,
  peekPlatformOrgs,
  type AuditLogEntry,
  type OrgAccount,
} from "./api";
import {
  PlatformPending,
  PlatformTableSkeleton,
} from "./ui/PlatformPending";
import { OrgListPagination } from "./OrgListPagination";
import { platformRoute } from "../shared/portalRouting";
import {
  auditResourceLabel,
  summarizeAuditMetadata,
} from "../shared/auditDetailFormat";
import {
  downloadAuditLogCsv,
  listAuditLogServer,
  peekAuditLogServer,
  type AuditListParams,
} from "../shared/auditServer";
import type { ServerPage } from "../shared/serverListApi";
import { useDebouncedValue } from "../shared/useDebouncedValue";
import { usePageRefresh } from "../shared/pageRefresh";

const PAGE_SIZE = 10;

const ACTION_LABEL: Record<string, string> = {
  login: "Signed in",
  logout: "Signed out",
  mfa_enroll: "Started MFA setup",
  mfa_verify_enroll: "MFA setup confirmed",
  mfa_verify_login: "Signed in with MFA",
  mfa_reset: "Authenticator reset",
  org_create: "Organization created",
  org_status: "Organization status changed",
  org_profile: "Organization profile updated",
  org_delete: "Organization deleted",
  org_user_invite: "Team member invited",
  org_user_role: "Role changed",
  org_user_pause: "Member paused",
  org_user_resume: "Member resumed",
  org_user_remove: "Member removed",
  settlement_put: "Settlement address updated",
  matching_mode_put: "Matching mode updated",
  fulfillment_policy_put: "Fulfillment policy updated",
  pos_settings_put: "POS settings updated",
  xpub_put: "xPub updated",
  webhook_register: "Webhook registered",
  webhook_delete: "Webhook deleted",
  webhook_resend: "Webhook resent",
  webhook_rotate_secret: "Webhook secret rotated",
  service_bill_issue: "Service bill issued",
  service_bill_send: "Service bill sent",
  service_bill_waive: "Service bill waived",
  service_bill_cancel: "Service bill cancelled",
  service_bill_mark_paid: "Bill marked paid",
  service_bill_void: "Bill cancelled",
  service_bill_adjust: "Bill adjusted",
  service_bill_grant_credit: "Credit granted",
  service_bill_daily_auto: "Service bills auto-created",
  api_key_create: "API key created",
  api_key_revoke: "API key revoked",
  api_key_rotate: "API key rotated",
  notification_prefs_put: "Notification prefs saved",
  fee_tier_put: "Fee tiers saved",
  org_policy_put: "Org policy saved",
  billing_wallet_put: "Billing wallet updated",
  merchant_commercial_put: "Merchant commercial updated",
  agent_payout_put: "Agent payout updated",
  agent_commission_put: "Agent commission updated",
  commission_payout_upsert: "Commission payout prepared",
  commission_payout_mark_paid: "Commission payout marked paid",
  commission_payout_mark_paid_batch: "Commission payouts marked paid",
  commission_payout_generate: "Commission invoices generated",
  commission_payout_auto: "Commission invoices auto-created",
  commission_payout_confirm_sent: "Commission payout confirm sent",
  commission_payout_agent_confirm: "Agent confirmed commission payout",
  contact_email_otp_send: "Email code sent",
  contact_email_verified: "Email verified",
  contact_phone_otp_send: "Phone code sent",
  contact_phone_verified: "Phone verified",
  contact_verification_override: "Verification overridden",
  profile_update: "Profile updated",
  billing_calendar_put: "Billing calendar saved",
  billing_waiver_put: "Billing waiver set",
  billing_waiver_delete: "Billing waiver removed",
  password_reset_request: "Password reset requested",
  password_reset_complete: "Password reset completed",
  pos_pin_set: "POS PIN set",
  pos_pin_clear: "POS PIN cleared",
  pos_pin_verify: "POS PIN verified",
  pos_pin_admin_set: "POS PIN set by admin",
  pos_pin_admin_clear: "POS PIN cleared by admin",
  pos_pin_generated: "POS PIN generated",
  pos_terminal_bound: "POS terminal bound",
  pos_terminal_unbound: "POS terminal unbound",
  pos_terminal_revoked: "POS terminal revoked",
  pos_unlock_success: "POS unlocked",
  pos_unlock_failed: "POS unlock failed",
  pos_unlock_alert: "POS wrong-PIN alert",
  pos_lock: "POS locked",
  network_maintenance_put: "Network maintenance updated",
  network_rail_settings_put: "Network rail settings updated",
  merchant_network_rail_settings_put: "Merchant rail settings updated",
  platform_org_rail_settings_put: "Platform org rail settings updated",
  platform_site_rail_settings_put: "Site rail settings updated",
  compliance_override: "Compliance override",
  site_override_request: "Site override requested",
  site_override_decide: "Site override decided",
};

const ACTION_FILTERS = Object.values(AuditAction).sort();

function actionLabel(action: string): string {
  if (ACTION_LABEL[action]) return ACTION_LABEL[action];
  return action
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Action codes whose label or code contains the search text. */
function actionsMatchingLabel(q: string): string[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return ACTION_FILTERS.filter(
    (a) => actionLabel(a).toLowerCase().includes(needle),
  ).slice(0, 100);
}

function orgNameMap(orgs: OrgAccount[]): Map<string, string> {
  return new Map(orgs.map((o) => [o.id, o.name]));
}

function shortId(id: string | null | undefined): string {
  if (!id) return "—";
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function actorLabel(row: AuditLogEntry): string {
  return (
    row.actorDisplayName?.trim() ||
    row.actorEmail?.trim() ||
    (row.actorUserId ? shortId(row.actorUserId) : "—")
  );
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
  return auditResourceLabel(metadata);
}

function toDateInputValue(d: Date): string {
  return zonedYmd(d);
}

function orgDetailPath(orgId: string, orgs: OrgAccount[]): string {
  const type = orgs.find((o) => o.id === orgId)?.type;
  if (type === "merchant" || type === "agent") {
    return platformRoute(`accounts/${type === "merchant" ? "merchants" : "agents"}/${orgId}`);
  }
  return platformRoute("accounts");
}

function fromDateStart(isoDate: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return undefined;
  return zonedStartOfDay(isoDate).toISOString();
}

function toDateEnd(isoDate: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return undefined;
  return zonedEndOfDay(isoDate).toISOString();
}

/** B14 — Append-only platform audit log. */
export function AuditLogPage() {
  const viewerTz = useViewerTimeZone();
  const defaultFrom = useMemo(() => addDaysYmd(zonedYmd(), -30), []);

  const [orgNames, setOrgNames] = useState<Map<string, string>>(() => {
    const cached = peekPlatformOrgs();
    return cached ? orgNameMap(cached) : new Map();
  });
  const [orgOptions, setOrgOptions] = useState<OrgAccount[]>(
    () => peekPlatformOrgs() ?? [],
  );
  const [action, setAction] = useState("");
  const [orgId, setOrgId] = useState("");
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(() => toDateInputValue(new Date()));
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);

  const dismissToast = useCallback(() => setError(null), []);

  useLayoutEffect(() => {
    setTopbarSlot(document.getElementById("platform-topbar-center"));
  }, []);

  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const filterKey = `${action}|${orgId}|${fromDate}|${toDate}|${debouncedQuery}`;
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const setPage = useCallback(
    (next: number) => setPageState({ key: filterKey, page: next }),
    [filterKey],
  );

  const filterParams = useMemo<Omit<AuditListParams, "limit" | "offset">>(
    () => ({
      action: action || undefined,
      orgId: orgId || undefined,
      from: fromDateStart(fromDate),
      to: toDateEnd(toDate),
      q: debouncedQuery || undefined,
      qActions: actionsMatchingLabel(debouncedQuery),
    }),
    // viewerTz: day bounds are computed in the viewer's zone
    [action, orgId, fromDate, toDate, debouncedQuery, viewerTz],
  );
  const listParams = useMemo<AuditListParams>(
    () => ({ ...filterParams, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    [filterParams, page],
  );

  const [pageData, setPageData] = useState<ServerPage<AuditLogEntry> | null>(
    () => peekAuditLogServer(listParams),
  );
  const [fetching, setFetching] = useState(false);
  const listSeq = useRef(0);

  const reportError = useCallback((err: unknown, fallback: string) => {
    setError(
      err instanceof ApiError
        ? err.code === "rate_limited"
          ? "Too many requests — wait a moment and retry."
          : err.message
        : fallback,
    );
  }, []);

  const loadList = useCallback(
    async (params: AuditListParams) => {
      const seq = ++listSeq.current;
      const cached = peekAuditLogServer(params);
      if (cached) setPageData(cached);
      setFetching(true);
      try {
        const result = await listAuditLogServer(params);
        if (seq === listSeq.current) setPageData(result);
      } catch (err) {
        if (seq === listSeq.current) reportError(err, "Failed to load audit log");
      } finally {
        if (seq === listSeq.current) setFetching(false);
      }
    },
    [reportError],
  );

  const loadOrgs = useCallback(async () => {
    try {
      const orgs = await getPlatformOrgs();
      setOrgOptions(orgs);
      setOrgNames(orgNameMap(orgs));
    } catch {
      /* names fall back to ids */
    }
  }, []);

  useEffect(() => {
    void loadList(listParams);
  }, [loadList, listParams]);

  useEffect(() => {
    void loadOrgs();
  }, [loadOrgs]);

  useEffect(() => {
    setExpandedId(null);
  }, [listParams]);

  const load = useCallback(async () => {
    setError(null);
    await Promise.all([loadList(listParams), loadOrgs()]);
  }, [loadList, loadOrgs, listParams]);
  usePageRefresh(load);

  const loading = pageData == null;
  const paged = pageData?.items ?? [];
  const total = pageData?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    if (pageData && page > pageCount) setPage(pageCount);
  }, [pageData, page, pageCount, setPage]);

  const exportCsv = useCallback(async () => {
    setExporting(true);
    setError(null);
    try {
      const blob = await downloadAuditLogCsv(filterParams);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `paymentgate-audit-${toDateInputValue(new Date())}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      reportError(err, "Failed to export audit log");
    } finally {
      setExporting(false);
    }
  }, [filterParams, reportError]);

  const orgSelectOptions = useMemo(() => {
    const platform = orgOptions.filter((o) => o.type === "platform");
    const agents = orgOptions
      .filter((o) => o.type === "agent")
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 200);
    const merchants = orgOptions
      .filter((o) => o.type === "merchant")
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 300);
    return [...platform, ...agents, ...merchants];
  }, [orgOptions]);

  return (
    <div className="plat-audit plat-bills">
      <AuthToast message={error} tone="error" onDismiss={dismissToast} />

      <div className="plat-bills__period-bar">
        <div className="plat-bills__intro">
          <span className="plat-bills__intro-icon" aria-hidden>
            <svg
              viewBox="0 0 24 24"
              width="36"
              height="36"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
              <path d="M8 13h8M8 17h5" />
            </svg>
          </span>
          <div className="plat-bills__intro-copy">
            <h1 className="plat-bills__intro-title">Audit</h1>
            <p className="plat-bills__intro-sub">
              Platform activity log — who did what, and when.
            </p>
          </div>
        </div>
        <div className="plat-bills__period-tools">
          <button
            type="button"
            className="btn-primary plat-bills__action-btn plat-audit__export-cta"
            disabled={loading || exporting || total === 0}
            onClick={() => void exportCsv()}
          >
            <span className="plat-audit__export-cta-icon" aria-hidden>
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                <path
                  d="M8 2.5v7.2M8 9.7 5.2 6.9M8 9.7l2.8-2.8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M3 12.5h10"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            Export CSV
          </button>
        </div>
      </div>

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
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search actor, org, action…"
                aria-label="Search audit log"
              />
            </label>,
            topbarSlot,
          )
        : null}

      <div className="plat-audit__filters" aria-label="Audit filters">
        <label className="plat-audit__field">
          <span>From ({zoneAbbrev(viewerTz)})</span>
          <span className="plat-audit__date-wrap">
            <input
              className="plat-audit__input plat-audit__input--date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
            <span className="plat-audit__date-icon" aria-hidden>
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                <rect
                  x="2"
                  y="3.5"
                  width="12"
                  height="10.5"
                  rx="1.5"
                  stroke="currentColor"
                  strokeWidth="1.25"
                />
                <path
                  d="M5 2v2.5M11 2v2.5M2 7h12"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </span>
        </label>
        <label className="plat-audit__field">
          <span>To ({zoneAbbrev(viewerTz)})</span>
          <span className="plat-audit__date-wrap">
            <input
              className="plat-audit__input plat-audit__input--date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
            <span className="plat-audit__date-icon" aria-hidden>
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                <rect
                  x="2"
                  y="3.5"
                  width="12"
                  height="10.5"
                  rx="1.5"
                  stroke="currentColor"
                  strokeWidth="1.25"
                />
                <path
                  d="M5 2v2.5M11 2v2.5M2 7h12"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </span>
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
      </div>

      <div className="plat-audit__table-wrap">
        {loading ? (
          <div className="plat-audit__pending">
            <PlatformPending
              compact
              title="Loading audit"
              copy="Fetching platform activity."
            />
            <PlatformTableSkeleton columns={7} rows={8} />
          </div>
        ) : null}

        {!loading && total === 0 ? (
          <div className="plat-audit__empty" role="status">
            <p className="plat-audit__empty-title">No audit events</p>
            <p className="plat-audit__empty-copy">
              {debouncedQuery
                ? `Nothing matched “${debouncedQuery}” in this date range and filter.`
                : "Nothing in this date range and filter. Widen the range or clear action/org."}
            </p>
          </div>
        ) : null}

        {!loading && total > 0 ? (
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
                const actorEmail = actorLabel(row);
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
                      {formatViewerDateTime(row.createdAt)}
                    </td>
                    <td>
                      <div className="plat-audit__actor">
                        <span
                          className={`plat-audit__actor-avatar${
                            row.actorAvatarUrl ? "" : " is-default"
                          }`}
                          aria-hidden
                        >
                          {row.actorAvatarUrl ? (
                            <img src={row.actorAvatarUrl} alt="" />
                          ) : (
                            <DefaultUserAvatar />
                          )}
                        </span>
                        <div className="plat-audit__actor-copy">
                          <span className="plat-audit__actor-email">
                            {actorEmail}
                          </span>
                          {row.actorUserId &&
                          (row.actorEmail || row.actorDisplayName) ? (
                            <span className="plat-audit__actor-id">
                              {shortId(row.actorUserId)}
                            </span>
                          ) : null}
                        </div>
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
                          {expanded ? "Hide detail" : "Show detail"}
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
        expandedId &&
        paged.some((r) => r.id === expandedId) ? (
          (() => {
            const row = paged.find((r) => r.id === expandedId);
            if (!row) return null;
            const detail = summarizeAuditMetadata(row.action, row.metadata);
            return (
              <div
                className="plat-audit__json-panel"
                role="region"
                aria-label="Event detail"
              >
                <p className="plat-audit__detail-headline">{detail.headline}</p>
                {detail.lines.length > 0 ? (
                  <ul className="plat-audit__detail-lines">
                    {detail.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
                {Object.keys(row.metadata).length > 0 ? (
                  <details className="plat-audit__detail-raw">
                    <summary>Technical details</summary>
                    <pre>{JSON.stringify(row.metadata, null, 2)}</pre>
                  </details>
                ) : null}
              </div>
            );
          })()
        ) : null}

        {!loading && total > 0 ? (
          <OrgListPagination
            page={page}
            pageCount={pageCount}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        ) : null}
      </div>
    </div>
  );
}
