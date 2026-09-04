#!/usr/bin/env node
/**
 * Kevin UAT rich history — extra merchants, cashiers, 3-month orders,
 * service bills (volume-aligned), and commission payouts.
 *
 * Prerequisites: seed-local + seed-kevin-uat.
 * Idempotent: ON CONFLICT / skip when month bill exists.
 *
 * Usage: node scripts/seed-kevin-uat-rich.mjs
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createUser, findUserByEmail } from "../apps/api/src/auth/users.mjs";
import { hashPassword } from "../apps/api/src/auth/password-hash.mjs";
import { bootstrapMerchantCommercial } from "../apps/api/src/commercial/merchant-commercial-routes.mjs";
import { closePool, getPool } from "../apps/api/src/db/pool.mjs";
import { findFeeTierBand } from "../apps/api/src/platform-settings/fee-tier-store.mjs";
import { insertMembership } from "../apps/api/src/orgs/membership-store.mjs";
import { insertOrgAccount } from "../apps/api/src/orgs/org-store.mjs";
import {
  roundUsd,
  volumeFeeUsd,
} from "../apps/api/src/service-bills/generate-rules.mjs";
import { addUsdAmounts } from "../apps/api/src/service-bills/service-bill-rules.mjs";
import { SEED_PASSWORD, SEED_PLATFORM_OWNER_EMAIL } from "./seed-constants.mjs";
import {
  NILE_HD_WALLETS,
  NILE_PAYER_WALLETS,
  UAT_SETTLEMENT,
} from "./seed-nile-wallets.mjs";
import { buildCommissionTreeSnapshot } from "./seed-commission-helpers.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MARKER_AGENT = "Kevin Agent";
const ONBOARD_AT = "2026-06-01T00:00:00.000Z";
const HISTORY_MONTHS = 3;
const MIN_CASHIERS = 4;
const BILL_REF_PREFIX = "kevin-uat-bill-";

/** BIP32 test vector 1 public xPub — watch-only; never a spend key. */
const VECTOR_XPUB =
  "xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** @type {const} */
const EXTRA_MERCHANTS = [
  {
    key: "m3",
    name: "Kevin Merchant #3",
    parentKey: "subAgent",
    legalName: "Kevin Merchant Three SARL",
    settlement: NILE_HD_WALLETS.customer8,
    tier: "mid",
    volumeFeePercent: "1.2",
    matchingMode: "B",
  },
  {
    key: "m4",
    name: "Kevin Merchant #4",
    parentKey: "subAgent",
    legalName: "Kevin Merchant Four SA",
    settlement: NILE_HD_WALLETS.customer9,
    tier: "mid",
    volumeFeePercent: "1.2",
    matchingMode: "C",
  },
  {
    key: "m5",
    name: "Kevin Merchant #5",
    parentKey: "agent",
    legalName: "Kevin Merchant Five Ltd",
    settlement: NILE_HD_WALLETS.customer10,
    tier: "small",
    volumeFeePercent: "2.0",
    matchingMode: "B",
  },
  {
    key: "m6",
    name: "Kevin Merchant #6",
    parentKey: "subAgent",
    legalName: "Kevin Merchant Six SARL AU",
    settlement: NILE_HD_WALLETS.customer11,
    tier: "small",
    volumeFeePercent: "2.0",
    matchingMode: "D",
  },
  {
    key: "m7",
    name: "Kevin Merchant #7",
    parentKey: "agent",
    legalName: "Kevin Merchant Seven Group",
    settlement: NILE_HD_WALLETS.customer12,
    tier: "mid",
    volumeFeePercent: "1.2",
    matchingMode: "S",
  },
];

const CASHIER_SLOTS = [
  { suffix: "a", label: "Cashier A" },
  { suffix: "b", label: "Cashier B" },
  { suffix: "c", label: "Cashier C" },
  { suffix: "d", label: "Cashier D" },
  { suffix: "e", label: "Cashier E" },
];

function loadEnv() {
  const envPath = join(root, ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim();
    }
  }
  for (const fallback of [
    "/etc/paymentgate/api.env",
    "/etc/cryptogate/api.env",
    "/etc/cryptogate/postgres.env",
  ]) {
    if (!existsSync(fallback)) continue;
    for (const line of readFileSync(fallback, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (key === "DATABASE_URL" || !process.env[key]) {
        process.env[key] = val;
      }
    }
  }
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
      "postgres://cryptogate:cryptogate@127.0.0.1:5433/cryptogate";
  }
}

function utcMonthStart(monthsBack) {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMonth(d.getUTCMonth() - monthsBack);
  return d;
}

