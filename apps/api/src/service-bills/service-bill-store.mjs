import { getPool } from "../db/pool.mjs";
import { safeNumericSql } from "../dashboard/dashboard-range.mjs";
import {
  OPEN_ACTIVATION_SQL,
  SERVICE_BILL_BUCKETS,
  SERVICE_BILL_SORTS,
  billIdSearchHex,
  bucketPredicateSql,
  escapeLike,
} from "./service-bill-list-rules.mjs";

const BILL_SELECT = `
  id, org_id, period_start, period_end, subscription_amount, volume_fee_amount,
  total_amount, currency, status, due_at, paid_at, cancelled_at, waived_at,
  close_reason, sent_at, last_adjustment_reason, last_adjustment_amount, payment_reference,
  rx_address, tx_address, created_at, updated_at,
  tier, volume_fee_percent, billed_volume_usd, bill_kind,
  ops_note, credit_applied_usd
`;

const BILL_SELECT_LEGACY = `
  id, org_id, period_start, period_end, subscription_amount, volume_fee_amount,
  total_amount, currency, status, due_at, paid_at,
  last_adjustment_reason, payment_reference, created_at, updated_at
`;

/**
 * @param {string} sql
 * @param {unknown[]} [params]
 */
async function queryBills(sql, params = []) {
  try {
    return await getPool().query(sql, params);
  } catch (err) {
    if (err && err.code === "42703") {
      if (
        sql.includes("bill_kind") ||
        sql.includes("sent_at") ||
        sql.includes("cancelled_at") ||
        sql.includes("waived_at") ||
        sql.includes("ops_note") ||
        sql.includes("credit_applied_usd")
      ) {
        const stripped = sql
          .replace(/,\s*bill_kind/g, "")
          .replace(/,\s*sent_at/g, "")
          .replace(/,\s*cancelled_at/g, "")
          .replace(/,\s*waived_at/g, "")
          .replace(/,\s*close_reason/g, "")
          .replace(/,\s*ops_note/g, "")
          .replace(/,\s*credit_applied_usd/g, "")
          .replace(/bill_kind\s*=\s*\$\d+,?\s*/g, "")
          .replace(/sent_at\s*=\s*\$\d+,?\s*/g, "")
          .replace(/cancelled_at\s*=\s*\$\d+,?\s*/g, "")
          .replace(/ops_note\s*=\s*\$\d+,?\s*/g, "")
          .replace(/credit_applied_usd\s*=\s*\$\d+,?\s*/g, "");
        try {
          return await getPool().query(stripped, params);
        } catch (inner) {
          if (!(inner && inner.code === "42703")) throw inner;
        }
      }
      if (sql.includes("rx_address") || sql.includes("tx_address")) {
        const stripped = sql
          .replace(/,\s*rx_address/g, "")
          .replace(/,\s*tx_address/g, "")
          .replace(/rx_address\s*=\s*\$\d+,?\s*/g, "")
          .replace(/tx_address\s*=\s*\$\d+,?\s*/g, "");
        try {
          return await getPool().query(stripped, params);
        } catch (inner) {
          if (!(inner && inner.code === "42703")) throw inner;
        }
      }
      if (sql.includes("last_adjustment_amount")) {
        const stripped = sql
          .replace(/,\s*last_adjustment_amount/g, "")
          .replace(/last_adjustment_amount\s*=\s*\$\d+,?\s*/g, "");
        try {
          return await getPool().query(stripped, params);
        } catch (inner) {
          if (!(inner && inner.code === "42703")) throw inner;
        }
      }
      if (sql.includes("tier")) {
        return getPool().query(sql.replace(BILL_SELECT, BILL_SELECT_LEGACY), params);
      }
    }
    throw err;
  }
}

/**
 * @param {string} id
 */
