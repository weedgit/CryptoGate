import { getPool } from "../db/pool.mjs";
import { toPaymentOrder } from "./order-map.mjs";
import { appendPaymentOrderScope } from "./order-scope-sql.mjs";

const SETTLED = ["completed", "confirmed"];

const EMPTY_SUMMARY = {
  periodVolume: "0",
  volumeByDay: [],
  volumeByOrg: [],
  anomalies: [],
};

/**
 * @param {{
 *   kind: "all" | "filter",
 *   treeOrgIds?: string[],
 *   cashierOrgIds?: string[],
 *   createdBy?: string | null,
 *   from: Date,
 *   to: Date,
 * }} query
 */
export async function summarizePaymentOrders(query) {
  const scopeFilter =
    query.kind === "all"
      ? { kind: "all" }
      : {
          kind: "filter",
          treeOrgIds: query.treeOrgIds ?? [],
          cashierOrgIds: query.cashierOrgIds ?? [],
          createdBy: query.createdBy ?? null,
        };

  const volumeParams = [query.from.toISOString(), query.to.toISOString(), SETTLED];
  const volumeScope = appendPaymentOrderScope(scopeFilter, volumeParams);
  if (volumeScope.empty) return { ...EMPTY_SUMMARY };

  const pool = getPool();

  const { rows: dayRows } = await pool.query(
    `SELECT date_trunc('day', o.expires_at AT TIME ZONE 'UTC')::date AS day,
            COALESCE(SUM(o.payable_amount::numeric), 0) AS volume
     FROM payment_orders o
     WHERE o.status = ANY($3::text[])
       AND o.expires_at >= $1::timestamptz
       AND o.expires_at <= $2::timestamptz
       ${volumeScope.clause}
     GROUP BY 1
     ORDER BY 1 ASC`,
    volumeParams,
  );

  const { rows: orgRows } = await pool.query(
    `SELECT o.org_id,
            COALESCE(SUM(o.payable_amount::numeric), 0) AS volume
     FROM payment_orders o
     WHERE o.status = ANY($3::text[])
       AND o.expires_at >= $1::timestamptz
       AND o.expires_at <= $2::timestamptz
       ${volumeScope.clause}
     GROUP BY o.org_id`,
    volumeParams,
  );

  const anomalyParams = [];
  const anomalyScope = appendPaymentOrderScope(scopeFilter, anomalyParams);
  if (anomalyScope.empty) {
    return {
      periodVolume: "0",
      volumeByDay: dayRows.map((r) => ({
        date: String(r.day).slice(0, 10),
        volume: String(Number(r.volume) || 0),
      })),
      volumeByOrg: orgRows.map((r) => ({
        orgId: r.org_id,
        volume: String(Number(r.volume) || 0),
      })),
      anomalies: [],
    };
  }

  const { rows: anomalyRows } = await pool.query(
    `SELECT o.id, o.org_id, o.created_by, o.order_number, o.status, o.matching_mode,
            o.payable_amount, o.received_amount, o.receive_address, o.address_source,
            o.hd_index, o.memo_or_tag, o.asset, o.network, o.expires_at, o.tx_hash,
            o.from_address, o.confirmed_at, o.confirmations, o.required_confirmations,
            o.idempotency_key, o.idempotency_body_hash, o.merchant_metadata,
            o.underpay_tolerance, o.fulfillment_policy, o.anomaly_reason,
            o.anomaly_resolution_note, o.anomaly_resolved_at, o.created_at, o.updated_at
     FROM payment_orders o
     WHERE o.status = 'payment_anomaly'
       ${anomalyScope.clause}
     ORDER BY o.created_at DESC
     LIMIT 50`,
    anomalyParams,
  );

  let periodVolume = 0;
  for (const row of orgRows) {
    const n = Number(row.volume);
    if (Number.isFinite(n)) periodVolume += n;
  }

  return {
    periodVolume: String(Math.round(periodVolume * 100) / 100),
    volumeByDay: dayRows.map((r) => ({
      date: String(r.day).slice(0, 10),
      volume: String(Number(r.volume) || 0),
    })),
    volumeByOrg: orgRows.map((r) => ({
      orgId: r.org_id,
      volume: String(Number(r.volume) || 0),
    })),
    anomalies: anomalyRows.map((row) => toPaymentOrder(row)),
  };
}