function utcMonthEnd(monthStart) {
  const d = new Date(monthStart);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function monthExclusiveEnd(monthStart) {
  const d = new Date(monthStart);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

function toDateKey(val) {
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = Date.parse(s);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return s.slice(0, 10);
}

function periodLabelFromKey(key) {
  const [yRaw, mRaw] = key.split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    return key;
  }
  return `${MONTH_LABELS[m - 1] ?? mRaw} ${y}`;
}

async function ensureUser(email, displayName) {
  let user = await findUserByEmail(email);
  const passwordHash = await hashPassword(SEED_PASSWORD);
  if (!user) {
    user = await createUser({ email, password: SEED_PASSWORD });
  }
  await getPool().query(
    `UPDATE users SET password_hash = $2, display_name = $3 WHERE id = $1`,
    [user.id, passwordHash, displayName],
  );
  return user;
}

async function ensureMembership(orgId, userId, role) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT 1 FROM org_memberships WHERE org_id = $1 AND user_id = $2`,
    [orgId, userId],
  );
  if (rows.length === 0) {
    await insertMembership({ orgId, userId, role });
  }
}

async function ensureOrg(parentId, spec) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id FROM org_accounts
     WHERE type = 'merchant' AND lower(btrim(name)) = lower(btrim($1))
       AND parent_id = $2
     LIMIT 1`,
    [spec.name, parentId],
  );
  if (rows[0]?.id) {
    await pool.query(
      `UPDATE org_accounts
       SET country = $2, legal_name = $3, billing_email = $4,
           created_at = $5::timestamptz, updated_at = now()
       WHERE id = $1`,
      [
        rows[0].id,
        "MA",
        spec.legalName,
        `billing.${spec.key}@paymentgate.io`,
        ONBOARD_AT,
      ],
    );
    return rows[0].id;
  }

  const created = await insertOrgAccount({
    type: "merchant",
    name: spec.name,
    parentId,
    structure: "single_location",
    maxAgentDepth: null,
    country: "MA",
    legalName: spec.legalName,
  });
  if (!created.ok) {
    throw new Error(`Could not create ${spec.name}: ${created.code ?? "unknown"}`);
  }
  await pool.query(
    `UPDATE org_accounts
     SET billing_email = $2, created_at = $3::timestamptz, updated_at = now()
     WHERE id = $1`,
    [
      created.row.id,
      `billing.${spec.key}@paymentgate.io`,
      ONBOARD_AT,
    ],
  );
  return created.row.id;
}

async function ensureSettlement(pool, orgId, address) {
  await pool.query(
    `INSERT INTO settlement_addresses (org_id, asset, network, address)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (org_id, asset, network) DO UPDATE
       SET address = EXCLUDED.address, updated_at = now()`,
    [orgId, UAT_SETTLEMENT.asset, UAT_SETTLEMENT.network, address],
  );
}

async function ensureMerchantCommercial(orgId, spec, actorUserId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT org_id FROM merchant_commercial WHERE org_id = $1`,
    [orgId],
  );
  if (rows.length > 0) return;
  await bootstrapMerchantCommercial({
    orgId,
    tier: spec.tier,
    volumeFeePercent: spec.volumeFeePercent,
    actorUserId,
  });
}

async function ensureMatching(pool, orgId, mode) {
  await pool.query(
    `INSERT INTO merchant_matching_settings (org_id, matching_mode)
     VALUES ($1, $2)
     ON CONFLICT (org_id) DO UPDATE
       SET matching_mode = EXCLUDED.matching_mode, updated_at = now()`,
    [orgId, mode],
  );
}

async function ensureXpub(pool, orgId) {
  await pool.query(
    `INSERT INTO merchant_xpubs (org_id, asset, network, xpub)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (org_id, asset, network) DO NOTHING`,
    [orgId, UAT_SETTLEMENT.asset, UAT_SETTLEMENT.network, VECTOR_XPUB],
  );
}

async function ensureOwner(pool, orgId, key, displayName) {
  const email = `own.${key}@paymentgate.io`;
  const user = await ensureUser(email, displayName);
  await ensureMembership(orgId, user.id, "owner");
  return user.id;
}

async function ensureCashiers(orgId, merchantKey, merchantLabel) {
  const ids = [];
  for (const slot of CASHIER_SLOTS) {
    const email = `cashier.${merchantKey}.${slot.suffix}@paymentgate.io`;
    const user = await ensureUser(
      email,
      `${merchantLabel} ${slot.label}`,
    );
    await ensureMembership(orgId, user.id, "cashier");
    ids.push(user.id);
  }
  return ids;
}

/**
 * @param {import("pg").Pool} pool
 * @param {string} orgId
 * @param {string} monthKey YYYY-MM
 */
async function sumCompletedVolumeInMonth(pool, orgId, monthKey) {
  const start = new Date(`${monthKey}-01T00:00:00.000Z`);
  const end = monthExclusiveEnd(start);
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(payable_amount::numeric), 0)::text AS volume
     FROM payment_orders
     WHERE org_id = $1
       AND status = 'completed'
       AND updated_at >= $2::timestamptz
       AND updated_at < $3::timestamptz`,
    [orgId, start.toISOString(), end.toISOString()],
  );
  return rows[0]?.volume ?? "0";
}

