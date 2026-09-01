#!/usr/bin/env node
/**
 * Idempotent local review seed — platform + agent + merchant + login users.
 *
 * Password (all accounts): User123456!1 (12+ chars — API policy; base: User123456!)
 *
 * Platform:
 *   admin.platform@cryptogate.io          — Owner (+ Demo Agent owner)
 *   administrator.platform@cryptogate.io  — Administrator
 *   viewer.platform@cryptogate.io         — Viewer
 *
 * Agent (Demo Agent):
 *   administrator.agent@cryptogate.io     — Administrator
 *
 * Sub-agent (Demo Sub-Agent):
 *   administrator.subagent@cryptogate.io  — Administrator
 *
 * Single-location (Demo Merchant):
 *   owner.singlemerchant@cryptogate.io        — Owner
 *   administrator.singlemerchant@cryptogate.io — Administrator
 *   cashier1@cryptogate.io                    — Cashier
 *
 * Multi-location (Demo Retail Group):
 *   owner.multmerchant@cryptogate.io        — Owner (parent + sites)
 *   administrator.multmerchant@cryptogate.io — Administrator (parent)
 *   viewer.multmerchant@cryptogate.io       — Viewer (parent)
 *   cashier2@cryptogate.io                  — Cashier (Downtown Store site)
 *
 * Usage: node scripts/seed-local.mjs
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createUser, findUserByEmail } from "../apps/api/src/auth/users.mjs";

/** USDT network for seeds — Nile when CRYPTOGATE_CHAIN_ENV=testnet. */
function seedUsdtNetwork() {
  const env = (process.env.CRYPTOGATE_CHAIN_ENV || "").trim().toLowerCase();
  if (env === "testnet") return "tron_nile";
  const def = (process.env.DEFAULT_NETWORK || "tron").trim();
  return def || "tron";
}
import { hashPassword } from "../apps/api/src/auth/password-hash.mjs";
import { closePool } from "../apps/api/src/db/pool.mjs";
import { bootstrapMerchantCommercial } from "../apps/api/src/commercial/merchant-commercial-routes.mjs";
import { insertMembership } from "../apps/api/src/orgs/membership-store.mjs";
import { findPlatformOrg, insertOrgAccount } from "../apps/api/src/orgs/org-store.mjs";

/** Shared with load seeds — keep in sync when renaming accounts. */
export const SEED_PASSWORD = "User123456!1";
export const SEED_PLATFORM_OWNER_EMAIL = "admin.platform@cryptogate.io";

const SEED_EMAIL = {
  platformOwner: SEED_PLATFORM_OWNER_EMAIL,
  platformAdministrator: "administrator.platform@cryptogate.io",
  platformViewer: "viewer.platform@cryptogate.io",
  agentAdministrator: "administrator.agent@cryptogate.io",
  subAgentAdministrator: "administrator.subagent@cryptogate.io",
  singleMerchantOwner: "owner.singlemerchant@cryptogate.io",
  singleMerchantAdministrator: "administrator.singlemerchant@cryptogate.io",
  multiMerchantOwner: "owner.multmerchant@cryptogate.io",
  multiMerchantAdministrator: "administrator.multmerchant@cryptogate.io",
  multiMerchantViewer: "viewer.multmerchant@cryptogate.io",
  cashierSingle: "cashier1@cryptogate.io",
  cashierMultiSite: "cashier2@cryptogate.io",
};

const USERS = [
  {
    email: SEED_EMAIL.platformOwner,
    password: SEED_PASSWORD,
    label: "Platform Owner (+ Agent Owner)",
  },
  {
    email: SEED_EMAIL.platformAdministrator,
    password: SEED_PASSWORD,
    label: "Platform Administrator",
  },
  {
    email: SEED_EMAIL.platformViewer,
    password: SEED_PASSWORD,
    label: "Platform Viewer",
  },
  {
    email: SEED_EMAIL.agentAdministrator,
    password: SEED_PASSWORD,
    label: "Agent Administrator (Demo Agent)",
  },
  {
    email: SEED_EMAIL.subAgentAdministrator,
    password: SEED_PASSWORD,
    label: "Sub-agent Administrator (Demo Sub-Agent)",
  },
  {
    email: SEED_EMAIL.singleMerchantOwner,
    password: SEED_PASSWORD,
    label: "Single-location Merchant Owner",
  },
  {
    email: SEED_EMAIL.singleMerchantAdministrator,
    password: SEED_PASSWORD,
    label: "Single-location Merchant Administrator",
  },
  {
    email: SEED_EMAIL.multiMerchantOwner,
    password: SEED_PASSWORD,
    label: "Multi-location Merchant Owner",
  },
  {
    email: SEED_EMAIL.multiMerchantAdministrator,
    password: SEED_PASSWORD,
    label: "Multi-location Merchant Administrator",
  },
  {
    email: SEED_EMAIL.multiMerchantViewer,
    password: SEED_PASSWORD,
    label: "Multi-location Merchant Viewer",
  },
  {
    email: SEED_EMAIL.cashierSingle,
    password: SEED_PASSWORD,
    label: "Cashier — Demo Merchant",
  },
  {
    email: SEED_EMAIL.cashierMultiSite,
    password: SEED_PASSWORD,
    label: "Cashier — Downtown Store (multi)",
  },
];

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

