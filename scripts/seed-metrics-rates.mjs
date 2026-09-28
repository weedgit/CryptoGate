#!/usr/bin/env node
/**
 * Seed Dashboard Metrics cards (ETH / ethereum, TRX / tron, USDT / tron)
 * with locked convert rates so rate sparklines leave "No data".
 *
 * Inserts dense last-30-day completed quotes as the newest platform orders
 * (dashboard list is capped), then upserts on re-run.
 *
 * Prerequisites: seed-local + seed-kevin-uat (at least one Kevin merchant).
 * Idempotent via idempotency_key.
 *
 * Usage: node scripts/seed-metrics-rates.mjs
 */
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closePool, getPool } from "../apps/api/src/db/pool.mjs";
import { loadSeedEnv } from "./seed-env.mjs";
import {
  NILE_PAYER_WALLETS,
  UAT_SETTLEMENT,
} from "./seed-nile-wallets.mjs";

/** Matches DashboardPage DEFAULT_RATE_PREFS — three Metrics cards. */
export const METRICS_RATE_PAIRS = [
  { asset: "ETH", network: "ethereum" },
  { asset: "TRX", network: "tron" },
  { asset: "USDT", network: "tron" },
];

const SEED_USD_PER_TOKEN = {
  USDT: 1,
  USDC: 1,
  TRX: 0.14,
  ETH: 3200,
  SOL: 145,
};

function formatSeedTokenAmount(asset, n) {
  if (asset === "ETH") return n.toFixed(6);
  if (asset === "SOL") return n.toFixed(4);
  return n.toFixed(2);
}

/** @param {string} asset @param {string|number} usdMajor @param {number} [daySalt] */
export function seedQuoteFromUsd(asset, usdMajor, daySalt = 0) {
  const usd = Number(usdMajor);
  const base = SEED_USD_PER_TOKEN[asset] ?? 1;
  const wobble =
    base === 1 ? 1 : 1 + ((((daySalt % 11) + 11) % 11) - 5) * 0.008;
  const rate = base * wobble;
  const payable = rate === 0 ? 0 : usd / rate;
  return {
    invoiceUsd: usd.toFixed(2),
    payable: formatSeedTokenAmount(asset, payable),
    pricingRate: rate.toFixed(8).replace(/\.?0+$/, "") || String(rate),
    marketRate: rate.toFixed(8).replace(/\.?0+$/, "") || String(rate),
  };
}

/**
 * Dense Metrics rate history for one merchant — newest timestamps so the
 * platform dashboard's capped order list still includes every Metrics pair.
 *
 * @param {import("pg").Pool} pool
 * @param {{
 *   orgId: string,
 *   merchantKey: string,
 *   receiveAddress: string,
 *   matchingMode?: string,
 *   cashierIds?: string[],
 *   ownerId: string,
 * }} args
 */
