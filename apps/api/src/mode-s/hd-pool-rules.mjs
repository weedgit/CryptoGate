import { OrderStatus } from "@cryptogate/domain";
import { HD_DERIVE_PATH_TEMPLATE } from "./hd-derive.mjs";

export const HD_POOL_STATUSES = ["FREE", "IN_USE", "COOLDOWN"];

/** Order statuses that release an HD address into COOLDOWN (not FREE yet). */
export const HD_POOL_RELEASE_STATUSES = [
  OrderStatus.Completed,
  OrderStatus.Expired,
  OrderStatus.Cancelled,
  OrderStatus.Failed,
];

/** Skip this many indexes if a derived address collides with main settlement. */
export const HD_DERIVE_MAX_ATTEMPTS = 32;

/**
 * Must cover late-payment / anomaly window (Phase1 §2.5). Default 24h.
 */
export function hdPoolCooldownMs() {
  const raw = process.env.HD_POOL_COOLDOWN_MS;
  const n = raw ? Number(raw) : 86_400_000;
  return Number.isFinite(n) && n >= 0 ? n : 86_400_000;
}

/**
 * Public pool row — receive addresses are merchant-controlled; never xPub.
 * @param {object} row
 */
export function toHdPoolAddress(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    asset: row.asset,
    network: row.network,
    hdIndex: row.hd_index,
    receiveAddress: row.receive_address,
    status: row.status,
    cooldownUntil: row.cooldown_until
      ? new Date(row.cooldown_until).toISOString()
      : null,
    lastOrderId: row.last_order_id ?? null,
  };
}

/**
 * @param {object[]} rows
 */
export function toHdPoolList(rows) {
  return {
    derivationPath: HD_DERIVE_PATH_TEMPLATE,
    items: rows.map(toHdPoolAddress),
  };
}