async function ensureUser(email, password) {
  const existing = await findUserByEmail(email);
  if (existing) {
    await resetPassword(existing.id, password);
    return existing;
  }
  const created = await createUser({ email, password });
  await resetPassword(created.id, password);
  return created;
}

async function resetPassword(userId, password) {
  const passwordHash = await hashPassword(password);
  const pool = (await import("../apps/api/src/db/pool.mjs")).getPool();
  await pool.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [
    userId,
    passwordHash,
  ]);
}

async function ensureMembership(orgId, userId, role) {
  const pool = (await import("../apps/api/src/db/pool.mjs")).getPool();
  const { rows } = await pool.query(
    `SELECT 1 FROM org_memberships WHERE org_id = $1 AND user_id = $2`,
    [orgId, userId],
  );
  if (rows.length === 0) {
    await insertMembership({ orgId, userId, role });
  }
}

async function ensureDisplayName(userId, displayName) {
  const pool = (await import("../apps/api/src/db/pool.mjs")).getPool();
  await pool.query(
    `UPDATE users SET display_name = $2 WHERE id = $1 AND (display_name IS NULL OR display_name = '')`,
    [userId, displayName],
  );
}

function fakeAddress(seed) {
  const hex = createHash("sha256").update(String(seed)).digest("hex");
  return `T${hex.slice(0, 33)}`;
}

function daysAgo(days, hours = 0) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - hours);
  return d;
}

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

function utcPeriodKey(monthsBack) {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMonth(d.getUTCMonth() - monthsBack);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function periodLabel(periodKey) {
  const [yRaw, mRaw] = periodKey.split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    return periodKey;
  }
  return `${MONTH_LABELS[m - 1]} ${y}`;
}

/**
 * Demo commission invoices for platform / agent / sub-agent review.
 * Status mix matches Current vs History queues:
 *   platform → agent: issued | paid | settled
 *   agent → sub:      issued after parent received; paid; settled
 * @param {import("pg").Pool} pool
 */
