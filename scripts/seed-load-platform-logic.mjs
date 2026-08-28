#!/usr/bin/env node
/**
 * Backfill merchants/agents with Phase-1 platform settings for UI/API tests.
 *
 * Seeds (idempotent ON CONFLICT / skips) — **all** merchant/agent orgs:
 *   - merchant_matching_settings — B / C / D / S cycling by name index
 *   - settlement_addresses — USDT/tron (+ ethereum for every 3rd merchant)
 *   - merchant_xpubs — watch-only BIP32 test vector for Mode S only
 *   - service_bills — calendar-month rows per merchant (paid fees → commission base)
 *   - agent_commission — varied % for agent / agent_sub (sub rates lower)
 *   - agent_payout_addresses — USDT/tron payout per agent org
 *   - commission_payouts — amounts derived from paid bill volume fees (matches UI logic)
 *   - enterprise_rate_approvals — pending outside-band rates (sample + named fixtures)
 *   - payment_anomaly orders — Compliance tab fixtures (Shop *-R1, Demo, samples)
 *   - multi_location sites — ensure ≥1 merchant_site child
 *   - audit org_status reason — for paused orgs
 *
 * Prerequisites: seed-local (Demo Merchant) and/or seed-load-orgs.
 * Usage: node scripts/seed-load-platform-logic.mjs
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findUserByEmail } from "../apps/api/src/auth/users.mjs";
import { closePool, getPool } from "../apps/api/src/db/pool.mjs";
import { insertOrgAccount } from "../apps/api/src/orgs/org-store.mjs";

const MATCHING_CYCLE = ["B", "C", "D", "S"];
const COMMISSION_CYCLE = ["10", "12", "15", "18", "20"];
/** Sub-agent share of platform fee on their own subtree merchants (parent pays). */
const SUB_COMMISSION_CYCLE = ["5", "8", "10", "12"];
/** Named local-review fixtures — keep stable when re-running platform-logic. */
const NAMED_AGENT_COMMISSION = {
  "Demo Agent": "15",
  "Demo Sub-Agent": "10",
};
const LOGIC_BILL_REF_PREFIX = "logic-bill-";
/** Monthly bills aligned to commission period keys (YYYY-MM). */
const COMMISSION_BILL_MONTHS = 8;
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
const SUSPEND_REASONS = [
  "compliance review",
  "billing dispute",
  "requested by agent",
  "risk hold — anomalous volume",
];

/** BIP32 test vector 1 public xPub — watch-only; never a spend key. */
const VECTOR_XPUB =
  "xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
      "postgres://cryptogate:cryptogate@localhost:5432/cryptogate";
  }
}

function fakeAddress(seed) {
  const hex = createHash("sha256").update(String(seed)).digest("hex");
  return `T${hex.slice(0, 33)}`;
}

function indexFromName(name) {
  const m = /(\d+)/.exec(name);
  return m ? Number(m[1]) : 1;
}

async function insertComplianceAnomaly(pool, {
  orgId,
  createdBy,
  amount,
  address,
  n,
}) {
  const idem = `load-compliance-${orgId}-${n}`;
  const bodyHash = createHash("sha256").update(idem).digest("hex");
  const createdAt = daysAgo(2 + n, n);
  const expiresAt = new Date(createdAt.getTime() + 30 * 60 * 1000);
  const { rowCount } = await pool.query(
    `INSERT INTO payment_orders (
       org_id, created_by, order_number, status, matching_mode,
       payable_amount, receive_address, address_source, hd_index, memo_or_tag,
       asset, network, expires_at, required_confirmations,
       idempotency_key, idempotency_body_hash, merchant_metadata,
       created_at, updated_at,
       received_amount, tx_hash, confirmations
     ) VALUES (
       $1, $2,
       'CG-CMP-' || lpad(nextval('payment_orders_order_number_seq')::text, 8, '0'),
       'payment_anomaly', 'B', $3, $4, 'main', NULL, NULL,
       'USDT', 'tron', $5, 19,
       $6, $7, '{"seed":"platform-logic-compliance"}'::jsonb,
       $8, $8,
       $9, $10, 0
     )
     ON CONFLICT (org_id, idempotency_key) DO NOTHING`,
    [
      orgId,
      createdBy,
      amount,
      address,
      expiresAt.toISOString(),
      idem,
      bodyHash,
      createdAt.toISOString(),
      amount,
      `0x${createHash("sha256").update(`anom-${idem}`).digest("hex")}`,
    ],
  );
  return (rowCount ?? 0) > 0;
}