async function merchantHasBillInMonth(pool, orgId, monthKey) {
  const { rows } = await pool.query(
    `SELECT 1 FROM service_bills
     WHERE org_id = $1
       AND to_char(period_start, 'YYYY-MM') = $2
       AND status <> 'voided'
     LIMIT 1`,
    [orgId, monthKey],
  );
  return rows.length > 0;
}

async function insertKevinBill(pool, bill) {
  const { rowCount } = await pool.query(
    `INSERT INTO service_bills (
       org_id, period_start, period_end,
       subscription_amount, volume_fee_amount, total_amount,
       currency, status, due_at, paid_at, payment_reference,
       tier, volume_fee_percent, billed_volume_usd,
       created_at, updated_at
     ) VALUES (
       $1, $2::date, $3::date,
       $4, $5, $6,
       'USD', $7, $8, $9, $10,
       $11, $12, $13,
       $14, $14
     )
     ON CONFLICT DO NOTHING`,
    [
      bill.orgId,
      bill.periodStart,
      bill.periodEnd,
      bill.subscriptionAmount,
      bill.volumeFeeAmount,
      bill.totalAmount,
      bill.status,
      bill.dueAt.toISOString(),
      bill.paidAt ? bill.paidAt.toISOString() : null,
      bill.paymentReference,
      bill.tier,
      bill.volumeFeePercent,
      bill.billedVolumeUsd,
      bill.createdAt.toISOString(),
    ],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * @param {ReadonlyArray<{ orgId: string, periodStart: string, volumeFeeAmount: string, status: string }>} bills
 * @param {Set<string>} merchantIds
 * @param {string} commissionPercent
 */
function commissionStatementsFromBills(bills, merchantIds, commissionPercent) {
  const scoped = bills.filter((b) => merchantIds.has(b.orgId));
  if (scoped.length === 0) return [];

  const byPeriod = new Map();
  for (const b of scoped) {
    const key = b.periodStart.slice(0, 7);
    const fee = Number(b.volumeFeeAmount);
    if (!Number.isFinite(fee)) continue;
    const cur = byPeriod.get(key) ?? {
      feeCollected: 0,
      hasPaid: false,
      hasOpen: false,
    };
    if (b.status === "paid") {
      cur.feeCollected += fee;
      cur.hasPaid = true;
    }
    if (b.status === "issued" || b.status === "overdue") cur.hasOpen = true;
    byPeriod.set(key, cur);
  }

  const bps = Math.round(Number(commissionPercent) * 100) || 100;
  return [...byPeriod.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, agg]) => {
      const platformFeeCollected = Math.round(agg.feeCollected * 100) / 100;
      const commissionAmount =
        Math.round(platformFeeCollected * (bps / 10_000) * 100) / 100;
      return {
        periodKey: key,
        periodLabel: periodLabelFromKey(key),
        platformFeeCollected,
        commissionPercent,
        commissionAmount,
        hasPaid: agg.hasPaid,
        hasOpen: agg.hasOpen,
      };
    });
}