async function seedCommissionReviewFixtures(pool, {
  agentId,
  subAgentId,
  agentPayoutAddress,
  subPayoutAddress,
}) {
  const { rows: table } = await pool.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'commission_payouts'
     LIMIT 1`,
  );
  if (table.length === 0) {
    console.warn(
      "  Skipping commission review fixtures — commission_payouts missing",
    );
    return 0;
  }

  const plans = [
    {
      monthsBack: 0,
      payer: "platform",
      payee: "agent",
      status: "issued",
      fee: "150.00",
      pct: "15",
      amount: "22.50",
    },
    {
      monthsBack: 1,
      payer: "platform",
      payee: "agent",
      status: "paid",
      fee: "150.00",
      pct: "15",
      amount: "22.50",
    },
    {
      monthsBack: 2,
      payer: "platform",
      payee: "agent",
      status: "settled",
      fee: "140.00",
      pct: "15",
      amount: "21.00",
    },
    {
      monthsBack: 1,
      payer: "agent",
      payee: "sub",
      status: "issued",
      fee: "50.00",
      pct: "10",
      amount: "5.00",
    },
    {
      monthsBack: 2,
      payer: "agent",
      payee: "sub",
      status: "paid",
      fee: "45.00",
      pct: "10",
      amount: "4.50",
    },
    {
      monthsBack: 3,
      payer: "agent",
      payee: "sub",
      status: "settled",
      fee: "40.00",
      pct: "10",
      amount: "4.00",
    },
  ];

  let n = 0;
  for (const plan of plans) {
    const periodKey = utcPeriodKey(plan.monthsBack);
    const payeeOrgId = plan.payee === "agent" ? agentId : subAgentId;
    const payeeName = plan.payee === "agent" ? "Demo Agent" : "Demo Sub-Agent";
    const payerOrgId = plan.payer === "agent" ? agentId : null;
    const dest =
      plan.payee === "agent" ? agentPayoutAddress : subPayoutAddress;
    const terminal =
      plan.status === "paid" ||
      plan.status === "settled" ||
      plan.status === "verifying";
    const paidAt =
      plan.status === "paid" || plan.status === "settled"
        ? daysAgo(4 + plan.monthsBack).toISOString()
        : null;
    const settledAt =
      plan.status === "settled" ? daysAgo(2 + plan.monthsBack).toISOString() : null;
    const txRef = terminal
      ? `seed-${plan.payer}-${payeeOrgId.slice(0, 8)}-${periodKey}`
      : null;
    const paymentLink =
      plan.payer === "platform"
        ? `/platform/commissions?payee=${encodeURIComponent(payeeOrgId)}&period=${encodeURIComponent(periodKey)}`
        : `/agent/commissions?payee=${encodeURIComponent(payeeOrgId)}&period=${encodeURIComponent(periodKey)}`;

    const findSql =
      plan.payer === "platform"
        ? `SELECT id FROM commission_payouts
           WHERE payer = 'platform' AND payee_org_id = $1 AND period_key = $2
           LIMIT 1`
        : `SELECT id FROM commission_payouts
           WHERE payer = 'agent'
             AND payer_org_id = $1
             AND payee_org_id = $2
             AND period_key = $3
           LIMIT 1`;
    const findParams =
      plan.payer === "platform"
        ? [payeeOrgId, periodKey]
        : [payerOrgId, payeeOrgId, periodKey];
    const { rows: existing } = await pool.query(findSql, findParams);

    if (existing[0]) {
      await pool.query(
        `UPDATE commission_payouts
         SET payee_name = $2,
             period_label = $3,
             platform_fee_collected = $4,
             commission_percent = $5,
             commission_amount = $6,
             payout_status = $7,
             payout_address = $8,
             asset = 'USDT',
             network = $13,
             payment_link = $9,
             tx_ref = $10,
             paid_at = $11,
             settled_at = $12,
             updated_at = now()
         WHERE id = $1`,
        [
          existing[0].id,
          payeeName,
          periodLabel(periodKey),
          plan.fee,
          plan.pct,
          plan.amount,
          plan.status,
          dest,
          paymentLink,
          txRef,
          paidAt,
          settledAt,
          seedUsdtNetwork(),
        ],
      );
    } else {
      await pool.query(
        `INSERT INTO commission_payouts (
           payee_org_id, payee_name, payer, payer_org_id,
           period_key, period_label, platform_fee_collected, commission_percent,
           commission_amount, payout_status, payout_address, asset, network,
           payment_link, tx_ref, paid_at, settled_at
         ) VALUES (
           $1, $2, $3, $4,
           $5, $6, $7, $8,
           $9, $10, $11, 'USDT', $12,
           $13, $14, $15, $16
         )`,
        [
          payeeOrgId,
          payeeName,
          plan.payer,
          payerOrgId,
          periodKey,
          periodLabel(periodKey),
          plan.fee,
          plan.pct,
          plan.amount,
          plan.status,
          dest,
          seedUsdtNetwork(),
          paymentLink,
          txRef,
          paidAt,
          settledAt,
        ],
      );
    }
    n += 1;
  }

  const keepPlatformKeys = [
    ...new Set(
      plans
        .filter((p) => p.payer === "platform")
        .map((p) => utcPeriodKey(p.monthsBack)),
    ),
  ];
  const keepAgentKeys = [
    ...new Set(
      plans
        .filter((p) => p.payer === "agent")
        .map((p) => utcPeriodKey(p.monthsBack)),
    ),
  ];
  await pool.query(
    `DELETE FROM commission_payouts
     WHERE payer = 'platform'
       AND payee_org_id = $1
       AND NOT (period_key = ANY($2::text[]))`,
    [agentId, keepPlatformKeys],
  );
  await pool.query(
    `DELETE FROM commission_payouts
     WHERE payer = 'platform' AND payee_org_id = $1`,
    [subAgentId],
  );
  await pool.query(
    `DELETE FROM commission_payouts
     WHERE payer = 'agent'
       AND payer_org_id = $1
       AND payee_org_id = $2
       AND NOT (period_key = ANY($3::text[]))`,
    [agentId, subAgentId, keepAgentKeys],
  );

  return n;
}

/**
 * Demo Merchant portal fixtures — matching, settlement, cashier payment orders.
 * @param {import("pg").Pool} pool
 */
const MULTI_MERCHANT_NAME = "Demo Retail Group";
const MULTI_MERCHANT_SITES = [
  "Downtown Store",
  "Airport Kiosk",
  "Marina Branch",
];

/**
 * Multi-location merchant — parent org + site children + sample site-scoped orders.
 * @param {import("pg").Pool} pool
 */
async function seedMultiLocationMerchant(pool, {
  agentId,
  siteCashierUserId,
  platformOwnerId,
}) {
  const { rows: merchants } = await pool.query(
    `SELECT id, structure FROM org_accounts
     WHERE type = 'merchant' AND name = $1 LIMIT 1`,
    [MULTI_MERCHANT_NAME],
  );
  let merchantId = merchants[0]?.id;
  if (!merchantId) {
    const created = await insertOrgAccount({
      type: "merchant",
      name: MULTI_MERCHANT_NAME,
      parentId: agentId,
      structure: "multi_location",
      maxAgentDepth: null,
    });
    if (!created.ok) throw new Error("could not create multi-location merchant");
    merchantId = created.row.id;
    await bootstrapMerchantCommercial({
      orgId: merchantId,
      tier: "mid",
      volumeFeePercent: "1.2",
      actorUserId: platformOwnerId,
    });
  } else if (merchants[0].structure !== "multi_location") {
    await pool.query(
      `UPDATE org_accounts SET structure = 'multi_location', updated_at = now()
       WHERE id = $1 AND structure IS DISTINCT FROM 'multi_location'`,
      [merchantId],
    );
  }

  await pool.query(
    `UPDATE org_accounts
     SET country = COALESCE(NULLIF(country, ''), 'SG'),
         updated_at = now()
     WHERE id = $1`,
    [merchantId],
  );

  await pool.query(
    `INSERT INTO merchant_matching_settings (org_id, matching_mode)
     VALUES ($1, 'B')
     ON CONFLICT (org_id) DO NOTHING`,
    [merchantId],
  );

  const settlementAddr = fakeAddress(`demo-retail-settlement-${merchantId}`);
  await pool.query(
    `INSERT INTO settlement_addresses (org_id, asset, network, address)
     VALUES ($1, 'USDT', $3, $2)
     ON CONFLICT (org_id, asset, network) DO NOTHING`,
    [merchantId, settlementAddr, seedUsdtNetwork()],
  );

  /** @type {Map<string, string>} site name → org id */
  const siteIds = new Map();
  for (const siteName of MULTI_MERCHANT_SITES) {
    const { rows: existing } = await pool.query(
      `SELECT id FROM org_accounts
       WHERE type = 'merchant_site' AND parent_id = $1 AND name = $2 LIMIT 1`,
      [merchantId, siteName],
    );
    if (existing[0]?.id) {
      siteIds.set(siteName, existing[0].id);
      continue;
    }
    const site = await insertOrgAccount({
      type: "merchant_site",
      name: siteName,
      parentId: merchantId,
      structure: null,
      maxAgentDepth: null,
    });
    if (!site.ok && site.code !== "duplicate_sibling_name") {
      throw new Error(`site ${siteName}: ${site.code ?? "unknown"}`);
    }
    if (site.ok) siteIds.set(siteName, site.row.id);
  }

  for (const siteName of ["Downtown Store", "Airport Kiosk", "Marina Branch"]) {
    const siteId = siteIds.get(siteName);
    if (!siteId) continue;
    await pool.query(
      `UPDATE org_accounts
       SET country = COALESCE(NULLIF(country, ''), 'SG'),
           updated_at = now()
       WHERE id = $1`,
      [siteId],
    );
  }

  const downtownId = siteIds.get("Downtown Store");
  if (downtownId) {
    await ensureMembership(downtownId, siteCashierUserId, "cashier");
  }

  const orderPlans = [
    { orgKey: "parent", status: "completed", amount: "310.00", days: 2, n: 0 },
    { orgKey: "parent", status: "pending_payment", amount: "55.00", days: 0, n: 1 },
    {
      orgKey: "Downtown Store",
      status: "completed",
      amount: "89.50",
      days: 1,
      n: 2,
    },
    {
      orgKey: "Downtown Store",
      status: "verifying",
      amount: "120.00",
      days: 0,
      n: 3,
    },
    {
      orgKey: "Airport Kiosk",
      status: "completed",
      amount: "44.00",
      days: 4,
      n: 4,
    },
    {
      orgKey: "Marina Branch",
      status: "expired",
      amount: "72.25",
      days: 10,
      n: 5,
    },
  ];

  for (const plan of orderPlans) {
    const orgId =
      plan.orgKey === "parent" ? merchantId : siteIds.get(plan.orgKey);
    if (!orgId) continue;

    const idem = `demo-multi-${orgId}-${plan.n}`;
    const { rows: dup } = await pool.query(
      `SELECT 1 FROM payment_orders WHERE org_id = $1 AND idempotency_key = $2 LIMIT 1`,
      [orgId, idem],
    );
    if (dup.length) continue;

    const bodyHash = createHash("sha256").update(idem).digest("hex");
    const createdAt = daysAgo(plan.days, plan.n);
    const expiresAt = new Date(createdAt.getTime() + 30 * 60 * 1000);
    const address = fakeAddress(`${orgId}-multi-order-${plan.n}`);
    const isCompleted = plan.status === "completed";
    const isVerifying = plan.status === "verifying";

    await pool.query(
      `INSERT INTO payment_orders (
         org_id, created_by, order_number, status, matching_mode,
         payable_amount, receive_address, address_source, hd_index, memo_or_tag,
         asset, network, expires_at, required_confirmations,
         idempotency_key, idempotency_body_hash, merchant_metadata,
         created_at, updated_at,
         received_amount, tx_hash, confirmations
       ) VALUES (
         $1, $2,
         'CG-MULTI-' || lpad(nextval('payment_orders_order_number_seq')::text, 8, '0'),
         $3, 'B', $4, $5, 'main', NULL, NULL,
         'USDT', '${seedUsdtNetwork()}', $6, 19,
         $7, $8, $9::jsonb,
         $10, $10,
         $11, $12, $13
       )`,
      [
        orgId,
        siteCashierUserId,
        plan.status,
        plan.amount,
        address,
        expiresAt.toISOString(),
        idem,
        bodyHash,
        JSON.stringify({
          seed: "demo-multi",
          site: plan.orgKey === "parent" ? null : plan.orgKey,
        }),
        createdAt.toISOString(),
        isCompleted || isVerifying ? plan.amount : null,
        isCompleted || isVerifying
          ? `0x${createHash("sha256").update(idem).digest("hex")}`
          : null,
        isCompleted ? 19 : isVerifying ? 3 : 0,
      ],
    );
  }

  return merchantId;
}

async function seedDemoMerchantPortal(pool, {
  merchantId,
  cashierUserId,
  cashierEmail,
  platformOwnerId,
}) {
  await pool.query(
    `UPDATE org_accounts
     SET country = COALESCE(NULLIF(country, ''), 'SG'),
         updated_at = now()
     WHERE id = $1`,
    [merchantId],
  );

  await pool.query(
    `INSERT INTO merchant_matching_settings (org_id, matching_mode)
     VALUES ($1, 'B')
     ON CONFLICT (org_id) DO UPDATE
       SET matching_mode = EXCLUDED.matching_mode,
           updated_at = now()
     WHERE merchant_matching_settings.matching_mode IS DISTINCT FROM EXCLUDED.matching_mode`,
    [merchantId],
  );

  const settlementAddr = fakeAddress(`demo-merchant-settlement-${merchantId}`);
  await pool.query(
    `INSERT INTO settlement_addresses (org_id, asset, network, address)
     VALUES ($1, 'USDT', $3, $2)
     ON CONFLICT (org_id, asset, network) DO NOTHING`,
    [merchantId, settlementAddr, seedUsdtNetwork()],
  );

  const orderPlans = [
    { status: "pending_payment", amount: "42.50", days: 0, n: 0 },
    { status: "verifying", amount: "88.00", days: 1, n: 1 },
    { status: "completed", amount: "125.75", days: 3, n: 2 },
    { status: "completed", amount: "256.00", days: 7, n: 3 },
    { status: "expired", amount: "19.99", days: 14, n: 4 },
    { status: "payment_anomaly", amount: "60.00", days: 2, n: 5 },
  ];

  for (const plan of orderPlans) {
    const idem = `demo-order-${merchantId}-${plan.n}`;
    const { rows: dup } = await pool.query(
      `SELECT 1 FROM payment_orders WHERE org_id = $1 AND idempotency_key = $2 LIMIT 1`,
      [merchantId, idem],
    );
    if (dup.length) continue;

    const bodyHash = createHash("sha256").update(idem).digest("hex");
    const createdAt = daysAgo(plan.days, plan.n);
    const expiresAt = new Date(createdAt.getTime() + 30 * 60 * 1000);
    const address = fakeAddress(`${merchantId}-order-${plan.n}`);
    const isCompleted = plan.status === "completed";
    const isVerifying = plan.status === "verifying";
    const isAnomaly = plan.status === "payment_anomaly";

    await pool.query(
      `INSERT INTO payment_orders (
         org_id, created_by, order_number, status, matching_mode,
         payable_amount, receive_address, address_source, hd_index, memo_or_tag,
         asset, network, expires_at, required_confirmations,
         idempotency_key, idempotency_body_hash, merchant_metadata,
         created_at, updated_at,
         received_amount, tx_hash, confirmations
       ) VALUES (
         $1, $2,
         'CG-DEMO-' || lpad(nextval('payment_orders_order_number_seq')::text, 8, '0'),
         $3, 'B', $4, $5, 'main', NULL, NULL,
         'USDT', '${seedUsdtNetwork()}', $6, 19,
         $7, $8, '{"seed":"demo-merchant"}'::jsonb,
         $9, $9,
         $10, $11, $12
       )`,
      [
        merchantId,
        cashierUserId,
        plan.status,
        plan.amount,
        address,
        expiresAt.toISOString(),
        idem,
        bodyHash,
        createdAt.toISOString(),
        isCompleted || isVerifying || isAnomaly ? plan.amount : null,
        isCompleted || isVerifying || isAnomaly
          ? `0x${createHash("sha256").update(idem).digest("hex")}`
          : null,
        isCompleted ? 19 : isVerifying ? 3 : 0,
      ],
    );
  }

  const { rows: auditDup } = await pool.query(
    `SELECT 1 FROM audit_log
     WHERE org_id = $1 AND action = 'org_user_invite'
       AND metadata->>'email' = $2
     LIMIT 1`,
    [merchantId, cashierEmail],
  );
  if (auditDup.length === 0) {
    await pool.query(
      `INSERT INTO audit_log (actor_user_id, org_id, action, metadata)
       VALUES ($1, $2, 'org_user_invite', $3::jsonb)`,
      [
        platformOwnerId,
        merchantId,
        JSON.stringify({
          email: cashierEmail,
          role: "cashier",
          seed: "demo-merchant",
        }),
      ],
    );
  }
}

async function main() {
  loadEnv();
  const platformOwner = await ensureUser(
    SEED_EMAIL.platformOwner,
    SEED_PASSWORD,
  );
  const platformViewer = await ensureUser(
    SEED_EMAIL.platformViewer,
    SEED_PASSWORD,
  );
  const platformAdministrator = await ensureUser(
    SEED_EMAIL.platformAdministrator,
    SEED_PASSWORD,
  );
  const agentAdministrator = await ensureUser(
    SEED_EMAIL.agentAdministrator,
    SEED_PASSWORD,
  );
  const subAgentAdministrator = await ensureUser(
    SEED_EMAIL.subAgentAdministrator,
    SEED_PASSWORD,
  );
  const merchantOwner = await ensureUser(
    SEED_EMAIL.singleMerchantOwner,
    SEED_PASSWORD,
  );
  const merchantAdministrator = await ensureUser(
    SEED_EMAIL.singleMerchantAdministrator,
    SEED_PASSWORD,
  );
  const cashier = await ensureUser(SEED_EMAIL.cashierSingle, SEED_PASSWORD);
  const multiMerchantOwner = await ensureUser(
    SEED_EMAIL.multiMerchantOwner,
    SEED_PASSWORD,
  );
  const multiMerchantAdministrator = await ensureUser(
    SEED_EMAIL.multiMerchantAdministrator,
    SEED_PASSWORD,
  );
  const multiMerchantViewer = await ensureUser(
    SEED_EMAIL.multiMerchantViewer,
    SEED_PASSWORD,
  );
  const siteCashier = await ensureUser(
    SEED_EMAIL.cashierMultiSite,
    SEED_PASSWORD,
  );

  let platform = await findPlatformOrg();
  if (!platform) {
    const created = await insertOrgAccount({
      type: "platform",
      name: "CryptoGate Local",
      parentId: null,
      structure: null,
      maxAgentDepth: 2,
    });
    if (!created.ok) throw new Error("could not create platform org");
    platform = created.row;
  }
  await ensureMembership(platform.id, platformOwner.id, "owner");
  await ensureMembership(platform.id, platformAdministrator.id, "administrator");
  await ensureMembership(platform.id, platformViewer.id, "viewer");

  const pool = (await import("../apps/api/src/db/pool.mjs")).getPool();
  const { rows: agents } = await pool.query(
    `SELECT id FROM org_accounts WHERE type = 'agent' AND name = 'Demo Agent' LIMIT 1`,
  );
  let agentId = agents[0]?.id;
  if (!agentId) {
    const created = await insertOrgAccount({
      type: "agent",
      name: "Demo Agent",
      parentId: platform.id,
      structure: null,
      maxAgentDepth: null,
    });
    if (!created.ok) throw new Error("could not create agent org");
    agentId = created.row.id;
  }
  await ensureMembership(agentId, platformOwner.id, "owner");
  await ensureMembership(agentId, agentAdministrator.id, "administrator");

  const { rows: subAgents } = await pool.query(
    `SELECT id FROM org_accounts WHERE type = 'agent_sub' AND name = 'Demo Sub-Agent' LIMIT 1`,
  );
  let subAgentId = subAgents[0]?.id;
  if (!subAgentId) {
    const created = await insertOrgAccount({
      type: "agent_sub",
      name: "Demo Sub-Agent",
      parentId: agentId,
      structure: null,
      maxAgentDepth: null,
    });
    if (!created.ok) throw new Error("could not create sub-agent org");
    subAgentId = created.row.id;
  }
  await ensureMembership(subAgentId, platformOwner.id, "owner");
  await ensureMembership(subAgentId, subAgentAdministrator.id, "administrator");

  const { rows: merchants } = await pool.query(
    `SELECT id FROM org_accounts WHERE type = 'merchant' AND name = 'Demo Merchant' LIMIT 1`,
  );
  let merchantId = merchants[0]?.id;
  if (!merchantId) {
    const created = await insertOrgAccount({
      type: "merchant",
      name: "Demo Merchant",
      parentId: agentId,
      structure: "single_location",
      maxAgentDepth: null,
    });
    if (!created.ok) throw new Error("could not create merchant org");
    merchantId = created.row.id;
    await bootstrapMerchantCommercial({
      orgId: merchantId,
      tier: "mid",
      volumeFeePercent: "1.2",
      actorUserId: platformOwner.id,
    });
  }
  await ensureMembership(merchantId, merchantOwner.id, "owner");
  await ensureMembership(merchantId, merchantAdministrator.id, "administrator");
  await ensureMembership(merchantId, cashier.id, "cashier");
  await ensureDisplayName(merchantOwner.id, "Single Merchant Owner");
  await ensureDisplayName(merchantAdministrator.id, "Single Merchant Admin");
  await ensureDisplayName(cashier.id, "Cashier One");
  await ensureDisplayName(platformOwner.id, "Platform Owner");
  await ensureDisplayName(platformAdministrator.id, "Platform Administrator");
  await ensureDisplayName(agentAdministrator.id, "Agent Administrator");
  await ensureDisplayName(subAgentAdministrator.id, "Sub-Agent Administrator");

  await seedDemoMerchantPortal(pool, {
    merchantId,
    cashierUserId: cashier.id,
    cashierEmail: SEED_EMAIL.cashierSingle,
    platformOwnerId: platformOwner.id,
  });

  const multiMerchantId = await seedMultiLocationMerchant(pool, {
    agentId,
    siteCashierUserId: siteCashier.id,
    platformOwnerId: platformOwner.id,
  });
  await ensureMembership(multiMerchantId, multiMerchantOwner.id, "owner");
  await ensureMembership(
    multiMerchantId,
    multiMerchantAdministrator.id,
    "administrator",
  );
  await ensureMembership(multiMerchantId, multiMerchantViewer.id, "viewer");
  await ensureDisplayName(multiMerchantOwner.id, "Multi Merchant Owner");
  await ensureDisplayName(
    multiMerchantAdministrator.id,
    "Multi Merchant Admin",
  );
  await ensureDisplayName(multiMerchantViewer.id, "Multi Merchant Viewer");
  await ensureDisplayName(siteCashier.id, "Cashier Two");

  const { rows: subMerchants } = await pool.query(
    `SELECT id FROM org_accounts WHERE type = 'merchant' AND name = 'Demo Sub Merchant' LIMIT 1`,
  );
  let subMerchantId = subMerchants[0]?.id;
  if (!subMerchantId) {
    const created = await insertOrgAccount({
      type: "merchant",
      name: "Demo Sub Merchant",
      parentId: subAgentId,
      structure: "single_location",
      maxAgentDepth: null,
    });
    if (!created.ok) throw new Error("could not create sub-merchant org");
    subMerchantId = created.row.id;
    await bootstrapMerchantCommercial({
      orgId: subMerchantId,
      tier: "small",
      volumeFeePercent: "1.8",
      actorUserId: platformOwner.id,
    });
  }

  // Commission % + payout addresses for agent / sub-agent commission UI tests.
  const effectiveFrom = new Date();
  effectiveFrom.setUTCDate(1);
  const effectiveFromDate = effectiveFrom.toISOString().slice(0, 10);
  for (const [orgId, pct] of [
    [agentId, "15"],
    [subAgentId, "10"],
  ]) {
    await pool.query(
      `INSERT INTO agent_commission (org_id, commission_percent, effective_from)
       VALUES ($1, $2, $3::date)
       ON CONFLICT (org_id) DO UPDATE
         SET commission_percent = EXCLUDED.commission_percent,
             updated_at = now()`,
      [orgId, pct, effectiveFromDate],
    );
    await pool.query(
      `INSERT INTO agent_payout_addresses (org_id, asset, network, address)
       VALUES ($1, 'USDT', $3, $2)
       ON CONFLICT (org_id) DO NOTHING`,
      [
        orgId,
        orgId === agentId ? "TDemoAgentPayoutSeed0001" : "TDemoSubAgentPaySeed01",
        seedUsdtNetwork(),
      ],
    );
  }

  // Paid volume fees for commission statement math (prefix demo-bill-).
  const { rows: billingRows } = await pool.query(
    `SELECT pay_to FROM platform_billing_settings WHERE id = 1`,
  );
  const platformPayTo =
    billingRows[0]?.pay_to != null && String(billingRows[0].pay_to).trim()
      ? String(billingRows[0].pay_to).trim()
      : process.env.PLATFORM_BILLING_PAY_TO?.trim() || null;

  const demoBillMerchants = [
    { id: merchantId, fee: "100.00", sub: "49.00" },
    { id: subMerchantId, fee: "50.00", sub: "29.00" },
  ];
  for (const row of demoBillMerchants) {
    for (const plan of [
      { monthsBack: 0, status: "paid", feeKey: "fee" },
      { monthsBack: 1, status: "paid", feeKey: "fee" },
      { monthsBack: 2, status: "issued", feeKey: "fee", feeOverride: "12.00" },
    ]) {
      const end = new Date();
      end.setUTCMonth(end.getUTCMonth() - plan.monthsBack);
      end.setUTCDate(28);
      const start = new Date(end);
      start.setUTCDate(1);
      const periodStart = start.toISOString().slice(0, 10);
      const ref = `demo-bill-${row.id.slice(0, 8)}-${plan.monthsBack}-${plan.status}`;
      const { rows: dup } = await pool.query(
        `SELECT 1 FROM service_bills
         WHERE payment_reference = $1
            OR (org_id = $2 AND period_start = $3::date AND status <> 'voided')
         LIMIT 1`,
        [ref, row.id, periodStart],
      );
      if (dup.length) continue;
      const due = new Date(end);
      due.setUTCDate(due.getUTCDate() + 14);
      const paidAt =
        plan.status === "paid"
          ? new Date(end.getTime() + 2 * 24 * 60 * 60 * 1000)
          : null;
      const fee = plan.feeOverride ?? row[plan.feeKey];
      const sub = row.sub;
      const total = (Number(sub) + Number(fee)).toFixed(2);
      await pool.query(
        `INSERT INTO service_bills (
           org_id, period_start, period_end,
           subscription_amount, volume_fee_amount, total_amount,
           currency, status, due_at, paid_at, payment_reference,
           rx_address,
           created_at, updated_at
         ) VALUES (
           $1, $2::date, $3::date,
           $4, $5, $6,
           'USD', $7, $8, $9, $10,
           $11,
           now(), now()
         )`,
        [
          row.id,
          periodStart,
          end.toISOString().slice(0, 10),
          sub,
          fee,
          total,
          plan.status,
          due.toISOString(),
          paidAt ? paidAt.toISOString() : null,
          ref,
          plan.status === "paid" ? platformPayTo : null,
        ],
      );
    }
  }

  const reviewPayouts = await seedCommissionReviewFixtures(pool, {
    agentId,
    subAgentId,
    agentPayoutAddress: "TDemoAgentPayoutSeed0001",
    subPayoutAddress: "TDemoSubAgentPaySeed01",
  });
  if (reviewPayouts) {
    console.log(`  Commission review invoices: ${reviewPayouts}`);
  }

  console.log(`  Password (all): ${SEED_PASSWORD}\n`);
  console.log(
    "  Portal        Role            Email                              Org",
  );
  console.log(
    "  ------------  --------------  ---------------------------------  -------------------",
  );
  const rows = [
    ["Platform", "Owner", SEED_EMAIL.platformOwner, "CryptoGate Local"],
    [
      "Platform",
      "Administrator",
      SEED_EMAIL.platformAdministrator,
      "CryptoGate Local",
    ],
    ["Platform", "Viewer", SEED_EMAIL.platformViewer, "CryptoGate Local"],
    ["Agent", "Owner*", SEED_EMAIL.platformOwner, "Demo Agent"],
    ["Agent", "Administrator", SEED_EMAIL.agentAdministrator, "Demo Agent"],
    [
      "Sub-agent",
      "Administrator",
      SEED_EMAIL.subAgentAdministrator,
      "Demo Sub-Agent",
    ],
    ["Merchant", "Owner", SEED_EMAIL.singleMerchantOwner, "Demo Merchant"],
    [
      "Merchant",
      "Administrator",
      SEED_EMAIL.singleMerchantAdministrator,
      "Demo Merchant",
    ],
    ["Merchant", "Cashier", SEED_EMAIL.cashierSingle, "Demo Merchant"],
    ["Merchant", "Owner", SEED_EMAIL.multiMerchantOwner, "Demo Retail Group"],
    [
      "Merchant",
      "Administrator",
      SEED_EMAIL.multiMerchantAdministrator,
      "Demo Retail Group",
    ],
    ["Merchant", "Viewer", SEED_EMAIL.multiMerchantViewer, "Demo Retail Group"],
    [
      "Merchant",
      "Cashier",
      SEED_EMAIL.cashierMultiSite,
      "Downtown Store (site)",
    ],
  ];
  for (const [portal, role, email, org] of rows) {
    console.log(
      `  ${portal.padEnd(12)}  ${role.padEnd(14)}  ${email.padEnd(33)}  ${org}`,
    );
  }
  console.log("\n  * admin.platform also owns Demo Agent / Demo Sub-Agent");
  console.log("\nCommission review:");
  console.log("  Platform   /platform/commissions   (admin.platform / administrator.platform)");
  console.log("  Platform   https://platform-cg.boostbunny.io/  (admin.platform@cryptogate.io)");
  console.log("  Agent      https://agent-cg.boostbunny.io/      (administrator.agent@cryptogate.io)");
  console.log("  Sub-agent  https://agent-cg.boostbunny.io/      (administrator.subagent@cryptogate.io)");
  console.log("  Merchant   https://merchant-cg.boostbunny.io/  (owner.singlemerchant@cryptogate.io)");
  console.log("\nPortals (web dev server):");
  console.log("  Platform  http://127.0.0.1:5174/platform");
  console.log("  Agent     http://127.0.0.1:5174/agent");
  console.log("  Merchant  http://127.0.0.1:5174/merchant");
  console.log("\nOptional: node scripts/seed-load-platform-logic.mjs");
  console.log("\nAPI health: http://127.0.0.1:3000/health");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closePool());