export async function findServiceBillById(id) {
  const { rows } = await queryBills(
    `SELECT ${BILL_SELECT} FROM service_bills WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * @param {{
 *   kind: "all" | "filter",
 *   orgIds?: string[],
 *   orgId?: string | null,
 *   status?: string | null,
 *   limit?: number,
 *   offset?: number,
 * }} query
 * @returns {Promise<{ rows: object[], total: number, limit: number, offset: number }>}
 */
export async function listServiceBills(query) {
  const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 5000);
  const offset = Math.max(Number(query.offset) || 0, 0);
  const built = buildServiceBillWhere(query);
  if (!built) return { rows: [], total: 0, limit, offset };
  const { params, where } = built;

  const bucketSql = query.bucket ? bucketPredicateSql(query.bucket) : null;
  if (bucketSql) where.push(bucketSql);
  if (query.q) appendServiceBillSearch(params, where, query.q);

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countRes = await queryBills(
    `SELECT count(*)::int AS n FROM service_bills ${whereSql}`,
    params,
  );
  const total = countRes.rows[0]?.n ?? 0;

  const dir = query.dir === "asc" ? "ASC" : "DESC";
  const sortExpr =
    query.sort && Object.hasOwn(SERVICE_BILL_SORTS, query.sort)
      ? SERVICE_BILL_SORTS[query.sort]
      : "due_at";
  const orderSql =
    sortExpr === "activationFirst"
      ? `(CASE WHEN ${OPEN_ACTIVATION_SQL} THEN 0 ELSE 1 END), due_at DESC, id DESC`
      : sortExpr === "due_at"
        ? `due_at ${dir}, created_at ${dir}, id ${dir}`
        : `${sortExpr} ${dir} NULLS LAST, due_at ${dir}, id ${dir}`;

  const listParams = [...params, limit, offset];
  const { rows } = await queryBills(
    `SELECT ${BILL_SELECT}
     FROM service_bills
     ${whereSql}
     ORDER BY ${orderSql}
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    listParams,
  );
  return { rows, total, limit, offset };
}

/**
 * Scope + status + date-window filters shared by list and summary.
 * `period` keeps bills whose billing period overlaps [from, to] — the same rule
 * as the org overview platform-fee MTD, so Review links add up to the card.
 * @param {{ kind: "all" | "filter", orgIds?: string[], orgId?: string | null, status?: string | null, window?: { from: string, to: string, tz: string } | null, period?: { from: string, to: string } | null }} query
 * @returns {{ params: unknown[], where: string[] } | null} null = scope is empty
 */
function buildServiceBillWhere(query) {
  /** @type {unknown[]} */
  const params = [];
  /** @type {string[]} */
  const where = [];
  if (query.kind === "filter") {
    if (!query.orgIds || query.orgIds.length === 0) return null;
    params.push(query.orgIds);
    where.push(`org_id = ANY($${params.length}::uuid[])`);
  }
  if (query.orgId) {
    params.push(query.orgId);
    where.push(`org_id = $${params.length}::uuid`);
  }
  if (query.status) {
    params.push(query.status);
    where.push(`status = $${params.length}`);
  }
  if (query.period) {
    params.push(query.period.from, query.period.to);
    where.push(
      `(period_start <= $${params.length}::date AND period_end >= $${params.length - 1}::date)`,
    );
  }
  if (query.window) {
    params.push(query.window.from, query.window.to, query.window.tz);
    const f = params.length - 2;
    const t = params.length - 1;
    const z = params.length;
    const lo = `(($${f}::date)::timestamp AT TIME ZONE $${z}::text)`;
    const hi = `((($${t}::date) + 1)::timestamp AT TIME ZONE $${z}::text)`;
    where.push(
      `(status IN ('issued', 'overdue')
        OR (due_at >= ${lo} AND due_at < ${hi})
        OR (created_at >= ${lo} AND created_at < ${hi}))`,
    );
  }
  return { params, where };
}

/**
 * Bill id / merchant name + legal name / ancestor (agent) name + legal name /
 * payment reference / Rx / Tx address / period dates / total / status.
 * @param {unknown[]} params
 * @param {string[]} where
 * @param {string} q
 */
function appendServiceBillSearch(params, where, q) {
  params.push(`%${escapeLike(q.toLowerCase())}%`);
  const like = `$${params.length}`;
  const parts = [
    `id::text ILIKE ${like}`,
    `COALESCE(payment_reference, '') ILIKE ${like}`,
    `COALESCE(rx_address, '') ILIKE ${like}`,
    `COALESCE(tx_address, '') ILIKE ${like}`,
    `period_start::text ILIKE ${like}`,
    `period_end::text ILIKE ${like}`,
    `total_amount ILIKE ${like}`,
    `status ILIKE ${like}`,
    `org_id IN (
       WITH RECURSIVE hit AS (
         SELECT id FROM org_accounts
         WHERE name ILIKE ${like} OR COALESCE(legal_name, '') ILIKE ${like}
         UNION
         SELECT c.id FROM org_accounts c JOIN hit h ON c.parent_id = h.id
       )
       SELECT id FROM hit
     )`,
  ];
  const hex = billIdSearchHex(q);
  if (hex) {
    params.push(`%${hex}%`);
    parts.push(`replace(id::text, '-', '') LIKE $${params.length}`);
  }
  where.push(`(${parts.join(" OR ")})`);
}