function daysAgo(days, jitterHours = 0) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - jitterHours);
  return d;
}

function money(n) {
  return n.toFixed(2);
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
  return d;
}

/** Status mix mirrors invoice UI + commissionHistoryFromBills (paid fees only). */
function logicBillStatus(monthsBack, n) {
  if (monthsBack === 0) {
    if (n % 11 === 0) return "overdue";
    if (n % 4 === 0) return "issued";
    return "paid";
  }
  if (monthsBack === 1 && n % 9 === 0) return "issued";
  if (monthsBack === 1 && n % 13 === 0) return "overdue";
  return "paid";
}

function logicBillAmounts(n, monthsBack) {
  const sub = 49 + ((n + monthsBack * 2) % 45);
  const fee =
    8 +
    ((n * 5 + monthsBack * 11) % 95) +
    ((n + monthsBack) % 7) / 10;
  return {
    subscription: money(sub),
    volumeFee: money(fee),
    total: money(sub + fee),
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {string} orgId
 * @param {Date} monthStart
 */
async function merchantHasBillInMonth(pool, orgId, monthStart) {
  const key = monthStart.toISOString().slice(0, 7);
  const { rows } = await pool.query(
    `SELECT 1 FROM service_bills
     WHERE org_id = $1
       AND to_char(period_start, 'YYYY-MM') = $2
       AND status <> 'voided'
     LIMIT 1`,
    [orgId, key],
  );
  return rows.length > 0;
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} bill
 */
async function insertLogicBill(pool, bill) {
  const { rowCount } = await pool.query(
    `INSERT INTO service_bills (
       org_id, period_start, period_end,
       subscription_amount, volume_fee_amount, total_amount,
       currency, status, due_at, paid_at, payment_reference,
       created_at, updated_at
     ) VALUES (
       $1, $2::date, $3::date,
       $4, $5, $6,
       'USD', $7, $8, $9, $10,
       $11, $11
     )
     ON CONFLICT DO NOTHING`,
    [
      bill.orgId,
      bill.periodStart,
      bill.periodEnd,
      bill.subscription,
      bill.volumeFee,
      bill.total,
      bill.status,
      bill.dueAt.toISOString(),
      bill.paidAt ? bill.paidAt.toISOString() : null,
      bill.paymentReference,
      bill.createdAt.toISOString(),
    ],
  );
  return (rowCount ?? 0) > 0;
}

function periodLabelFromKey(key) {
  const [y, m] = key.split("-");
  const monthIdx = Number(m) - 1;
  const mon = MONTH_LABELS[monthIdx] ?? m ?? "—";
  return `${mon} ${y}`;
}

/**
 * Mirrors `commissionHistoryFromBills` in apps/web — fee base = paid volume fees only.
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

/**
 * @param {import("pg").Pool} pool
 * @param {string} rootOrgId
 */
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

/**
 * @param {import("pg").Pool} pool
 * @param {Set<string>} merchantIds
 */
async function loadBillsForMerchants(pool, merchantIds) {
  if (merchantIds.size === 0) return [];
  const { rows } = await pool.query(
    `SELECT org_id, period_start, volume_fee_amount, status
     FROM service_bills
     WHERE org_id = ANY($1::uuid[])`,
    [[...merchantIds]],
  );
  return rows.map((r) => ({
    orgId: r.org_id,
    periodStart:
      r.period_start instanceof Date
        ? r.period_start.toISOString().slice(0, 10)
        : String(r.period_start).slice(0, 10),
    volumeFeeAmount: String(r.volume_fee_amount),
    status: r.status,
  }));
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} row
 */
async function upsertCommissionPayoutSeed(pool, row) {
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
  const seededPaid =
    existing[0]?.payout_status === "paid" &&
    String(existing[0]?.tx_ref ?? "").startsWith("seed-");
  if (existing[0]?.payout_status === "paid" && !seededPaid) return "skip";

  if (existing[0]) {
    await pool.query(
      `UPDATE commission_payouts
       SET payee_name = $2,
           period_label = $3,
           platform_fee_collected = $4,
           commission_percent = $5,
           commission_amount = $6,
           payout_status = $7,
           payout_address = COALESCE($8, payout_address),
           asset = COALESCE($9, asset),
           network = COALESCE($10, network),
           payment_link = $11,
           tx_ref = COALESCE($12, tx_ref),
           paid_at = COALESCE($13, paid_at),
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
        row.paymentLink,
        row.txRef,
        row.paidAt,
      ],
    );
    return "update";
  }

  await pool.query(
    `INSERT INTO commission_payouts (
       payee_org_id, payee_name, payer, payer_org_id,
       period_key, period_label, platform_fee_collected, commission_percent,
       commission_amount, payout_status, payout_address, asset, network,
       payment_link, tx_ref, paid_at
     ) VALUES (
       $1, $2, $3, $4,
       $5, $6, $7, $8,
       $9, $10, $11, $12, $13,
       $14, $15, $16
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
    ],
  );
  return "insert";
}

async function main() {
  loadEnv();
  const pool = getPool();

  const platformOwner = await findUserByEmail("admin.platform@cryptogate.io");
  if (!platformOwner) {
    throw new Error(
      "Missing admin.platform@cryptogate.io — run `node scripts/seed-local.mjs` first.",
    );
  }

  const { rows: merchants } = await pool.query(
    `SELECT id, name, structure, status
     FROM org_accounts
     WHERE type = 'merchant'
     ORDER BY name ASC`,
  );
  if (merchants.length === 0) {
    throw new Error(
      "No merchants found — run `node scripts/seed-local.mjs` (and optionally seed-load-orgs) first.",
    );
  }

  const { rows: agents } = await pool.query(
    `SELECT id, name, type, status
     FROM org_accounts
     WHERE type IN ('agent', 'agent_sub')
     ORDER BY name ASC`,
  );

  console.log(
    `Platform-logic seed: ${merchants.length} merchants, ${agents.length} agents…`,
  );

  let matching = 0;
  let settlement = 0;
  let xpubs = 0;
  let sites = 0;
  let enterprise = 0;
  let commission = 0;
  let payouts = 0;
  let suspendAudit = 0;
  let commissionPayouts = 0;
  let logicBills = 0;

  const { rows: orgGraph } = await pool.query(
    `SELECT id, name, type, parent_id FROM org_accounts
     WHERE type IN ('platform', 'agent', 'agent_sub', 'merchant')
     ORDER BY name ASC`,
  );
  const orgById = new Map(orgGraph.map((o) => [o.id, o]));
  const parentType = (id) => {
    const p = orgById.get(id)?.parent_id;
    return p ? orgById.get(p)?.type ?? null : null;
  };

  const { rows: commissionRows } = await pool.query(
    `SELECT org_id, commission_percent FROM agent_commission`,
  );
  const commissionByOrg = new Map(
    commissionRows.map((r) => [r.org_id, r.commission_percent]),
  );

  const { rows: payoutAddrRows } = await pool.query(
    `SELECT org_id, asset, network, address FROM agent_payout_addresses`,
  );
  const payoutAddrByOrg = new Map(
    payoutAddrRows.map((r) => [
      r.org_id,
      { asset: r.asset, network: r.network, address: r.address },
    ]),
  );

  // --- Merchants: matching + settlement + xPub + sites + enterprise ---
  for (const m of merchants) {
    const n = indexFromName(m.name);
    const mode = MATCHING_CYCLE[(n - 1) % MATCHING_CYCLE.length];

    const matchRes = await pool.query(
      `INSERT INTO merchant_matching_settings (org_id, matching_mode)
       VALUES ($1, $2)
       ON CONFLICT (org_id) DO UPDATE
         SET matching_mode = EXCLUDED.matching_mode,
             updated_at = now()
       WHERE merchant_matching_settings.matching_mode IS DISTINCT FROM EXCLUDED.matching_mode
       RETURNING org_id`,
      [m.id, mode],
    );
    if (matchRes.rowCount) matching += 1;

    const networks =
      n % 3 === 0
        ? [
            { asset: "USDT", network: "tron" },
            { asset: "USDT", network: "ethereum" },
          ]
        : [{ asset: "USDT", network: "tron" }];

    for (const pair of networks) {
      const addr = fakeAddress(`${m.id}-${pair.asset}-${pair.network}`);
      const sRes = await pool.query(
        `INSERT INTO settlement_addresses (org_id, asset, network, address)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (org_id, asset, network) DO NOTHING
         RETURNING org_id`,
        [m.id, pair.asset, pair.network, addr],
      );
      if (sRes.rowCount) settlement += 1;
    }

    if (mode === "S") {
      const xRes = await pool.query(
        `INSERT INTO merchant_xpubs (org_id, asset, network, xpub)
         VALUES ($1, 'USDT', 'tron', $2)
         ON CONFLICT (org_id, asset, network) DO NOTHING
         RETURNING org_id`,
        [m.id, VECTOR_XPUB],
      );
      if (xRes.rowCount) xpubs += 1;
    }

    if (m.structure === "multi_location") {
      const { rows: siteRows } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM org_accounts
         WHERE type = 'merchant_site' AND parent_id = $1`,
        [m.id],
      );
      let have = siteRows[0]?.n ?? 0;
      const want = Math.max(2, have);
      while (have < want) {
        have += 1;
        const site = await insertOrgAccount({
          type: "merchant_site",
          name: `${m.name} · Site ${have}`,
          parentId: m.id,
          structure: null,
          maxAgentDepth: null,
        });
        if (site.ok) sites += 1;
        else if (site.code !== "duplicate_sibling_name") {
          throw new Error(`site for ${m.name}: ${site.code}`);
        }
      }
    }

    // Pending enterprise approval for a sparse sample (out-of-band rate).
    const forceEnterprise =
      n % 17 === 0 ||
      m.name === "Demo Merchant" ||
      m.name === "Load Shop 001-R1" ||
      m.name === "Load Merchant 002";
    if (forceEnterprise) {
      await pool.query(
        `UPDATE merchant_commercial
         SET tier = 'enterprise',
             volume_fee_percent = '0.9',
             enterprise_approval_status = 'pending',
             updated_at = now()
         WHERE org_id = $1`,
        [m.id],
      );
      const { rows: existingApproval } = await pool.query(
        `SELECT 1 FROM enterprise_rate_approvals
         WHERE org_id = $1 AND status = 'pending'
         LIMIT 1`,
        [m.id],
      );
      if (existingApproval.length === 0) {
        await pool.query(
          `INSERT INTO enterprise_rate_approvals (
             org_id, requested_tier, requested_volume_fee_percent,
             status, requested_by_user_id
           ) VALUES ($1, 'enterprise', '0.25', 'pending', $2)`,
          [m.id, platformOwner.id],
        );
        enterprise += 1;
      }
    }
  }

  // --- Service bills: calendar months → commission period keys (skip if month filled) ---
  for (const m of merchants) {
    const n = indexFromName(m.name);
    for (let monthsBack = 0; monthsBack < COMMISSION_BILL_MONTHS; monthsBack++) {
      const monthStart = utcMonthStart(monthsBack);
      if (await merchantHasBillInMonth(pool, m.id, monthStart)) continue;

      const monthEnd = utcMonthEnd(monthStart);
      const status = logicBillStatus(monthsBack, n);
      const amounts = logicBillAmounts(n, monthsBack);
      const dueAt = new Date(monthEnd);
      dueAt.setUTCDate(dueAt.getUTCDate() + 14);
      const paidAt =
        status === "paid"
          ? new Date(monthEnd.getTime() + 3 * 24 * 60 * 60 * 1000)
          : null;
      const createdAt = new Date(monthStart);
      createdAt.setUTCDate(createdAt.getUTCDate() + 2);
      const periodStart = monthStart.toISOString().slice(0, 10);
      const periodEnd = monthEnd.toISOString().slice(0, 10);
      const paymentReference = `${LOGIC_BILL_REF_PREFIX}${m.id.slice(0, 8)}-${periodStart}`;

      const inserted = await insertLogicBill(pool, {
        orgId: m.id,
        periodStart,
        periodEnd,
        subscription: amounts.subscription,
        volumeFee: amounts.volumeFee,
        total: amounts.total,
        status,
        dueAt,
        paidAt,
        createdAt,
        paymentReference,
      });
      if (inserted) logicBills += 1;
    }
  }

  // --- Compliance fixtures: payment anomalies on demo + rich shops ---
  let anomalies = 0;
  const { rows: complianceTargets } = await pool.query(
    `SELECT id, name FROM org_accounts
     WHERE type = 'merchant'
       AND (
         name IN ('Demo Merchant', 'Load Shop 001-R1', 'Load Shop 001-R2', 'Load Merchant 002')
         OR name ~ '^Load Shop [0-9]+-R1$'
         OR name ~ '^Load Merchant 0(05|10|15|20)$'
       )
     ORDER BY name ASC`,
  );
  for (const target of complianceTargets) {
    const { rows: memberRows } = await pool.query(
      `SELECT user_id FROM org_memberships
       WHERE org_id = $1
       ORDER BY CASE role WHEN 'cashier' THEN 0 WHEN 'owner' THEN 1 ELSE 2 END
       LIMIT 1`,
      [target.id],
    );
    const createdBy = memberRows[0]?.user_id ?? platformOwner.id;
    for (let n = 0; n < 2; n++) {
      const added = await insertComplianceAnomaly(pool, {
        orgId: target.id,
        createdBy,
        amount: (55 + n * 17 + (indexFromName(target.name) % 30)).toFixed(2),
        address: fakeAddress(`compliance-${target.id}-${n}`),
        n,
      });
      if (added) anomalies += 1;
    }
  }

  // --- Agents: commission + payout ---
  for (const a of agents) {
    const n = indexFromName(a.name);
    const cycle =
      a.type === "agent_sub" ? SUB_COMMISSION_CYCLE : COMMISSION_CYCLE;
    const pct =
      NAMED_AGENT_COMMISSION[a.name] ?? cycle[(n - 1) % cycle.length];
    const cRes = await pool.query(
      `INSERT INTO agent_commission (org_id, commission_percent, effective_from)
       VALUES ($1, $2, date_trunc('month', now() AT TIME ZONE 'utc')::date)
       ON CONFLICT (org_id) DO UPDATE
         SET commission_percent = EXCLUDED.commission_percent,
             updated_at = now()
       WHERE agent_commission.commission_percent IS DISTINCT FROM EXCLUDED.commission_percent
       RETURNING org_id`,
      [a.id, pct],
    );
    if (cRes.rowCount) commission += 1;
    commissionByOrg.set(a.id, pct);

    const pRes = await pool.query(
      `INSERT INTO agent_payout_addresses (org_id, asset, network, address)
       VALUES ($1, 'USDT', 'tron', $2)
       ON CONFLICT (org_id) DO NOTHING
       RETURNING org_id`,
      [a.id, fakeAddress(`payout-${a.id}`)],
    );
    if (pRes.rowCount) payouts += 1;
    if (!payoutAddrByOrg.has(a.id)) {
      payoutAddrByOrg.set(a.id, {
        asset: "USDT",
        network: "tron",
        address: fakeAddress(`payout-${a.id}`),
      });
    }
  }

  // --- Commission payout slips (match commissionHistoryFromBills) ---
  const { rows: payoutTable } = await pool.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'commission_payouts'
     LIMIT 1`,
  );
  if (payoutTable.length === 0) {
    console.warn(
      "  Skipping commission_payouts — apply migration 034_commission_payouts_underpay.sql",
    );
  } else {
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const topLevelAgents = agents.filter(
    (a) => a.type === "agent" && parentType(a.id) === "platform",
  );
  const subAgents = agents.filter((a) => a.type === "agent_sub");

  for (const agent of topLevelAgents) {
    const merchantIds = await merchantIdsInSubtree(pool, agent.id);
    const bills = await loadBillsForMerchants(pool, merchantIds);
    const pct = commissionByOrg.get(agent.id) ?? "15";
    const statements = commissionStatementsFromBills(bills, merchantIds, pct);
    const dest = payoutAddrByOrg.get(agent.id);
    for (const stmt of statements) {
      if (stmt.platformFeeCollected <= 0 && stmt.commissionAmount <= 0) continue;
      const isCurrent = stmt.periodKey === currentMonthKey;
      const paidAt =
        !isCurrent && stmt.hasPaid
          ? daysAgo(5 + (indexFromName(agent.name) % 10)).toISOString()
          : null;
      const result = await upsertCommissionPayoutSeed(pool, {
        payeeOrgId: agent.id,
        payeeName: agent.name,
        payer: "platform",
        payerOrgId: null,
        periodKey: stmt.periodKey,
        periodLabel: stmt.periodLabel,
        platformFeeCollected: stmt.platformFeeCollected,
        commissionPercent: stmt.commissionPercent,
        commissionAmount: stmt.commissionAmount,
        payoutStatus: isCurrent ? "ready" : stmt.hasPaid ? "paid" : "ready",
        payoutAddress: dest?.address ?? null,
        asset: dest?.asset ?? "USDT",
        network: dest?.network ?? "tron",
        paymentLink: `/platform/commissions?payee=${encodeURIComponent(agent.id)}&period=${encodeURIComponent(stmt.periodKey)}`,
        txRef:
          !isCurrent && stmt.hasPaid
            ? `seed-platform-${agent.id.slice(0, 8)}-${stmt.periodKey}`
            : null,
        paidAt,
      });
      if (result === "insert" || result === "update") commissionPayouts += 1;
    }
  }

  for (const sub of subAgents) {
    const parentId = orgById.get(sub.id)?.parent_id;
    const parent = parentId ? orgById.get(parentId) : null;
    if (!parent || parent.type !== "agent") continue;

    const merchantIds = await merchantIdsInSubtree(pool, sub.id);
    const bills = await loadBillsForMerchants(pool, merchantIds);
    const pct = commissionByOrg.get(sub.id) ?? "10";
    const statements = commissionStatementsFromBills(bills, merchantIds, pct);
    const dest = payoutAddrByOrg.get(sub.id);
    for (const stmt of statements) {
      if (stmt.platformFeeCollected <= 0 && stmt.commissionAmount <= 0) continue;
      const isCurrent = stmt.periodKey === currentMonthKey;
      const paidAt =
        !isCurrent && stmt.hasPaid
          ? daysAgo(3 + (indexFromName(sub.name) % 8)).toISOString()
          : null;
      const result = await upsertCommissionPayoutSeed(pool, {
        payeeOrgId: sub.id,
        payeeName: sub.name,
        payer: "agent",
        payerOrgId: parent.id,
        periodKey: stmt.periodKey,
        periodLabel: stmt.periodLabel,
        platformFeeCollected: stmt.platformFeeCollected,
        commissionPercent: stmt.commissionPercent,
        commissionAmount: stmt.commissionAmount,
        payoutStatus: isCurrent ? "ready" : stmt.hasPaid ? "paid" : "ready",
        payoutAddress: dest?.address ?? null,
        asset: dest?.asset ?? "USDT",
        network: dest?.network ?? "tron",
        paymentLink: `/agent/commissions?payee=${encodeURIComponent(sub.id)}&period=${encodeURIComponent(stmt.periodKey)}`,
        txRef:
          !isCurrent && stmt.hasPaid
            ? `seed-agent-${sub.id.slice(0, 8)}-${stmt.periodKey}`
            : null,
        paidAt,
      });
      if (result === "insert" || result === "update") commissionPayouts += 1;
    }
  }
  }

  // --- Suspend audit with optional reason (paused Load orgs) ---
  const { rows: paused } = await pool.query(
    `SELECT id, name, type FROM org_accounts
     WHERE status = 'paused'
       AND type IN ('agent', 'agent_sub', 'merchant')
     ORDER BY name ASC`,
  );
  for (let i = 0; i < paused.length; i++) {
    const org = paused[i];
    const reason = SUSPEND_REASONS[i % SUSPEND_REASONS.length];
    const { rows: has } = await pool.query(
      `SELECT 1 FROM audit_log
       WHERE org_id = $1 AND action = 'org_status'
         AND metadata->>'status' = 'paused'
         AND metadata ? 'reason'
       LIMIT 1`,
      [org.id],
    );
    if (has.length > 0) continue;
    await pool.query(
      `INSERT INTO audit_log (actor_user_id, org_id, action, metadata)
       VALUES ($1, $2, 'org_status', $3::jsonb)`,
      [
        platformOwner.id,
        org.id,
        JSON.stringify({
          status: "paused",
          priorStatus: "active",
          type: org.type,
          reason,
          seed: "platform-logic",
        }),
      ],
    );
    suspendAudit += 1;
  }

  // Spot-check counts for UI expectations.
  const { rows: modeCounts } = await pool.query(
    `SELECT matching_mode, COUNT(*)::int AS n
     FROM merchant_matching_settings mms
     JOIN org_accounts o ON o.id = mms.org_id
     WHERE o.type = 'merchant'
     GROUP BY matching_mode
     ORDER BY matching_mode`,
  );
  const { rows: multiWithSites } = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM org_accounts m
     WHERE m.type = 'merchant'
       AND m.structure = 'multi_location'
       AND EXISTS (
         SELECT 1 FROM org_accounts s
         WHERE s.parent_id = m.id AND s.type = 'merchant_site'
       )`,
  );
  const { rows: modeSWithXpub } = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM merchant_matching_settings mms
     JOIN org_accounts o ON o.id = mms.org_id
     WHERE o.type = 'merchant'
       AND mms.matching_mode = 'S'
       AND EXISTS (
         SELECT 1 FROM merchant_xpubs x
         WHERE x.org_id = o.id AND x.asset = 'USDT' AND x.network = 'tron'
       )`,
  );
  const { rows: withSettlement } = await pool.query(
    `SELECT COUNT(DISTINCT sa.org_id)::int AS n
     FROM settlement_addresses sa
     JOIN org_accounts o ON o.id = sa.org_id
     WHERE o.type = 'merchant'`,
  );
  const { rows: billStats } = await pool.query(
    `SELECT status, COUNT(*)::int AS n
     FROM service_bills
     GROUP BY status
     ORDER BY status`,
  );
  let payoutStats = [];
  if (payoutTable.length > 0) {
    const res = await pool.query(
      `SELECT payer, payout_status, COUNT(*)::int AS n
       FROM commission_payouts
       GROUP BY payer, payout_status
       ORDER BY payer, payout_status`,
    );
    payoutStats = res.rows;
  }

  console.log("\nPlatform-logic seed ready:");
  console.log(`  Matching modes upserted:   ${matching}`);
  console.log(`  Settlement addresses:      ${settlement}`);
  console.log(`  Mode S xPubs:              ${xpubs}`);
  console.log(`  Sites backfilled:          ${sites}`);
  console.log(`  Enterprise pending:        ${enterprise}`);
  console.log(`  Logic service bills:       ${logicBills}`);
  console.log(`  Compliance anomalies:      ${anomalies}`);
  console.log(`  Agent commissions:         ${commission}`);
  console.log(`  Agent payouts:             ${payouts}`);
  console.log(`  Commission payout slips:   ${commissionPayouts}`);
  console.log(`  Suspend audits (reason):   ${suspendAudit}`);
  console.log("\nVerification:");
  console.log(
    `  Matching mix: ${modeCounts.map((r) => `${r.matching_mode}=${r.n}`).join(" · ") || "(none)"}`,
  );
  console.log(`  Multi-location with sites: ${multiWithSites[0]?.n ?? 0}`);
  console.log(`  Merchants with settlement: ${withSettlement[0]?.n ?? 0}`);
  console.log(`  Mode S with xPub:          ${modeSWithXpub[0]?.n ?? 0}`);
  console.log(
    `  Service bills: ${billStats.map((r) => `${r.status}=${r.n}`).join(" · ") || "(none)"}`,
  );
  console.log(
    `  Commission payouts: ${payoutStats.map((r) => `${r.payer}/${r.payout_status}=${r.n}`).join(" · ") || "(none)"}`,
  );
  console.log("\nUI checks:");
  console.log("  Settlement → Mode / Scope follow B·C·D·S");
  console.log("  Addresses appear for every merchant; xPub only when Mode = S");
  console.log("  Sites → multi merchants list sites; single shows empty state");
  console.log("  Compliance → pending enterprise + payment anomalies");
  console.log("  Agents → Profile commission + payout address");
  console.log(
    "  Commissions → payout slips match paid bill volume fees × commission %",
  );
  console.log(
    "  Service bills → one row per merchant per calendar month (logic-bill-*)",
  );
  console.log(
    "\nTry: Load Shop 001-R1 (anomalies + enterprise) · Demo Agent (/agent/commissions sub-payouts)",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closePool());
