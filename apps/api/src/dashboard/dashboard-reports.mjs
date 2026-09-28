import { getPool } from "../db/pool.mjs";
import { appendPaymentOrderScope } from "../orders/order-scope-sql.mjs";
import { safeNumericSql } from "./dashboard-range.mjs";
import { windowInstants } from "./dashboard-store.mjs";

const SETTLED = ["completed", "confirmed"];
const ORDER_USD = safeNumericSql("COALESCE(o.invoice_amount_usd, o.payable_amount)");
const DAY_ROWS = 14;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Grouped order totals for the Reports page — one scan with GROUPING SETS.
 * Volume = settled (completed / confirmed) invoice USD.
 * @param {import("./dashboard-scope.mjs").DashboardScope} scope
 * @param {{ from: string, to: string, tz: string } | null} window null = all time
 * @param {string} tz viewer time zone for the By day table
 */
export async function dashboardReports(scope, window, tz) {
  const empty = {
    totals: { orders: 0, settledVolumeUsd: 0, anomalies: 0 },
    byStatus: [],
    byAsset: [],
    byOrg: [],
    byDay: [],
    byCreator: [],
    byMode: [],
    byChannel: [],
  };
  const pool = getPool();
  const params = [SETTLED, tz];
  let timeClause = "";
  if (window) {
    const { lo, hi } = await windowInstants(window.from, window.to, window.tz);
    params.push(lo, hi);
    timeClause = `AND o.created_at >= $3::timestamptz AND o.created_at < $4::timestamptz`;
  }
  const sc = appendPaymentOrderScope(scope.orderFilter, params);
  if (sc.empty) return empty;

  const { rows } = await pool.query(
    `WITH f AS (
       SELECT o.status, o.asset, o.network, o.org_id, o.created_by, o.matching_mode, o.created_via,
              to_char((o.created_at AT TIME ZONE $2::text)::date, 'YYYY-MM-DD') AS day,
              CASE WHEN o.status = ANY($1::text[]) THEN ${ORDER_USD} ELSE 0 END AS vol
       FROM payment_orders o
       WHERE true ${timeClause} ${sc.clause}
     )
     SELECT GROUPING(f.status) AS g_status,
            GROUPING(f.asset) AS g_asset,
            GROUPING(f.org_id) AS g_org,
            GROUPING(f.created_by) AS g_creator,
            GROUPING(f.matching_mode) AS g_mode,
            GROUPING(f.day) AS g_day,
            GROUPING(f.created_via) AS g_via,
            f.status, f.asset, f.network, f.org_id, f.created_by, f.matching_mode, f.day,
            f.created_via,
            count(*) AS n,
            COALESCE(sum(f.vol), 0) AS vol
     FROM f
     GROUP BY GROUPING SETS (
       (f.status), (f.asset, f.network), (f.org_id), (f.created_by),
       (f.matching_mode), (f.day), (f.created_via), ()
     )`,
    params,
  );

  const out = structuredClone(empty);
  for (const r of rows) {
    const count = Number(r.n) || 0;
    const volumeUsd = round2(r.vol);
    if (r.g_status === 0) out.byStatus.push({ status: r.status, count, volumeUsd });
    else if (r.g_asset === 0) out.byAsset.push({ asset: r.asset, network: r.network, count, volumeUsd });
    else if (r.g_org === 0) out.byOrg.push({ orgId: r.org_id, orgName: null, count, volumeUsd });
    else if (r.g_creator === 0) out.byCreator.push({ userId: r.created_by, email: null, count, volumeUsd });
    else if (r.g_mode === 0) out.byMode.push({ mode: r.matching_mode, count });
    else if (r.g_day === 0) out.byDay.push({ day: r.day, count, volumeUsd });
    else if (r.g_via === 0) out.byChannel.push({ channel: r.created_via ?? null, count, volumeUsd });
    else {
      out.totals.orders = count;
      out.totals.settledVolumeUsd = volumeUsd;
    }
  }
  out.totals.anomalies = out.byStatus.find((s) => s.status === "payment_anomaly")?.count ?? 0;

  const orgIds = out.byOrg.map((r) => r.orgId).filter(Boolean);
  const userIds = out.byCreator.map((r) => r.userId).filter(Boolean);
  const [orgNames, emails] = await Promise.all([
    orgIds.length
      ? pool.query(`SELECT id, name FROM org_accounts WHERE id = ANY($1::uuid[])`, [orgIds])
      : { rows: [] },
    userIds.length
      ? pool.query(`SELECT id, email FROM users WHERE id = ANY($1::uuid[])`, [userIds])
      : { rows: [] },
  ]);
  const nameById = new Map(orgNames.rows.map((r) => [r.id, r.name]));
  const emailById = new Map(emails.rows.map((r) => [r.id, r.email]));
  for (const r of out.byOrg) r.orgName = nameById.get(r.orgId) ?? null;
  for (const r of out.byCreator) r.email = emailById.get(r.userId) ?? null;

  out.byStatus.sort((a, b) => b.count - a.count);
  out.byAsset.sort((a, b) => b.volumeUsd - a.volumeUsd);
  out.byOrg.sort((a, b) => b.volumeUsd - a.volumeUsd);
  out.byCreator.sort((a, b) => b.count - a.count);
  out.byMode.sort((a, b) => String(a.mode).localeCompare(String(b.mode)));
  out.byChannel.sort((a, b) => b.count - a.count);
  out.byDay.sort((a, b) => b.day.localeCompare(a.day));
  out.byDay = out.byDay.slice(0, DAY_ROWS);
  return out;
}