/**
 * One row per merchant with bills: collection status for account lists plus
 * the latest billing month (agents roll these up into a payout badge).
 * billStatus priority: overdue → open activation → issued/draft → paid.
 * feeStatus (Accounts tree) ignores drafts: overdue → issued → paid.
 * @param {{ kind: "all" | "filter", orgIds?: string[] }} query
 * @returns {Promise<{ orgId: string, billStatus: "overdue" | "activation" | "issued" | "paid" | null, feeStatus: "overdue" | "issued" | "paid" | null, latestPeriod: string | null, latestPeriodOpen: boolean }[]>}
 */
export async function serviceBillOrgStatus(query) {
  const built = buildServiceBillWhere({ kind: query.kind, orgIds: query.orgIds });
  if (!built) return [];
  const { params, where } = built;
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { rows } = await queryBills(
    `WITH b AS (
       SELECT org_id, status, to_char(period_start, 'YYYY-MM') AS pk,
              ${OPEN_ACTIVATION_SQL} AS open_act
       FROM service_bills
       ${whereSql}
     ),
     latest AS (SELECT org_id, max(pk) AS lp FROM b GROUP BY org_id)
     SELECT b.org_id,
            l.lp AS latest_period,
            bool_or(b.status = 'overdue') AS has_overdue,
            bool_or(b.open_act) AS has_open_activation,
            bool_or(NOT b.open_act AND b.status IN ('issued', 'draft')) AS has_issued,
            bool_or(NOT b.open_act AND b.status = 'paid') AS has_paid,
            bool_or(b.status = 'issued') AS any_issued,
            bool_or(b.status = 'paid') AS any_paid,
            bool_or(b.status IN ('issued', 'overdue') AND b.pk = l.lp) AS latest_open
     FROM b JOIN latest l USING (org_id)
     GROUP BY b.org_id, l.lp`,
    params,
  );
  return rows.map((r) => ({
    orgId: r.org_id,
    billStatus: r.has_overdue
      ? "overdue"
      : r.has_open_activation
        ? "activation"
        : r.has_issued
          ? "issued"
          : r.has_paid
            ? "paid"
            : null,
    feeStatus: r.has_overdue
      ? "overdue"
      : r.any_issued
        ? "issued"
        : r.any_paid
          ? "paid"
          : null,
    latestPeriod: r.latest_period ?? null,
    latestPeriodOpen: Boolean(r.latest_open),
  }));
}

/**
 * Bucket counts + USD totals for the Service Bills KPI row and status tree.
 * @param {{ kind: "all" | "filter", orgIds?: string[], orgId?: string | null, window?: { from: string, to: string, tz: string } | null }} query
 */
export async function serviceBillSummary(query) {
  const counts = Object.fromEntries(SERVICE_BILL_BUCKETS.map((b) => [b, 0]));
  const empty = {
    counts,
    amounts: { issuedUsd: "0.00", overdueUsd: "0.00", paidUsd: "0.00" },
  };
  const built = buildServiceBillWhere(query);
  if (!built) return empty;
  const { params, where } = built;
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = safeNumericSql("total_amount");
  const bucketCols = SERVICE_BILL_BUCKETS.filter((b) => b !== "all")
    .map((b) => `count(*) FILTER (WHERE ${bucketPredicateSql(b)})::int AS "${b}"`)
    .join(",\n       ");
  const { rows } = await queryBills(
    `SELECT count(*)::int AS "all",
       ${bucketCols},
       COALESCE(sum(${total}) FILTER (WHERE ${bucketPredicateSql("issued")}), 0)::text AS issued_usd,
       COALESCE(sum(${total}) FILTER (WHERE ${bucketPredicateSql("overdue")}), 0)::text AS overdue_usd,
       COALESCE(sum(${total}) FILTER (WHERE ${bucketPredicateSql("paid")}), 0)::text AS paid_usd
     FROM service_bills
     ${whereSql}`,
    params,
  );
  const r = rows[0] ?? {};
  for (const b of SERVICE_BILL_BUCKETS) counts[b] = Number(r[b] ?? 0);
  return {
    counts,
    amounts: {
      issuedUsd: Number(r.issued_usd ?? 0).toFixed(2),
      overdueUsd: Number(r.overdue_usd ?? 0).toFixed(2),
      paidUsd: Number(r.paid_usd ?? 0).toFixed(2),
    },
  };
}

