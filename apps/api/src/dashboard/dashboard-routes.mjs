import { sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { paymentOrderListScope } from "../orgs/role-policy.mjs";
import { cachedDashboard } from "./dashboard-cache.mjs";
import {
  isValidTimeZone,
  parseDashboardRange,
  parseOptionalDateWindow,
} from "./dashboard-range.mjs";
import { dashboardReports } from "./dashboard-reports.mjs";
import { loadCommissionPreview } from "./commission-preview.mjs";
import { isUuid, resolveDashboardScope } from "./dashboard-scope.mjs";
import {
  dashboardKpis,
  dashboardOrgCards,
  dashboardRates,
  dashboardSeries,
} from "./dashboard-store.mjs";

export const SERIES_METRICS = new Set(["volume", "settled", "volumeAsset", "newMerchants", "newAgents"]);
const MAX_ORG_CARDS = 24;

class ScopeError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Shared request prelude: caller, period, optional orgId, cache key.
 */
async function prelude(req, res, url) {
  const caller = await requireCaller(req, res);
  if (!caller) return null;
  const parsed = parseDashboardRange(url.searchParams);
  if (!parsed.ok) {
    sendError(res, parsed.status, parsed.code, parsed.message);
    return null;
  }
  const orgIdRaw = url.searchParams.get("orgId");
  const orgId = orgIdRaw && orgIdRaw.trim() ? orgIdRaw.trim() : null;
  const global = paymentOrderListScope(caller).kind === "all";
  const who = global ? "global" : `u:${caller.userId}`;
  const r = parsed.range;
  return {
    caller,
    range: r,
    orgId,
    fresh: url.searchParams.get("fresh") === "1",
    keyBase: `${who}|${orgId ?? ""}|${r.from}|${r.to}|${r.tz}`,
  };
}

async function scopeOrThrow(caller, orgId) {
  const resolved = await resolveDashboardScope(caller, orgId);
  if (!resolved.ok) throw new ScopeError(resolved.status, resolved.code, resolved.message);
  return resolved.scope;
}

function sendFailure(res, err) {
  if (err instanceof ScopeError) {
    sendError(res, err.status, err.code, err.message);
    return;
  }
  throw err;
}

/**
 * GET /v1/dashboard/kpis?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=Area/City[&orgId=]
 */
export async function handleGetDashboardKpis(req, res, url) {
  const p = await prelude(req, res, url);
  if (!p) return;
  try {
    const body = await cachedDashboard(
      `kpis|${p.keyBase}`,
      async () => dashboardKpis(await scopeOrThrow(p.caller, p.orgId), p.range),
      { fresh: p.fresh },
    );
    sendJson(res, 200, body);
  } catch (err) {
    sendFailure(res, err);
  }
}

/**
 * GET /v1/dashboard/series?from&to&tz[&orgId][&metrics=volume,settled][&asset][&network]
 * The server picks the interval (hour / day / week) from the period length.
 */
export async function handleGetDashboardSeries(req, res, url) {
  const p = await prelude(req, res, url);
  if (!p) return;
  const metricsRaw = url.searchParams.get("metrics") || "volume";
  const metrics = [...new Set(metricsRaw.split(",").map((s) => s.trim()).filter(Boolean))];
  if (metrics.length === 0 || metrics.some((m) => !SERIES_METRICS.has(m))) {
    sendError(
      res,
      400,
      "invalid_request",
      `metrics must be a comma list of: ${[...SERIES_METRICS].join(", ")}`,
    );
    return;
  }
  const asset = (url.searchParams.get("asset") || "").trim() || null;
  const network = (url.searchParams.get("network") || "").trim() || null;
  if ((asset && !/^[A-Za-z0-9_.-]{1,24}$/.test(asset)) || (network && !/^[a-z0-9_-]{1,32}$/.test(network))) {
    sendError(res, 400, "invalid_request", "asset / network are invalid");
    return;
  }
  metrics.sort();
  try {
    const body = await cachedDashboard(
      `series|${p.keyBase}|${metrics.join(",")}|${asset ?? ""}|${network ?? ""}`,
      async () =>
        dashboardSeries(await scopeOrThrow(p.caller, p.orgId), p.range, { metrics, asset, network }),
      { fresh: p.fresh },
    );
    sendJson(res, 200, body);
  } catch (err) {
    sendFailure(res, err);
  }
}

/**
 * GET /v1/dashboard/rates?from&to&tz[&orgId]
 */
export async function handleGetDashboardRates(req, res, url) {
  const p = await prelude(req, res, url);
  if (!p) return;
  try {
    const body = await cachedDashboard(
      `rates|${p.keyBase}`,
      async () => dashboardRates(await scopeOrThrow(p.caller, p.orgId), p.range),
      { fresh: p.fresh },
    );
    sendJson(res, 200, body);
  } catch (err) {
    sendFailure(res, err);
  }
}

/**
 * GET /v1/dashboard/org-cards?from&to&tz&orgIds=a,b[&orgId]
 */
export async function handleGetDashboardOrgCards(req, res, url) {
  const p = await prelude(req, res, url);
  if (!p) return;
  const ids = [
    ...new Set(
      (url.searchParams.get("orgIds") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  if (ids.length === 0 || ids.length > MAX_ORG_CARDS || ids.some((id) => !isUuid(id))) {
    sendError(res, 400, "invalid_request", `orgIds must list 1–${MAX_ORG_CARDS} org UUIDs`);
    return;
  }
  ids.sort();
  try {
    const body = await cachedDashboard(
      `orgcards|${p.keyBase}|${ids.join(",")}`,
      async () => dashboardOrgCards(await scopeOrThrow(p.caller, p.orgId), p.range, ids),
      { fresh: p.fresh },
    );
    sendJson(res, 200, body);
  } catch (err) {
    sendFailure(res, err);
  }
}

/**
 * GET /v1/dashboard/reports?tz[&from&to][&orgId] — grouped order totals
 * (status, asset, org, day, creator, matching mode). No from/to = all time.
 */
export async function handleGetDashboardReports(req, res, url) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  const win = parseOptionalDateWindow(url.searchParams);
  if (!win.ok) {
    sendError(res, 400, "invalid_request", win.message);
    return;
  }
  const tz = url.searchParams.get("tz")?.trim() || "UTC";
  if (!isValidTimeZone(tz)) {
    sendError(res, 400, "invalid_request", "Invalid tz");
    return;
  }
  const orgIdRaw = url.searchParams.get("orgId");
  const orgId = orgIdRaw && orgIdRaw.trim() ? orgIdRaw.trim() : null;
  if (orgId && !isUuid(orgId)) {
    sendError(res, 400, "invalid_request", "orgId must be a UUID");
    return;
  }
  const global = paymentOrderListScope(caller).kind === "all";
  const who = global ? "global" : `u:${caller.userId}`;
  const w = win.window;
  try {
    const body = await cachedDashboard(
      `reports|${who}|${orgId ?? ""}|${w?.from ?? ""}|${w?.to ?? ""}|${tz}`,
      async () => dashboardReports(await scopeOrThrow(caller, orgId), w, tz),
      { fresh: url.searchParams.get("fresh") === "1" },
    );
    sendJson(res, 200, body);
  } catch (err) {
    sendFailure(res, err);
  }
}

/**
 * GET /v1/dashboard/commission-preview?orgId=<agent> — current UTC month commission by merchant.
 * Agent members (and platform operators) only; the invoice is issued on day C of next month.
 */
export async function handleGetDashboardCommissionPreview(req, res, url) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  const orgId = url.searchParams.get("orgId")?.trim() ?? "";
  if (!isUuid(orgId)) {
    sendError(res, 400, "invalid_request", "orgId must be an agent UUID");
    return;
  }
  try {
    const scope = await scopeOrThrow(caller, orgId);
    if (scope.kind !== "agent" || scope.commission?.payeeOrgId !== orgId) {
      sendError(res, 403, "forbidden", "Commission is visible to agent members only");
      return;
    }
    const payload = await cachedDashboard(
      `commission-preview|${orgId}`,
      () => loadCommissionPreview(orgId),
      { fresh: url.searchParams.get("fresh") === "1" },
    );
    sendJson(res, 200, payload);
  } catch (err) {
    sendFailure(res, err);
  }
}