export async function seedMetricsRateHistory(pool, args) {
  const {
    orgId,
    merchantKey,
    receiveAddress,
    matchingMode = "B",
    cashierIds = [],
    ownerId,
  } = args;
  const wave = [420, 510, 380, 640, 720, 590, 880, 760, 910, 680, 540, 790, 860];
  let inserted = 0;
  let slot = 0;

  for (let daysBack = 29; daysBack >= 0; daysBack -= 1) {
    for (let pi = 0; pi < METRICS_RATE_PAIRS.length; pi += 1) {
      slot += 1;
      const pair = METRICS_RATE_PAIRS[pi];
      const createdAt = new Date();
      // Stagger minutes so ORDER BY created_at DESC keeps all three pairs
      // near the top of the platform list (not tied on the same second).
      createdAt.setUTCSeconds(0, 0);
      createdAt.setUTCMinutes((daysBack * 3 + pi) % 60);
      createdAt.setUTCHours(12 + (daysBack % 5));
      createdAt.setUTCDate(createdAt.getUTCDate() - daysBack);
      // Push day-0 rows to "just now" so they sort first even when other
      // seeds share the same calendar day.
      if (daysBack === 0) {
        createdAt.setTime(Date.now() - pi * 1000);
      }

      const dayKey = createdAt.toISOString().slice(0, 10);
      const amount = (
        wave[daysBack % wave.length] +
        (slot % 7) * 15 +
        pi * 35 +
        (daysBack % 5) * 12
      ).toFixed(2);
      const quote = seedQuoteFromUsd(pair.asset, amount, daysBack * 10 + pi);
      const idem = `kevin-metrics-${merchantKey}-${dayKey}-${pair.asset}-${pair.network}`;
      const bodyHash = createHash("sha256").update(idem).digest("hex");
      const expiresAt = new Date(createdAt.getTime() + 30 * 60 * 1000);
      const cashierId = cashierIds[slot % cashierIds.length] ?? ownerId;
      const fromAddress = NILE_PAYER_WALLETS[slot % NILE_PAYER_WALLETS.length];
      const txHash = createHash("sha256")
        .update(`uat-tx-${idem}`)
        .digest("hex");

      const { rowCount } = await pool.query(
        `INSERT INTO payment_orders (
           org_id, created_by, order_number, status, matching_mode,
           payable_amount, invoice_amount_usd, invoice_currency,
           market_rate, pricing_rate,
           receive_address, address_source, asset, network,
           expires_at, required_confirmations,
           idempotency_key, idempotency_body_hash, merchant_metadata,
           created_at, updated_at,
           received_amount, tx_hash, confirmations, from_address, confirmed_at
         ) VALUES (
           $1, $2,
           'CG-UAT-' || lpad(nextval('payment_orders_order_number_seq')::text, 8, '0'),
           'completed', $3, $4, $5, 'USD', $6, $7, $8, 'main',
           $9, $10, $11, 19,
           $12, $13, $14::jsonb,
           $15, $15,
           $4, $16, 19, $17, $15
         )
         ON CONFLICT (org_id, idempotency_key) DO UPDATE SET
           market_rate = EXCLUDED.market_rate,
           pricing_rate = EXCLUDED.pricing_rate,
           payable_amount = EXCLUDED.payable_amount,
           invoice_amount_usd = EXCLUDED.invoice_amount_usd,
           received_amount = EXCLUDED.received_amount,
           created_at = EXCLUDED.created_at,
           updated_at = EXCLUDED.updated_at,
           confirmed_at = EXCLUDED.confirmed_at
         WHERE payment_orders.pricing_rate IS DISTINCT FROM EXCLUDED.pricing_rate
            OR payment_orders.created_at IS DISTINCT FROM EXCLUDED.created_at`,
        [
          orgId,
          cashierId,
          matchingMode,
          quote.payable,
          quote.invoiceUsd,
          quote.marketRate,
          quote.pricingRate,
          receiveAddress,
          pair.asset,
          pair.network,
          expiresAt.toISOString(),
          idem,
          bodyHash,
          JSON.stringify({
            seed: "kevin-metrics",
            daily: dayKey,
            pair: `${pair.asset}:${pair.network}`,
          }),
          createdAt.toISOString(),
          txHash,
          fromAddress,
        ],
      );
      if (rowCount) inserted += 1;
    }
  }

  return inserted;
}

async function resolveSeedMerchant(pool) {
  // Prefer Kevin UAT, then any merchant with a usable receive address.
  // Settlement may be tron_nile (Kevin) or tron (load) — Metrics quotes
  // only need a receive_address column value, not a live rail match.
  const { rows } = await pool.query(
    `SELECT m.id, m.name,
            coalesce(
              (
                SELECT sa.address FROM settlement_addresses sa
                WHERE sa.org_id = m.id
                  AND sa.asset = 'USDT' AND sa.network = 'tron'
                LIMIT 1
              ),
              (
                SELECT sa.address FROM settlement_addresses sa
                WHERE sa.org_id = m.id
                  AND sa.asset = $1 AND sa.network = $2
                LIMIT 1
              ),
              (
                SELECT sa.address FROM settlement_addresses sa
                WHERE sa.org_id = m.id
                ORDER BY sa.created_at ASC
                LIMIT 1
              )
            ) AS settlement,
            coalesce(ms.matching_mode, 'B') AS matching_mode,
            (
              SELECT om.user_id
              FROM org_memberships om
              WHERE om.org_id = m.id
              ORDER BY CASE om.role
                WHEN 'owner' THEN 0
                WHEN 'admin' THEN 1
                ELSE 2
              END, om.created_at ASC
              LIMIT 1
            ) AS owner_id,
            CASE WHEN m.name LIKE 'Kevin %' THEN 0 ELSE 1 END AS pref
     FROM org_accounts m
     LEFT JOIN merchant_matching_settings ms ON ms.org_id = m.id
     WHERE m.type = 'merchant'
     ORDER BY pref ASC, m.created_at ASC
     LIMIT 50`,
    [UAT_SETTLEMENT.asset, UAT_SETTLEMENT.network],
  );
  return rows.find((r) => r.settlement && r.owner_id) ?? null;
}