async function upsertCommissionPayout(pool, row) {
  const findSql =
    row.payer === "platform"
      ? `SELECT id, payout_status, tx_ref FROM commission_payouts
         WHERE payer = 'platform' AND payee_org_id = $1 AND period_key = $2
         LIMIT 1`
      : `SELECT id, payout_status, tx_ref FROM commission_payouts
         WHERE payer = 'agent'
           AND payer_org_id = $1
           AND payee_org_id = $2
           AND period_key = $3
         LIMIT 1`;
  const findParams =
    row.payer === "platform"
      ? [row.payeeOrgId, row.periodKey]
      : [row.payerOrgId, row.payeeOrgId, row.periodKey];
  const { rows: existing } = await pool.query(findSql, findParams);
  const seededRef = String(existing[0]?.tx_ref ?? "").startsWith("seed-kevin-");
  const locked =
    existing[0] &&
    (existing[0].payout_status === "paid" ||
      existing[0].payout_status === "settled") &&
    !seededRef;
  if (locked) return "skip";

  const treeJson = row.treeSnapshot
    ? JSON.stringify(row.treeSnapshot)
    : null;

  if (existing[0]) {
    await pool.query(
      `UPDATE commission_payouts
       SET payee_name = $2, period_label = $3,
           platform_fee_collected = $4, commission_percent = $5,
           commission_amount = $6, payout_status = $7,
           payout_address = COALESCE($8, payout_address),
           asset = COALESCE($9, asset), network = COALESCE($10, network),
           tx_ref = COALESCE($11, tx_ref),
           paid_at = COALESCE($12, paid_at),
           settled_at = COALESCE($13, settled_at),
           tree_snapshot = COALESCE($14::jsonb, tree_snapshot),
           updated_at = now()
       WHERE id = $1`,
      [
        existing[0].id,
        row.payeeName,
        row.periodLabel,
        row.platformFeeCollected,
        row.commissionPercent,
        row.commissionAmount,
        row.payoutStatus,
        row.payoutAddress,
        row.asset,
        row.network,
        row.txRef,
        row.paidAt,
        row.settledAt ?? null,
        treeJson,
      ],
    );
    return "update";
  }

  await pool.query(
    `INSERT INTO commission_payouts (
       payee_org_id, payee_name, payer, payer_org_id,
       period_key, period_label, platform_fee_collected, commission_percent,
       commission_amount, payout_status, payout_address, asset, network,
       payment_link, tx_ref, paid_at, settled_at, tree_snapshot
     ) VALUES (
       $1, $2, $3, $4,
       $5, $6, $7, $8,
       $9, $10, $11, $12, $13,
       $14, $15, $16, $17, $18::jsonb
     )`,
    [
      row.payeeOrgId,
      row.payeeName,
      row.payer,
      row.payerOrgId,
      row.periodKey,
      row.periodLabel,
      row.platformFeeCollected,
      row.commissionPercent,
      row.commissionAmount,
      row.payoutStatus,
      row.payoutAddress,
      row.asset,
      row.network,
      row.paymentLink,
      row.txRef,
      row.paidAt,
      row.settledAt ?? null,
      treeJson,
    ],
  );
  return "insert";
}

async function merchantIdsInSubtree(pool, rootOrgId) {
  const { rows } = await pool.query(
    `WITH RECURSIVE subtree AS (
       SELECT id, type FROM org_accounts WHERE id = $1
       UNION ALL
       SELECT o.id, o.type FROM org_accounts o
       INNER JOIN subtree s ON o.parent_id = s.id
     )
     SELECT id FROM subtree WHERE type = 'merchant'`,
    [rootOrgId],
  );
  return new Set(rows.map((r) => r.id));
}

