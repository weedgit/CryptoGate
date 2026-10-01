import { getPool } from "../db/pool.mjs";
import { appendPaymentOrderScope } from "../orders/order-scope-sql.mjs";
import {
  bucketKeySql,
  bucketKeys,
  fillSeries,
  monthKeysForRange,
  percentChange,
  safeNumericSql,
} from "./dashboard-range.mjs";
import { childrenMap, subtreeOf } from "./dashboard-scope.mjs";
import { cachedDashboard } from "./dashboard-cache.mjs";

const SETTLED = ["completed", "confirmed"];
const ORDER_USD = safeNumericSql("COALESCE(o.invoice_amount_usd, o.payable_amount)");
const ORDER_ASSET = safeNumericSql("COALESCE(NULLIF(o.received_amount, ''), o.payable_amount)");
const BILL_FEE = `GREATEST(${safeNumericSql("b.subscription_amount")} + ${safeNumericSql("b.volume_fee_amount")}, 0)`;

/**
 * Window instants for local calendar dates in a tz: [lo, hi).
 * @param {string} from
 * @param {string} to
 * @param {string} tz
 * @returns {Promise<{ lo: string, hi: string }>}
 */
export async function windowInstants(from, to, tz) {
  const { rows } = await getPool().query(
    `SELECT ($1::date::timestamp AT TIME ZONE $3) AS lo,
            (($2::date + 1)::timestamp AT TIME ZONE $3) AS hi`,
    [from, to, tz],
  );
  const toIso = (v) => (v instanceof Date ? v.toISOString() : String(v));
  return { lo: toIso(rows[0].lo), hi: toIso(rows[0].hi) };
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const MARKET_RATES_TTL_MS = 5 * 60_000;

/**
 * @param {import("./dashboard-scope.mjs").DashboardScope} scope
 * @param {import("./dashboard-range.mjs").DashboardRange} range
 */
export async function dashboardKpis(scope, range) {
  const pool = getPool();
  const [cur, prev] = await Promise.all([
    windowInstants(range.from, range.to, range.tz),
    windowInstants(range.prevFrom, range.prevTo, range.tz),
  ]);

  const orders = await orderKpis(pool, scope, cur, prev);
  const [bills, commissions, accounts, live, periodByOrg] = await Promise.all([
    billKpis(pool, scope, range, cur),
    commissionKpis(pool, scope, range),
    accountKpis(pool, scope, cur),
    liveOrderKpis(pool, scope),
    scope.kind === "merchant" ? periodOrdersByOrg(pool, scope, cur) : Promise.resolve([]),
  ]);
  if (scope.kind === "merchant") {
    const rows = new Map(live.byOrg.map((r) => [r.orgId, { ...r, orders: 0, volumeUsd: 0 }]));
    for (const p of periodByOrg) {
      const row = rows.get(p.orgId) ?? { orgId: p.orgId, open: 0, anomalies: 0, orders: 0, volumeUsd: 0 };
      row.orders = p.orders;
      row.volumeUsd = p.volumeUsd;
      rows.set(p.orgId, row);
    }
    live.byOrg = [...rows.values()];
  }

  return {
    range,
    orders: {
      ...orders,
      ...live.totals,
      volumeTrend: percentChange(orders.volumeUsd, orders.prevVolumeUsd),
      settledTrend: percentChange(orders.settled, orders.prevSettled),
      successRate: orders.total > 0 ? Math.round((orders.settled / orders.total) * 1000) / 10 : null,
    },
    byOrg: scope.kind === "merchant" ? live.byOrg : undefined,
    bills,
    commissions,
    accounts,
  };
}

async function orderKpis(pool, scope, cur, prev) {
  const params = [cur.lo, cur.hi, prev.lo, SETTLED];
  const sc = appendPaymentOrderScope(scope.orderFilter, params);
  if (sc.empty) {
    return { total: 0, settled: 0, volumeUsd: 0, prevSettled: 0, prevVolumeUsd: 0 };
  }
  const { rows } = await pool.query(
    `SELECT
       count(*) FILTER (WHERE o.created_at >= $1) AS total,
       count(*) FILTER (WHERE o.created_at >= $1 AND o.status = ANY($4::text[])) AS settled,
       COALESCE(sum(${ORDER_USD}) FILTER (WHERE o.created_at >= $1 AND o.status = ANY($4::text[])), 0) AS volume,
       count(*) FILTER (WHERE o.created_at < $1 AND o.status = ANY($4::text[])) AS prev_settled,
       COALESCE(sum(${ORDER_USD}) FILTER (WHERE o.created_at < $1 AND o.status = ANY($4::text[])), 0) AS prev_volume
     FROM payment_orders o
     WHERE o.created_at >= $3::timestamptz AND o.created_at < $2::timestamptz
       ${sc.clause}`,
    params,
  );
  const r = rows[0] ?? {};
  return {
    total: Number(r.total) || 0,
    settled: Number(r.settled) || 0,
    volumeUsd: round2(r.volume),
    prevSettled: Number(r.prev_settled) || 0,
    prevVolumeUsd: round2(r.prev_volume),
  };
}

/** Orders created in the window per merchant / site (merchant dashboard Sites table). */
async function periodOrdersByOrg(pool, scope, cur) {
  const params = [cur.lo, cur.hi, SETTLED];
  const sc = appendPaymentOrderScope(scope.orderFilter, params);
  if (sc.empty) return [];
  const { rows } = await pool.query(
    `SELECT o.org_id,
       count(*) AS orders,
       COALESCE(sum(${ORDER_USD}) FILTER (WHERE o.status = ANY($3::text[])), 0) AS volume
     FROM payment_orders o
     WHERE o.created_at >= $1::timestamptz AND o.created_at < $2::timestamptz
       ${sc.clause}
     GROUP BY o.org_id`,
    params,
  );
  return rows.map((r) => ({
    orgId: r.org_id,
    orders: Number(r.orders) || 0,
    volumeUsd: round2(r.volume),
  }));
}

/** Live queue counts (not period-scoped) + per-site rows for merchant dashboards. */
async function liveOrderKpis(pool, scope) {
  const params = [];
  const sc = appendPaymentOrderScope(scope.orderFilter, params);
  const empty = { totals: { open: 0, anomalies: 0, expiringSoon: 0 }, byOrg: [] };
  if (sc.empty) return empty;
  const { rows } = await pool.query(
    `SELECT o.org_id,
       count(*) FILTER (WHERE o.status IN ('pending_payment', 'verifying')) AS open,
       count(*) FILTER (WHERE o.status = 'payment_anomaly') AS anomalies,
       count(*) FILTER (
         WHERE o.status = 'pending_payment'
           AND o.expires_at > now()
           AND o.expires_at < now() + interval '30 minutes'
       ) AS expiring
     FROM payment_orders o
     WHERE o.status IN ('pending_payment', 'verifying', 'payment_anomaly')
       ${sc.clause}
     GROUP BY o.org_id`,
    params,
  );
  const totals = { open: 0, anomalies: 0, expiringSoon: 0 };
  const byOrg = [];
  for (const r of rows) {
    const row = {
      orgId: r.org_id,
      open: Number(r.open) || 0,
      anomalies: Number(r.anomalies) || 0,
    };
    totals.open += row.open;
    totals.anomalies += row.anomalies;
    totals.expiringSoon += Number(r.expiring) || 0;
    byOrg.push(row);
  }
  return { totals, byOrg };
}

async function billKpis(pool, scope, range, cur) {
  const empty = {
    issued: 0,
    paid: 0,
    overdue: 0,
    feesBilled: 0,
    feesCollected: 0,
    open: 0,
    overdueOpen: 0,
  };
  if (scope.billOrgIds && scope.billOrgIds.length === 0) return empty;
  const params = [cur.lo, cur.hi, range.from, range.to];
  let scopeSql = "";
  if (scope.billOrgIds) {
    params.push(scope.billOrgIds);
    scopeSql = `AND b.org_id = ANY($${params.length}::uuid[])`;
  }
  const inPeriod = `(
    (b.created_at >= $1 AND b.created_at < $2)
    OR (b.due_at >= $1 AND b.due_at < $2)
    OR (b.period_start <= $4::date AND b.period_end >= $3::date)
  )`;
  const paidInWindow = `(b.status = 'paid' AND COALESCE(b.paid_at, b.due_at) >= $1 AND COALESCE(b.paid_at, b.due_at) < $2)`;
  const live = `b.status NOT IN ('waived', 'cancelled')`;
  const { rows } = await pool.query(
    `SELECT
       count(*) FILTER (WHERE ${live} AND ${inPeriod}) AS issued,
       count(*) FILTER (WHERE ${paidInWindow}) AS paid,
       count(*) FILTER (WHERE b.status = 'overdue' AND ${inPeriod}) AS overdue,
       COALESCE(sum(${BILL_FEE}) FILTER (WHERE ${live} AND ${inPeriod}), 0) AS fees_billed,
       COALESCE(sum(${BILL_FEE}) FILTER (WHERE ${paidInWindow}), 0) AS fees_collected,
       count(*) FILTER (WHERE b.status IN ('issued', 'overdue')) AS open,
       count(*) FILTER (WHERE b.status = 'overdue') AS overdue_open
     FROM service_bills b
     WHERE (
         b.status IN ('issued', 'overdue')
         OR b.created_at >= $1
         OR b.due_at >= $1
         OR b.paid_at >= $1
         OR b.period_end >= $3::date
       )
       ${scopeSql}`,
    params,
  );
  const r = rows[0] ?? {};
  return {
    issued: Number(r.issued) || 0,
    paid: Number(r.paid) || 0,
    overdue: Number(r.overdue) || 0,
    feesBilled: round2(r.fees_billed),
    feesCollected: round2(r.fees_collected),
    open: Number(r.open) || 0,
    overdueOpen: Number(r.overdue_open) || 0,
  };
}

async function commissionKpis(pool, scope, range) {
  if (!scope.commission) return null;
  const params = [monthKeysForRange(range.from, range.to)];
  let payeeSql = "";
  if (scope.commission.payeeOrgId) {
    params.push(scope.commission.payeeOrgId);
    payeeSql = `AND payee_org_id = $2::uuid`;
  }
  const amount = safeNumericSql("commission_amount::text");
  const { rows } = await pool.query(
    `SELECT
       COALESCE(sum(${amount}) FILTER (WHERE payout_status = 'issued'), 0) AS owed,
       COALESCE(sum(${amount}) FILTER (WHERE payout_status IN ('paid', 'settled')), 0) AS paid
     FROM commission_payouts
     WHERE payer = 'platform' AND period_key = ANY($1::text[]) ${payeeSql}`,
    params,
  );
  return { owed: round2(rows[0]?.owed), paid: round2(rows[0]?.paid) };
}

/** Totals / active (had orders in window, incl. subtree) / paused / new, per account type. */
async function accountKpis(pool, scope, cur) {
  const params = [cur.lo, cur.hi];
  const sc = appendPaymentOrderScope(scope.orderFilter, params);
  /** @type {Set<string>} */
  const activeLeaves = new Set();
  if (!sc.empty) {
    const { rows } = await pool.query(
      `SELECT DISTINCT o.org_id FROM payment_orders o
       WHERE o.created_at >= $1::timestamptz AND o.created_at < $2::timestamptz ${sc.clause}`,
      params,
    );
    for (const r of rows) activeLeaves.add(r.org_id);
  }
  const children = childrenMap(scope.orgs);
  const loMs = Date.parse(cur.lo);
  const hiMs = Date.parse(cur.hi);
  const slice = (types) => {
    let total = 0;
    let active = 0;
    let paused = 0;
    let created = 0;
    for (const org of scope.orgs) {
      if (!types.includes(org.type)) continue;
      if (scope.rootOrgId && org.id === scope.rootOrgId) continue;
      total += 1;
      const createdMs = Date.parse(
        org.created_at instanceof Date ? org.created_at.toISOString() : String(org.created_at),
      );
      if (createdMs >= loMs && createdMs < hiMs) created += 1;
      if (org.status === "paused") {
        paused += 1;
        continue;
      }
      for (const id of subtreeOf(org.id, children)) {
        if (activeLeaves.has(id)) {
          active += 1;
          break;
        }
      }
    }
    return { total, active, paused, new: created };
  };
  return {
    merchants: slice(["merchant", "merchant_site"]),
    agents: scope.kind === "platform" ? slice(["agent"]) : null,
  };
}

/**
 * Chart series. Volume/settled come from payment orders; newMerchants/newAgents from org rows.
 * @param {import("./dashboard-scope.mjs").DashboardScope} scope
 * @param {import("./dashboard-range.mjs").DashboardRange} range
 * @param {{ metrics: string[], asset?: string | null, network?: string | null }} opts
 */
export async function dashboardSeries(scope, range, opts) {
  const pool = getPool();
  const keys = bucketKeys(range);
  const cur = await windowInstants(range.from, range.to, range.tz);
  /** @type {Record<string, number[]>} */
  const series = {};
  const want = new Set(opts.metrics);

  if (want.has("volume") || want.has("settled") || want.has("volumeAsset")) {
    const params = [cur.lo, cur.hi, range.tz, range.from, SETTLED];
    const where = [];
    if (opts.asset) {
      params.push(opts.asset);
      where.push(`AND o.asset = $${params.length}`);
    }
    if (opts.network) {
      params.push(opts.network);
      where.push(`AND o.network = $${params.length}`);
    }
    const sc = appendPaymentOrderScope(scope.orderFilter, params);
    const volume = new Map();
    const settled = new Map();
    const volumeAsset = new Map();
    if (!sc.empty) {
      const key = bucketKeySql(range.interval, "o.created_at", 3, 4);
      const { rows } = await pool.query(
        `SELECT ${key} AS k,
           COALESCE(sum(${ORDER_USD}), 0) AS volume,
           count(*) AS settled,
           COALESCE(sum(${ORDER_ASSET}), 0) AS volume_asset
         FROM payment_orders o
         WHERE o.created_at >= $1::timestamptz AND o.created_at < $2::timestamptz
           AND $4::date IS NOT NULL
           AND o.status = ANY($5::text[])
           ${where.join(" ")}
           ${sc.clause}
         GROUP BY 1`,
        params,
      );
      for (const r of rows) {
        volume.set(r.k, Number(r.volume) || 0);
        settled.set(r.k, Number(r.settled) || 0);
        volumeAsset.set(r.k, Number(r.volume_asset) || 0);
      }
    }
    if (want.has("volume")) series.volume = fillSeries(keys, volume);
    if (want.has("settled")) series.settled = fillSeries(keys, settled);
    if (want.has("volumeAsset")) series.volumeAsset = fillSeries(keys, volumeAsset);
  }

  if (want.has("newMerchants") || want.has("newAgents")) {
    const everyOrg = scope.kind === "platform" && !scope.rootOrgId;
    const ids = scope.orgs
      .filter((o) => !scope.rootOrgId || o.id !== scope.rootOrgId)
      .map((o) => o.id);
    const merchants = new Map();
    const agents = new Map();
    if (everyOrg || ids.length > 0) {
      const key = bucketKeySql(range.interval, "a.created_at", 3, 4);
      const params = [cur.lo, cur.hi, range.tz, range.from];
      if (!everyOrg) params.push(ids);
      const { rows } = await pool.query(
        `SELECT ${key} AS k,
           count(*) FILTER (WHERE a.type IN ('merchant', 'merchant_site')) AS merchants,
           count(*) FILTER (WHERE a.type = 'agent') AS agents
         FROM org_accounts a
         WHERE a.created_at >= $1::timestamptz AND a.created_at < $2::timestamptz
           AND $4::date IS NOT NULL
           ${everyOrg ? "" : "AND a.id = ANY($5::uuid[])"}
         GROUP BY 1`,
        params,
      );
      for (const r of rows) {
        merchants.set(r.k, Number(r.merchants) || 0);
        agents.set(r.k, Number(r.agents) || 0);
      }
    }
    if (want.has("newMerchants")) series.newMerchants = fillSeries(keys, merchants);
    if (want.has("newAgents")) series.newAgents = fillSeries(keys, agents);
  }

  return { interval: range.interval, keys, series };
}

/** Rate charts use sub-day points up to this many days (5-minute samples would vanish into daily points). */
const RATE_HOURLY_MAX_DAYS = 7;

/** Hours per rate point: 1 day → 24, 3 days → 36, 7 days → 42 points. */
function rateHourStep(days) {
  if (days <= 1) return 1;
  if (days <= 3) return 2;
  return 4;
}

/**
 * Average locked convert rate per asset/network per bucket; empty buckets hold the last rate,
 * and buckets before the first known rate are null.
 * Scoped dashboards (agent / merchant) fall back to the platform-wide rate for pairs with no
 * scoped quotes, flagged `source: "market"` with no `quoteCount` so platform volume stays hidden.
 * @param {import("./dashboard-scope.mjs").DashboardScope} scope
 * @param {import("./dashboard-range.mjs").DashboardRange} range
 */
export async function dashboardRates(scope, wholeRange) {
  const range =
    wholeRange.days <= RATE_HOURLY_MAX_DAYS
      ? { ...wholeRange, interval: "hour", hourStep: rateHourStep(wholeRange.days) }
      : wholeRange;
  const keys = bucketKeys(range);
  const cur = await windowInstants(range.from, range.to, range.tz);
  const scoped = await ratePairs(scope.orderFilter, range, keys, cur);
  const pairs = scoped.map((p) => ({ ...p, source: "quotes" }));
  if (scope.orderFilter.kind !== "all") {
    const have = new Set(scoped.map((p) => `${p.asset}:${p.network}`));
    // One shared entry per period for every scoped viewer; never `fresh` so refreshes stay cheap.
    const market = await cachedDashboard(
      `rates-market|${range.from}|${range.to}|${range.tz}|${range.interval}|${range.hourStep ?? 1}`,
      () => ratePairs({ kind: "all" }, range, keys, cur),
      { ttlMs: MARKET_RATES_TTL_MS },
    );
    for (const p of market) {
      if (have.has(`${p.asset}:${p.network}`)) continue;
      pairs.push({ ...p, quoteCount: null, source: "market" });
    }
  }
  const livePrices = await cachedDashboard(
    `rates-live|${range.from}|${range.to}|${range.tz}|${range.interval}|${range.hourStep ?? 1}`,
    () => livePriceSeries(range, keys, cur),
    { ttlMs: MARKET_RATES_TTL_MS },
  );
  return { interval: range.interval, keys, pairs, livePrices };
}

/**
 * Sampled live market median per asset (not per network) for pairs nobody has
 * quoted yet. Buckets average their samples; gaps hold the previous value,
 * seeded from the last sample before the window.
 */
async function livePriceSeries(range, keys, cur) {
  const key = bucketKeySql(range.interval, "s.sampled_at", 3, 4, range.hourStep);
  let rows;
  let seeds;
  try {
    ({ rows } = await getPool().query(
      `SELECT s.asset, ${key} AS k, avg(s.rate) AS avg_rate,
         (array_agg(s.rate ORDER BY s.sampled_at DESC))[1] AS last_rate
       FROM fx_rate_samples s
       WHERE s.sampled_at >= $1::timestamptz AND s.sampled_at < $2::timestamptz
         AND $4::date IS NOT NULL
       GROUP BY 1, 2`,
      [cur.lo, cur.hi, range.tz, range.from],
    ));
    ({ rows: seeds } = await getPool().query(
      `SELECT DISTINCT ON (asset) asset, rate
         FROM fx_rate_samples
        WHERE sampled_at < $1::timestamptz
        ORDER BY asset, sampled_at DESC`,
      [cur.lo],
    ));
  } catch (err) {
    if (/fx_rate_samples/.test(err?.message ?? "")) return [];
    throw err;
  }
  /** @type {Map<string, { avg: Map<string, number>, last: Map<string, number> }>} */
  const byAsset = new Map();
  for (const r of rows) {
    let a = byAsset.get(r.asset);
    if (!a) {
      a = { avg: new Map(), last: new Map() };
      byAsset.set(r.asset, a);
    }
    a.avg.set(r.k, Number(r.avg_rate) || 0);
    a.last.set(r.k, Number(r.last_rate) || 0);
  }
  const seedBy = new Map(seeds.map((s) => [s.asset, Number(s.rate) || 0]));
  const out = [];
  for (const [asset, a] of byAsset) {
    /** @type {number | null} */
    let hold = seedBy.get(asset) || null;
    let latest = null;
    const series = keys.map((k) => {
      const v = a.avg.get(k);
      if (v && v > 0) {
        hold = v;
        latest = a.last.get(k) ?? v;
        return v;
      }
      return hold;
    });
    out.push({
      asset,
      latest,
      series: series.map(roundRate),
    });
  }
  return out;
}

/** @param {number | null} n */
function roundRate(n) {
  return n == null ? null : Math.round(n * 1e8) / 1e8;
}

async function ratePairs(orderFilter, range, keys, cur) {
  const params = [cur.lo, cur.hi, range.tz, range.from];
  const sc = appendPaymentOrderScope(orderFilter, params);
  if (sc.empty) return [];
  const rate = safeNumericSql("COALESCE(o.pricing_rate, o.market_rate)");
  const key = bucketKeySql(range.interval, "o.created_at", 3, 4, range.hourStep);
  const { rows } = await getPool().query(
    `SELECT o.asset, o.network, ${key} AS k,
       avg(${rate}) AS avg_rate,
       count(*) AS n,
       (array_agg(${rate} ORDER BY o.created_at DESC))[1] AS last_rate
     FROM payment_orders o
     WHERE o.created_at >= $1::timestamptz AND o.created_at < $2::timestamptz
       AND $4::date IS NOT NULL
       AND ${rate} > 0
       ${sc.clause}
     GROUP BY 1, 2, 3`,
    params,
  );
  /** @type {Map<string, { asset: string, network: string, avg: Map<string, number>, last: Map<string, number>, n: number }>} */
  const byPair = new Map();
  for (const r of rows) {
    const id = `${r.asset}:${r.network}`;
    let p = byPair.get(id);
    if (!p) {
      p = { asset: r.asset, network: r.network, avg: new Map(), last: new Map(), n: 0 };
      byPair.set(id, p);
    }
    p.avg.set(r.k, Number(r.avg_rate) || 0);
    p.last.set(r.k, Number(r.last_rate) || 0);
    p.n += Number(r.n) || 0;
  }
  const pairs = [];
  for (const p of byPair.values()) {
    let latest = null;
    /** @type {number | null} */
    let hold = null;
    const series = keys.map((k) => {
      const v = p.avg.get(k);
      if (v && v > 0) {
        hold = v;
        latest = p.last.get(k) ?? v;
        return v;
      }
      return hold;
    });
    pairs.push({
      asset: p.asset,
      network: p.network,
      quoteCount: p.n,
      latest,
      series: series.map(roundRate),
    });
  }
  return pairs;
}

/**
 * Metric cards for chosen agents / merchants (subtree volume series + paid platform fees).
 * @param {import("./dashboard-scope.mjs").DashboardScope} scope
 * @param {import("./dashboard-range.mjs").DashboardRange} range
 * @param {string[]} rootIds
 */
export async function dashboardOrgCards(scope, range, rootIds) {
  const keys = bucketKeys(range);
  const visible = new Set(scope.orgs.map((o) => o.id));
  const roots = rootIds.filter((id) => visible.has(id));
  if (roots.length === 0) return { interval: range.interval, keys, cards: [] };

  const children = childrenMap(scope.orgs);
  /** @type {Map<string, string[]>} leaf org → roots that include it */
  const rootsOf = new Map();
  for (const root of roots) {
    for (const id of subtreeOf(root, children)) {
      const list = rootsOf.get(id) ?? [];
      list.push(root);
      rootsOf.set(id, list);
    }
  }
  const leafIds = [...rootsOf.keys()];
  const cur = await windowInstants(range.from, range.to, range.tz);
  const pool = getPool();

  const params = [cur.lo, cur.hi, range.tz, range.from, SETTLED, leafIds];
  const sc = appendPaymentOrderScope(scope.orderFilter, params);
  const key = bucketKeySql(range.interval, "o.created_at", 3, 4);
  const [volRes, feeRes] = await Promise.all([
    sc.empty
      ? Promise.resolve({ rows: [] })
      : pool.query(
          `SELECT o.org_id, ${key} AS k, COALESCE(sum(${ORDER_USD}), 0) AS volume
           FROM payment_orders o
           WHERE o.created_at >= $1::timestamptz AND o.created_at < $2::timestamptz
             AND $4::date IS NOT NULL
             AND o.status = ANY($5::text[])
             AND o.org_id = ANY($6::uuid[])
             ${sc.clause}
           GROUP BY 1, 2`,
          params,
        ),
    pool.query(
      `SELECT b.org_id, COALESCE(sum(${BILL_FEE}), 0) AS fees
       FROM service_bills b
       WHERE b.status = 'paid'
         AND COALESCE(b.paid_at, b.due_at) >= $1::timestamptz
         AND COALESCE(b.paid_at, b.due_at) < $2::timestamptz
         AND b.org_id = ANY($3::uuid[])
         ${scope.billOrgIds ? "AND b.org_id = ANY($4::uuid[])" : ""}
       GROUP BY 1`,
      scope.billOrgIds ? [cur.lo, cur.hi, leafIds, scope.billOrgIds] : [cur.lo, cur.hi, leafIds],
    ),
  ]);

  /** @type {Map<string, { volume: Map<string, number>, fees: number }>} */
  const acc = new Map(roots.map((r) => [r, { volume: new Map(), fees: 0 }]));
  for (const r of volRes.rows) {
    for (const root of rootsOf.get(r.org_id) ?? []) {
      const a = acc.get(root);
      a.volume.set(r.k, (a.volume.get(r.k) ?? 0) + (Number(r.volume) || 0));
    }
  }
  for (const r of feeRes.rows) {
    for (const root of rootsOf.get(r.org_id) ?? []) {
      acc.get(root).fees += Number(r.fees) || 0;
    }
  }
  const cards = roots.map((orgId) => {
    const a = acc.get(orgId);
    const series = fillSeries(keys, a.volume);
    return {
      orgId,
      volumeUsd: round2(series.reduce((s, n) => s + n, 0)),
      feesCollected: round2(a.fees),
      series,
    };
  });
  return { interval: range.interval, keys, cards };
}