/**
 * @param {{
 *   orgId: string,
 *   periodStart: string,
 *   periodEnd: string,
 *   subscriptionAmount: string,
 *   volumeFeeAmount: string,
 *   totalAmount: string,
 *   dueAt: string,
 *   status: string,
 *   tier?: string | null,
 *   volumeFeePercent?: string | null,
 *   billedVolumeUsd?: string | null,
 *   billKind?: string | null,
 *   sentAt?: string | null,
 * }} input
 */
export async function insertServiceBill(input) {
  const billKind = input.billKind ?? "monthly";
  const sentAt = input.sentAt ?? null;
  const values = [
    input.orgId,
    input.periodStart,
    input.periodEnd,
    input.subscriptionAmount,
    input.volumeFeeAmount,
    input.totalAmount,
    input.status,
    input.dueAt,
    input.tier ?? null,
    input.volumeFeePercent ?? null,
    input.billedVolumeUsd ?? null,
    billKind,
    sentAt,
  ];
  try {
    const { rows } = await getPool().query(
      `INSERT INTO service_bills (
         org_id, period_start, period_end, subscription_amount, volume_fee_amount,
         total_amount, currency, status, due_at,
         tier, volume_fee_percent, billed_volume_usd, bill_kind, sent_at
       ) VALUES ($1, $2::date, $3::date, $4, $5, $6, 'USD', $7, $8::timestamptz, $9, $10, $11, $12, $13::timestamptz)
       RETURNING ${BILL_SELECT}`,
      values,
    );
    return rows[0];
  } catch (err) {
    if (err && err.code === "42703") {
      const { rows } = await getPool().query(
        `INSERT INTO service_bills (
           org_id, period_start, period_end, subscription_amount, volume_fee_amount,
           total_amount, currency, status, due_at
         ) VALUES ($1, $2::date, $3::date, $4, $5, $6, 'USD', $7, $8::timestamptz)
         RETURNING ${BILL_SELECT_LEGACY}`,
        values.slice(0, 8),
      );
      return rows[0];
    }
    throw err;
  }
}

/**
 * @param {string} id
 * @param {string} dueAt
 */
export async function sendServiceBill(id, dueAt) {
  const { rows } = await queryBills(
    `UPDATE service_bills
     SET status = 'issued',
         sent_at = now(),
         due_at = $2::timestamptz,
         updated_at = now()
     WHERE id = $1 AND status = 'draft'
     RETURNING ${BILL_SELECT}`,
    [id, dueAt],
  );
  return rows[0] ?? null;
}

/**
 * Close on purpose: nothing collected, no agent commission.
 * @param {string} id
 * @param {string} reason
 */
export async function waiveServiceBill(id, reason) {
  const { rows } = await queryBills(
    `UPDATE service_bills
     SET status = 'waived',
         waived_at = now(),
         close_reason = $2,
         updated_at = now()
     WHERE id = $1 AND status IN ('draft', 'issued', 'overdue')
     RETURNING ${BILL_SELECT}`,
    [id, reason],
  );
  return rows[0] ?? null;
}

/**
 * Wrong bill: closed; money still owed goes on a new bill.
 * @param {string} id
 * @param {string} reason
 */
export async function cancelServiceBill(id, reason) {
  const { rows } = await queryBills(
    `UPDATE service_bills
     SET status = 'cancelled',
         cancelled_at = now(),
         close_reason = $2,
         updated_at = now()
     WHERE id = $1 AND status IN ('draft', 'issued', 'overdue')
     RETURNING ${BILL_SELECT}`,
    [id, reason],
  );
  return rows[0] ?? null;
}

/**
 * @param {string} id
 * @param {{
 *   paymentReference?: string | null,
 *   rxAddress?: string | null,
 *   txAddress?: string | null,
 * }} [receipt]
 */
export async function markServiceBillPaid(id, receipt = {}) {
  const paymentReference = receipt.paymentReference ?? null;
  const rxAddress = receipt.rxAddress ?? null;
  const txAddress = receipt.txAddress ?? null;
  try {
    const { rows } = await getPool().query(
      `UPDATE service_bills
       SET status = 'paid',
           paid_at = now(),
           payment_reference = $2,
           rx_address = $3,
           tx_address = $4,
           updated_at = now()
       WHERE id = $1 AND status IN ('issued', 'overdue')
       RETURNING ${BILL_SELECT}`,
      [id, paymentReference, rxAddress, txAddress],
    );
    return rows[0] ?? null;
  } catch (err) {
    if (!(err && err.code === "42703")) throw err;
    const { rows } = await queryBills(
      `UPDATE service_bills
       SET status = 'paid', paid_at = now(), payment_reference = $2, updated_at = now()
       WHERE id = $1 AND status IN ('issued', 'overdue')
       RETURNING ${BILL_SELECT}`,
      [id, paymentReference],
    );
    return rows[0] ?? null;
  }
}