async function seedOrderHistory(
  pool,
  {
    orgId,
    merchantKey,
    receiveAddress,
    matchingMode,
    cashierIds,
    ownerId,
  },
) {
  const amounts = [12, 18, 20, 25, 30, 35, 45, 55, 75, 100];
  const daysInMonth = [3, 7, 11, 14, 18, 22, 26, 28];
  let slot = 0;

  for (let monthsBack = HISTORY_MONTHS - 1; monthsBack >= 0; monthsBack -= 1) {
    const monthStart = utcMonthStart(monthsBack);
    const monthKey = monthStart.toISOString().slice(0, 7);

    for (let di = 0; di < daysInMonth.length; di += 1) {
      slot += 1;
      const day = daysInMonth[di];
      const createdAt = new Date(monthStart);
      createdAt.setUTCDate(Math.min(day, 28));
      createdAt.setUTCHours(10 + (di % 8), (di * 7) % 60, 0, 0);

      const amount = amounts[(slot + di) % amounts.length].toFixed(2);
      const idem = `kevin-rich-${merchantKey}-${monthKey}-d${day}`;
      const bodyHash = createHash("sha256").update(idem).digest("hex");
      const expiresAt = new Date(createdAt.getTime() + 30 * 60 * 1000);
      const cashierId = cashierIds[slot % cashierIds.length] ?? ownerId;
      const fromAddress =
        NILE_PAYER_WALLETS[slot % NILE_PAYER_WALLETS.length];
      const txHash = createHash("sha256")
        .update(`uat-tx-${idem}`)
        .digest("hex");

      await pool.query(
        `INSERT INTO payment_orders (
           org_id, created_by, order_number, status, matching_mode,
           payable_amount, receive_address, address_source, asset, network,
           expires_at, required_confirmations,
           idempotency_key, idempotency_body_hash, merchant_metadata,
           created_at, updated_at,
           received_amount, tx_hash, confirmations, from_address, confirmed_at
         ) VALUES (
           $1, $2,
           'CG-UAT-' || lpad(nextval('payment_orders_order_number_seq')::text, 8, '0'),
           'completed', $3, $4, $5, 'main',
           $6, $7, $8, 19,
           $9, $10, $11::jsonb,
           $12, $12,
           $4, $13, 19, $14, $12
         )
         ON CONFLICT (org_id, idempotency_key) DO NOTHING`,
        [
          orgId,
          cashierId,
          matchingMode,
          amount,
          receiveAddress,
          UAT_SETTLEMENT.asset,
          UAT_SETTLEMENT.network,
          expiresAt.toISOString(),
          idem,
          bodyHash,
          JSON.stringify({ seed: "kevin-uat-rich", month: monthKey }),
          createdAt.toISOString(),
          txHash,
          fromAddress,
        ],
      );
    }

    // One in-flight + one anomaly per merchant per month (not in volume).
    for (const [extraStatus, extraSlot, extraAmount] of [
      ["pending_payment", "pend", "10.00"],
      ["payment_anomaly", "anom", "33.00"],
    ]) {
      slot += 1;
      const createdAt = new Date(monthStart);
      createdAt.setUTCDate(20);
      createdAt.setUTCHours(14, 0, 0, 0);
      const idem = `kevin-rich-${merchantKey}-${monthKey}-${extraSlot}`;
      const bodyHash = createHash("sha256").update(idem).digest("hex");
      const expiresAt = new Date(createdAt.getTime() + 30 * 60 * 1000);
      const anomalyReason =
        extraStatus === "payment_anomaly" ? "mode_b_underpay" : null;

      await pool.query(
        `INSERT INTO payment_orders (
           org_id, created_by, order_number, status, matching_mode,
           payable_amount, receive_address, address_source, asset, network,
           expires_at, required_confirmations,
           idempotency_key, idempotency_body_hash, merchant_metadata,
           created_at, updated_at,
           received_amount, tx_hash, confirmations, anomaly_reason
         ) VALUES (
           $1, $2,
           'CG-UAT-' || lpad(nextval('payment_orders_order_number_seq')::text, 8, '0'),
           $3, $4, $5, $6, 'main',
           $7, $8, $9, 19,
           $10, $11, '{"seed":"kevin-uat-rich"}'::jsonb,
           $12, $12,
           $13, $14, $15, $16
         )
         ON CONFLICT (org_id, idempotency_key) DO NOTHING`,
        [
          orgId,
          cashierIds[0] ?? ownerId,
          extraStatus,
          matchingMode,
          extraAmount,
          receiveAddress,
          UAT_SETTLEMENT.asset,
          UAT_SETTLEMENT.network,
          expiresAt.toISOString(),
          idem,
          bodyHash,
          createdAt.toISOString(),
          extraStatus === "payment_anomaly" ? "30.00" : null,
          extraStatus === "payment_anomaly"
            ? createHash("sha256").update(`anom-${idem}`).digest("hex")
            : null,
          0,
          anomalyReason,
        ],
      );
    }
  }
}