/**
 * Backfill missing pricing/market rates on recent Metrics-pair orders so
 * sparklines can render without waiting for new inserts alone.
 */
async function backfillMetricsPricingRates(pool) {
  const { rows } = await pool.query(
    `SELECT id, asset, invoice_amount_usd, payable_amount, created_at
     FROM payment_orders
     WHERE status = 'completed'
       AND pricing_rate IS NULL
       AND created_at >= now() - interval '40 days'
       AND (asset, network) IN (
         ('ETH', 'ethereum'),
         ('TRX', 'tron'),
         ('USDT', 'tron')
       )`,
  );
  let updated = 0;
  for (const row of rows) {
    const usdBase = row.invoice_amount_usd ?? row.payable_amount;
    if (usdBase == null) continue;
    const daySalt = row.created_at
      ? Math.floor(new Date(row.created_at).getTime() / 86_400_000)
      : 0;
    const quote = seedQuoteFromUsd(row.asset, usdBase, daySalt);
    const { rowCount } = await pool.query(
      `UPDATE payment_orders
       SET market_rate = $2,
           pricing_rate = $3,
           invoice_amount_usd = coalesce(invoice_amount_usd, $4),
           updated_at = now()
       WHERE id = $1 AND pricing_rate IS NULL`,
      [row.id, quote.marketRate, quote.pricingRate, quote.invoiceUsd],
    );
    if (rowCount) updated += 1;
  }
  return updated;
}

function merchantKeyFromName(name) {
  if (name === "Kevin Single Merchant") return "single";
  if (name === "Kevin Multi Merchant") return "multi";
  if (name === "Kevin Merchant #2") return "m2";
  const m = /#(\d+)/.exec(name);
  if (m) return `m${m[1]}`;
  const load = /Load Merchant (\d+)/i.exec(name);
  if (load) return `load${load[1]}`;
  return name.toLowerCase().replace(/\s+/g, "-").slice(0, 32);
}

async function main() {
  loadSeedEnv();
  const pool = getPool();

  const merchant = await resolveSeedMerchant(pool);
  if (!merchant?.id || !merchant.owner_id) {
    throw new Error(
      "No merchant with settlement + member — run seed-local / load seeds first.",
    );
  }
  if (!merchant.settlement) {
    throw new Error(
      `Merchant ${merchant.name} has no ${UAT_SETTLEMENT.asset}/${UAT_SETTLEMENT.network} settlement address.`,
    );
  }

  const { rows: cashiers } = await pool.query(
    `SELECT user_id FROM org_memberships
     WHERE org_id = $1 AND role IN ('cashier', 'owner', 'admin')
     ORDER BY created_at ASC`,
    [merchant.id],
  );

  console.log(
    `Backfilling missing Metrics pricing_rate on recent completed orders…`,
  );
  const backfilled = await backfillMetricsPricingRates(pool);
  console.log(`  Rates backfilled: ${backfilled}`);

  console.log(
    `Seeding Metrics rates for ${merchant.name} (${METRICS_RATE_PAIRS.map((p) => `${p.asset}/${p.network}`).join(", ")})…`,
  );
  const n = await seedMetricsRateHistory(pool, {
    orgId: merchant.id,
    merchantKey: merchantKeyFromName(merchant.name),
    receiveAddress: merchant.settlement,
    matchingMode: merchant.matching_mode,
    cashierIds: cashiers.map((r) => r.user_id),
    ownerId: merchant.owner_id,
  });
  console.log(`  Upserted ${n} Metrics quote row(s).`);
  console.log("Metrics seed complete.");
}

const ranAsMain =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (ranAsMain) {
  main()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => closePool());
}