/**
 * @param {string} id
 * @param {string} totalAmount
 * @param {string} reason
 * @param {string} adjustmentAmount signed USD delta
 */
export async function adjustServiceBill(id, totalAmount, reason, adjustmentAmount) {
  const { rows } = await queryBills(
    `UPDATE service_bills
     SET total_amount = $2,
         last_adjustment_reason = $3,
         last_adjustment_amount = $4,
         updated_at = now()
     WHERE id = $1 AND status IN ('issued', 'overdue', 'draft')
     RETURNING ${BILL_SELECT}`,
    [id, totalAmount, reason, adjustmentAmount],
  );
  return rows[0] ?? null;
}

/**
 * Set subscription / volume lines and recompute total (optional credit applied).
 * @param {string} id
 * @param {{
 *   subscriptionAmount: string,
 *   volumeFeeAmount: string,
 *   totalAmount: string,
 *   reason: string,
 *   adjustmentAmount: string,
 *   opsNote?: string | null,
 *   creditAppliedUsd?: string | null,
 * }} input
 */
export async function adjustServiceBillLines(id, input) {
  const { rows } = await queryBills(
    `UPDATE service_bills
     SET subscription_amount = $2,
         volume_fee_amount = $3,
         total_amount = $4,
         last_adjustment_reason = $5,
         last_adjustment_amount = $6,
         ops_note = COALESCE($7, ops_note),
         credit_applied_usd = COALESCE($8, credit_applied_usd),
         updated_at = now()
     WHERE id = $1 AND status IN ('issued', 'overdue', 'draft')
     RETURNING ${BILL_SELECT}`,
    [
      id,
      input.subscriptionAmount,
      input.volumeFeeAmount,
      input.totalAmount,
      input.reason,
      input.adjustmentAmount,
      input.opsNote ?? null,
      input.creditAppliedUsd ?? null,
    ],
  );
  return rows[0] ?? null;
}

/**
 * @param {string} id
 * @param {string | null} opsNote
 */
export async function setServiceBillOpsNote(id, opsNote) {
  const { rows } = await queryBills(
    `UPDATE service_bills
     SET ops_note = $2, updated_at = now()
     WHERE id = $1
     RETURNING ${BILL_SELECT}`,
    [id, opsNote],
  );
  return rows[0] ?? null;
}

/**
 * @param {string} orgId
 * @param {string} periodStart YYYY-MM-DD
 */
export async function findActiveServiceBillForPeriod(orgId, periodStart) {
  const { rows } = await queryBills(
    `SELECT ${BILL_SELECT}
     FROM service_bills
     WHERE org_id = $1 AND period_start = $2::date
       AND status <> 'cancelled'
       AND COALESCE(bill_kind, 'monthly') = 'monthly'
     LIMIT 1`,
    [orgId, periodStart],
  );
  return rows[0] ?? null;
}

/**
 * @param {string} orgId
 */
export async function findActiveActivationBill(orgId) {
  const { rows } = await queryBills(
    `SELECT ${BILL_SELECT}
     FROM service_bills
     WHERE org_id = $1
       AND bill_kind = 'activation'
       AND status <> 'cancelled'
     LIMIT 1`,
    [orgId],
  );
  return rows[0] ?? null;
}

/**
 * Sum completed order payable amounts in [fromInclusive, toExclusive).
 * @param {string[]} orgIds
 * @param {string} fromInclusive ISO timestamptz
 * @param {string} toExclusive ISO timestamptz
 */
export async function sumCompletedPayableVolume(orgIds, fromInclusive, toExclusive) {
  if (!orgIds.length) return "0";
  const { rows } = await getPool().query(
    `SELECT COALESCE(SUM(payable_amount::numeric), 0)::text AS volume
     FROM payment_orders
     WHERE org_id = ANY($1::uuid[])
       AND status = 'completed'
       AND updated_at >= $2::timestamptz
       AND updated_at < $3::timestamptz`,
    [orgIds, fromInclusive, toExclusive],
  );
  return rows[0]?.volume ?? "0";
}