async function main() {
  loadEnv();
  const pool = getPool();

  const platformOwner = await findUserByEmail(SEED_PLATFORM_OWNER_EMAIL);
  if (!platformOwner) {
    throw new Error(
      `Missing ${SEED_PLATFORM_OWNER_EMAIL} — run node scripts/seed-local.mjs first.`,
    );
  }

  const { rows: agentRows } = await pool.query(
    `SELECT id FROM org_accounts WHERE type = 'agent' AND name = $1 LIMIT 1`,
    [MARKER_AGENT],
  );
  if (!agentRows[0]?.id) {
    throw new Error(
      "Kevin Agent missing — run node scripts/seed-kevin-uat.mjs first.",
    );
  }
  const agentId = agentRows[0].id;

  const { rows: subRows } = await pool.query(
    `SELECT id FROM org_accounts
     WHERE type = 'agent_sub' AND parent_id = $1 AND name = 'Kevin Sub-Agent'
     LIMIT 1`,
    [agentId],
  );
  const subAgentId = subRows[0]?.id;
  if (!subAgentId) {
    throw new Error("Kevin Sub-Agent missing — run seed-kevin-uat.mjs first.");
  }

  const parentByKey = { agent: agentId, subAgent: subAgentId };

  console.log("Patching Kevin merchant onboard dates (3-month window)…");
  await pool.query(
    `UPDATE org_accounts
     SET created_at = $1::timestamptz, updated_at = now()
     WHERE type = 'merchant'
       AND (
         name LIKE 'Kevin %'
         OR parent_id IN (
           SELECT id FROM org_accounts
           WHERE name LIKE 'Kevin %' OR parent_id = $2
         )
       )`,
    [ONBOARD_AT, agentId],
  );

  /** @type {Map<string, { id: string, key: string, tier: string, volumeFeePercent: string, settlement: string, matchingMode: string }>} */
  const merchantCatalog = new Map();

  const { rows: existingMerchants } = await pool.query(
    `WITH RECURSIVE subtree AS (
       SELECT id FROM org_accounts WHERE id = $1
       UNION ALL
       SELECT o.id FROM org_accounts o JOIN subtree s ON o.parent_id = s.id
     )
     SELECT m.id, m.name,
            mc.tier, mc.volume_fee_percent AS fee_pct,
            sa.address AS settlement,
            ms.matching_mode
     FROM org_accounts m
     LEFT JOIN merchant_commercial mc ON mc.org_id = m.id
     LEFT JOIN settlement_addresses sa
       ON sa.org_id = m.id
       AND sa.asset = $2 AND sa.network = $3
     LEFT JOIN merchant_matching_settings ms ON ms.org_id = m.id
     WHERE m.type = 'merchant' AND m.id IN (SELECT id FROM subtree)`,
    [agentId, UAT_SETTLEMENT.asset, UAT_SETTLEMENT.network],
  );

  const keyFromName = (name) => {
    if (name === "Kevin Single Merchant") return "single";
    if (name === "Kevin Multi Merchant") return "multi";
    if (name === "Kevin Merchant #2") return "m2";
    const m = /#(\d+)/.exec(name);
    return m ? `m${m[1]}` : name.toLowerCase().replace(/\s+/g, "-");
  };

  for (const m of existingMerchants) {
    merchantCatalog.set(m.id, {
      id: m.id,
      key: keyFromName(m.name),
      name: m.name,
      tier: m.tier ?? "mid",
      volumeFeePercent: String(m.fee_pct ?? "1.2"),
      settlement: m.settlement,
      matchingMode: m.matching_mode ?? "B",
    });
  }

  console.log("Adding extra Kevin merchants (Nile wallets #8–#12)…");
  for (const spec of EXTRA_MERCHANTS) {
    const parentId = parentByKey[spec.parentKey];
    const orgId = await ensureOrg(parentId, spec);
    await ensureMerchantCommercial(orgId, spec, platformOwner.id);
    await ensureMatching(pool, orgId, spec.matchingMode);
    await ensureSettlement(pool, orgId, spec.settlement);
    if (spec.matchingMode === "S") await ensureXpub(pool, orgId);
    const ownerId = await ensureOwner(
      pool,
      orgId,
      spec.key,
      `${spec.name} Owner`,
    );
    await ensureCashiers(orgId, spec.key, spec.name);
    merchantCatalog.set(orgId, {
      id: orgId,
      key: spec.key,
      name: spec.name,
      tier: spec.tier,
      volumeFeePercent: spec.volumeFeePercent,
      settlement: spec.settlement,
      matchingMode: spec.matchingMode,
      ownerId,
    });
  }

  console.log("Ensuring ≥4 cashiers per Kevin merchant…");
  let cashierUsers = 0;
  for (const entry of merchantCatalog.values()) {
    const before = cashierUsers;
    const ids = await ensureCashiers(entry.id, entry.key, entry.name);
    cashierUsers += ids.length;
    entry.cashierIds = ids;
    if (ids.length >= MIN_CASHIERS) {
      /* ok */
    } else if (cashierUsers > before) {
      console.log(`  ${entry.name}: ${ids.length} cashiers`);
    }
  }

  console.log(`Seeding ${HISTORY_MONTHS}-month completed order history…`);
  let ordersAdded = 0;
  for (const entry of merchantCatalog.values()) {
    if (!entry.settlement) {
      console.warn(`  Skip orders — no settlement for ${entry.name}`);
      continue;
    }
    const { rows: before } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM payment_orders WHERE org_id = $1`,
      [entry.id],
    );
    const ownerId =
      entry.ownerId ??
      (
        await pool.query(
          `SELECT user_id FROM org_memberships
           WHERE org_id = $1 AND role = 'owner' LIMIT 1`,
          [entry.id],
        )
      ).rows[0]?.user_id ??
      platformOwner.id;

    await seedOrderHistory(pool, {
      orgId: entry.id,
      merchantKey: entry.key,
      receiveAddress: entry.settlement,
      matchingMode: entry.matchingMode,
      cashierIds: entry.cashierIds ?? [],
      ownerId,
    });

    const { rows: after } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM payment_orders WHERE org_id = $1`,
      [entry.id],
    );
    ordersAdded += (after[0]?.n ?? 0) - (before[0]?.n ?? 0);
  }

  console.log("Issuing service bills from completed volume (3 months)…");
  let billsAdded = 0;
  /** @type {Array<{ orgId: string, periodStart: string, volumeFeeAmount: string, status: string }>} */
  const billRows = [];

  for (const entry of merchantCatalog.values()) {
    const band = await findFeeTierBand(entry.tier);
    const subscription = roundUsd(band?.subscription_amount_usd ?? "199.00");

    for (let monthsBack = HISTORY_MONTHS - 1; monthsBack >= 0; monthsBack -= 1) {
      const monthStart = utcMonthStart(monthsBack);
      const monthKey = monthStart.toISOString().slice(0, 7);
      if (await merchantHasBillInMonth(pool, entry.id, monthKey)) {
        const { rows: existing } = await pool.query(
          `SELECT org_id, to_char(period_start, 'YYYY-MM-DD') AS period_start,
                  volume_fee_amount, status
           FROM service_bills
           WHERE org_id = $1 AND to_char(period_start, 'YYYY-MM') = $2
           LIMIT 1`,
          [entry.id, monthKey],
        );
        if (existing[0]) {
          billRows.push({
            orgId: existing[0].org_id,
            periodStart: existing[0].period_start,
            volumeFeeAmount: String(existing[0].volume_fee_amount),
            status: existing[0].status,
          });
        }
        continue;
      }

      const volumeRaw = await sumCompletedVolumeInMonth(
        pool,
        entry.id,
        monthKey,
      );
      const billedVolumeUsd = roundUsd(volumeRaw);
      const volumeFeeAmount = volumeFeeUsd(
        billedVolumeUsd,
        entry.volumeFeePercent,
      );
      const totalAmount = addUsdAmounts(subscription, volumeFeeAmount);
      const monthEnd = utcMonthEnd(monthStart);
      const dueAt = new Date(monthEnd);
      dueAt.setUTCDate(dueAt.getUTCDate() + 14);
      const status = monthsBack === 0 ? "issued" : "paid";
      const paidAt =
        status === "paid"
          ? new Date(monthEnd.getTime() + 5 * 24 * 60 * 60 * 1000)
          : null;
      const createdAt = new Date(monthStart);
      createdAt.setUTCDate(createdAt.getUTCDate() + 3);

      const inserted = await insertKevinBill(pool, {
        orgId: entry.id,
        periodStart: monthStart.toISOString().slice(0, 10),
        periodEnd: monthEnd.toISOString().slice(0, 10),
        subscriptionAmount: subscription,
        volumeFeeAmount,
        totalAmount,
        status,
        dueAt,
        paidAt,
        paymentReference: `${BILL_REF_PREFIX}${entry.key}-${monthKey}`,
        tier: entry.tier,
        volumeFeePercent: entry.volumeFeePercent,
        billedVolumeUsd,
        createdAt,
      });
      if (inserted) billsAdded += 1;
      billRows.push({
        orgId: entry.id,
        periodStart: monthStart.toISOString().slice(0, 10),
        volumeFeeAmount,
        status,
      });
    }
  }

  console.log("Syncing commission payouts from paid volume fees…");
  let commissionRows = 0;
  const { rows: orgGraph } = await pool.query(
    `SELECT id, name, type, parent_id FROM org_accounts
     WHERE type IN ('agent', 'agent_sub')
       AND (name LIKE 'Kevin %' OR id = $1)`,
    [agentId],
  );
  const orgById = new Map(orgGraph.map((o) => [o.id, o]));

  const { rows: commissionCfg } = await pool.query(
    `SELECT org_id, commission_percent FROM agent_commission
     WHERE org_id = ANY($1::uuid[])`,
    [orgGraph.map((o) => o.id)],
  );
  const commissionByOrg = new Map(
    commissionCfg.map((r) => [r.org_id, r.commission_percent]),
  );

  const { rows: payoutAddrRows } = await pool.query(
    `SELECT org_id, asset, network, address FROM agent_payout_addresses
     WHERE org_id = ANY($1::uuid[])`,
    [orgGraph.map((o) => o.id)],
  );
  const payoutByOrg = new Map(
    payoutAddrRows.map((r) => [
      r.org_id,
      { asset: r.asset, network: r.network, address: r.address },
    ]),
  );

  const currentMonthKey = new Date().toISOString().slice(0, 7);

  for (const agent of orgGraph.filter((o) => o.type === "agent")) {
    const merchantIds = await merchantIdsInSubtree(pool, agent.id);
    const statements = commissionStatementsFromBills(
      billRows,
      merchantIds,
      commissionByOrg.get(agent.id) ?? "15",
    );
    const dest = payoutByOrg.get(agent.id);
    for (const stmt of statements) {
      if (stmt.commissionAmount <= 0 && stmt.platformFeeCollected <= 0) continue;
      const isCurrent = stmt.periodKey === currentMonthKey;
      const settled = !isCurrent && stmt.hasPaid;
      const paidAt = settled
        ? new Date(`${stmt.periodKey}-15T12:00:00.000Z`)
        : null;
      const paidAtIso =
        paidAt && Number.isFinite(paidAt.getTime())
          ? paidAt.toISOString()
          : null;
      const treeSnapshot = await buildCommissionTreeSnapshot(
        pool,
        agent.id,
        stmt.periodKey,
      );
      const result = await upsertCommissionPayout(pool, {
        payeeOrgId: agent.id,
        payeeName: agent.name,
        payer: "platform",
        payerOrgId: null,
        periodKey: stmt.periodKey,
        periodLabel: stmt.periodLabel,
        platformFeeCollected: stmt.platformFeeCollected,
        commissionPercent: stmt.commissionPercent,
        commissionAmount: stmt.commissionAmount,
        payoutStatus: isCurrent ? "issued" : settled ? "settled" : "issued",
        payoutAddress: dest?.address ?? null,
        asset: dest?.asset ?? UAT_SETTLEMENT.asset,
        network: dest?.network ?? UAT_SETTLEMENT.network,
        paymentLink: `/platform/commissions?payee=${encodeURIComponent(agent.id)}&period=${encodeURIComponent(stmt.periodKey)}`,
        txRef: settled
          ? `seed-kevin-platform-${agent.id.slice(0, 8)}-${stmt.periodKey}`
          : null,
        paidAt: paidAtIso,
        settledAt: settled ? paidAtIso : null,
        treeSnapshot,
      });
      if (result === "insert" || result === "update") commissionRows += 1;
    }
  }

  for (const sub of orgGraph.filter((o) => o.type === "agent_sub")) {
    const parentId = orgById.get(sub.id)?.parent_id;
    const parent = parentId ? orgById.get(parentId) : null;
    if (!parent || parent.type !== "agent") continue;

    const merchantIds = await merchantIdsInSubtree(pool, sub.id);
    const statements = commissionStatementsFromBills(
      billRows,
      merchantIds,
      commissionByOrg.get(sub.id) ?? "10",
    );
    const dest = payoutByOrg.get(sub.id);
    for (const stmt of statements) {
      if (stmt.commissionAmount <= 0 && stmt.platformFeeCollected <= 0) continue;
      const isCurrent = stmt.periodKey === currentMonthKey;
      const subPaidAt = !isCurrent && stmt.hasPaid
        ? (() => {
            const d = new Date(`${stmt.periodKey}-01T12:00:00.000Z`);
            d.setUTCDate(18);
            return Number.isFinite(d.getTime()) ? d.toISOString() : null;
          })()
        : null;
      const treeSnapshot = await buildCommissionTreeSnapshot(
        pool,
        sub.id,
        stmt.periodKey,
      );
      const result = await upsertCommissionPayout(pool, {
        payeeOrgId: sub.id,
        payeeName: sub.name,
        payer: "agent",
        payerOrgId: parent.id,
        periodKey: stmt.periodKey,
        periodLabel: stmt.periodLabel,
        platformFeeCollected: stmt.platformFeeCollected,
        commissionPercent: stmt.commissionPercent,
        commissionAmount: stmt.commissionAmount,
        payoutStatus: isCurrent ? "issued" : stmt.hasPaid ? "paid" : "issued",
        payoutAddress: dest?.address ?? null,
        asset: dest?.asset ?? UAT_SETTLEMENT.asset,
        network: dest?.network ?? UAT_SETTLEMENT.network,
        paymentLink: `/agent/commissions?payee=${encodeURIComponent(sub.id)}&period=${encodeURIComponent(stmt.periodKey)}`,
        txRef: subPaidAt
          ? `seed-kevin-agent-${sub.id.slice(0, 8)}-${stmt.periodKey}`
          : null,
        paidAt: subPaidAt,
        settledAt: null,
        treeSnapshot,
      });
      if (result === "insert" || result === "update") commissionRows += 1;
    }
  }

  console.log("\nKevin UAT rich seed complete.");
  console.log(`  Merchants in tree: ${merchantCatalog.size}`);
  console.log(`  Cashier slots ensured: ${MIN_CASHIERS}+ per merchant`);
  console.log(`  New order rows (approx): ${ordersAdded}`);
  console.log(`  Service bills inserted: ${billsAdded}`);
  console.log(`  Commission payout rows: ${commissionRows}`);
  console.log("\n  New merchant logins (password unchanged):");
  for (const spec of EXTRA_MERCHANTS) {
    console.log(`    ${spec.name.padEnd(22)} own.${spec.key}@paymentgate.io`);
    console.log(
      `    ${"".padEnd(22)} cashier.${spec.key}.a@paymentgate.io … .e`,
    );
  }
  console.log("\n  New settlement addresses:");
  for (const spec of EXTRA_MERCHANTS) {
    console.log(`    ${spec.name.padEnd(22)} ${spec.settlement}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closePool());
