#!/usr/bin/env node
/**
 * Bulk local load seed — 100 agents, 100 sub-agents, 100 merchants,
 * each merchant with a cashier + payment-order / audit history.
 * Every 5th merchant is multi_location with one merchant_site child.
 *
 * Hierarchy (Phase 1 depth 2):
 *   Platform → Load Agent N → Load Sub-Agent N
 *   Merchant N parent = Sub-Agent N when N even, else Agent N
 *   → each agent subtree starts with exactly 1 merchant account
 *
 * For denser Accounts tree (extra desks + shops):
 *   node scripts/seed-load-accounts-rich.mjs
 * For ~50 merchants on Agent 001 / 010 (scroll test):
 *   node scripts/seed-load-accounts-bulk.mjs
 * For matching / settlement / xPub / commission / enterprise:
 *   node scripts/seed-load-platform-logic.mjs
 *
 * Idempotent: skips when "Load Agent 001" already exists.
 * Prerequisites: run `node scripts/seed-local.mjs` first (platform + owner).
 *
 * Usage: node scripts/seed-load-orgs.mjs
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "../apps/api/src/auth/password-hash.mjs";
import { findUserByEmail } from "../apps/api/src/auth/users.mjs";
import { bootstrapMerchantCommercial } from "../apps/api/src/commercial/merchant-commercial-routes.mjs";
import { closePool, getPool } from "../apps/api/src/db/pool.mjs";
import { insertMembership } from "../apps/api/src/orgs/membership-store.mjs";
import { findPlatformOrg, insertOrgAccount } from "../apps/api/src/orgs/org-store.mjs";
import { SEED_PLATFORM_OWNER_EMAIL } from "./seed-local.mjs";

const COUNT = 100;
const PREFIX = "Load";
const CASHIER_PASSWORD = "LoadTest1!ab";
const STATUSES = [
  "pending_payment",
  "verifying",
  "completed",
  "completed",
  "completed",
  "expired",
  "payment_anomaly",
];
const ASSETS = [
  { asset: "USDT", network: "tron" },
  { asset: "USDT", network: "ethereum" },
  { asset: "USDC", network: "polygon" },
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
      "postgres://paymentgate:paymentgate@localhost:5432/paymentgate";
  }
}

function pad(n) {
  return String(n).padStart(3, "0");
}

function agentName(n) {
  return `${PREFIX} Agent ${pad(n)}`;
}

function subAgentName(n) {
  return `${PREFIX} Sub-Agent ${pad(n)}`;
}

function merchantName(n) {
  return `${PREFIX} Merchant ${pad(n)}`;
}

function cashierEmail(n) {
  return `cashier.load${pad(n)}@local.paymentgate`;
}

function daysAgo(days, jitterHours = 0) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - jitterHours);
  return d;
}

function fakeAddress(seed) {
  const hex = createHash("sha256").update(String(seed)).digest("hex");
  return `T${hex.slice(0, 33)}`;
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

async function insertUserWithHash(email, passwordHash) {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id, email`,
    [email, passwordHash],
  );
  return rows[0];
}

async function insertOrder(pool, {
  orgId,
  createdBy,
  status,
  amount,
  asset,
  network,
  address,
  createdAt,
  n,
}) {
  const idem = `load-seed-${orgId}-${n}`;
  const bodyHash = createHash("sha256").update(idem).digest("hex");
  const expiresAt = new Date(createdAt.getTime() + 30 * 60 * 1000);
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
       'CG-LOAD-' || lpad(nextval('payment_orders_order_number_seq')::text, 8, '0'),
       $3, 'B', $4, $5, 'main', NULL, NULL,
       $6, $7, $8, 19,
       $9, $10, '{}'::jsonb,
       $11, $11,
       $12, $13, $14
     )
     ON CONFLICT (org_id, idempotency_key) DO NOTHING`,
    [
      orgId,
      createdBy,
      status,
      amount,
      address,
      asset,
      network,
      expiresAt.toISOString(),
      idem,
      bodyHash,
      createdAt.toISOString(),
      status === "completed" ? amount : null,
      status === "completed" || status === "verifying"
        ? `0x${createHash("sha256").update(idem).digest("hex")}`
        : null,
      status === "completed" ? 19 : status === "verifying" ? 3 : 0,
    ],
  );
}

async function insertAudit(pool, { actorUserId, orgId, action, metadata, createdAt }) {
  await pool.query(
    `INSERT INTO audit_log (actor_user_id, org_id, action, metadata, created_at)
     VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [
      actorUserId,
      orgId,
      action,
      JSON.stringify(metadata ?? {}),
      createdAt.toISOString(),
    ],
  );
}

async function main() {
  loadEnv();
  const pool = getPool();

  const platformOwner = await findUserByEmail(SEED_PLATFORM_OWNER_EMAIL);
  if (!platformOwner) {
    throw new Error(
      `Missing ${SEED_PLATFORM_OWNER_EMAIL} — run \`node scripts/seed-local.mjs\` first.`,
    );
  }

  const platform = await findPlatformOrg();
  if (!platform) {
    throw new Error("Missing platform org — run `node scripts/seed-local.mjs` first.");
  }

  const { rows: existing } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM org_accounts
     WHERE type = 'agent' AND name LIKE $1`,
    [`${PREFIX} Agent %`],
  );
  if ((existing[0]?.n ?? 0) >= COUNT) {
    console.log(
      `Load seed already present (${existing[0].n} agents named "${PREFIX} Agent …"). Skipping.`,
    );
    return;
  }

  console.log(`Hashing shared cashier password…`);
  const passwordHash = await hashPassword(CASHIER_PASSWORD);

  /** @type {string[]} */
  const agentIds = [];
  /** @type {string[]} */
  const subAgentIds = [];
  /** @type {string[]} */
  const merchantIds = [];

  console.log(`Creating ${COUNT} agents…`);
  for (let i = 1; i <= COUNT; i++) {
    const created = await insertOrgAccount({
      type: "agent",
      name: agentName(i),
      parentId: platform.id,
      structure: null,
      maxAgentDepth: null,
    });
    if (!created.ok) throw new Error(`agent ${i} failed`);
    agentIds.push(created.row.id);
    if (i % 20 === 0) console.log(`  agents ${i}/${COUNT}`);
  }

  console.log(`Creating ${COUNT} sub-agents…`);
  for (let i = 1; i <= COUNT; i++) {
    const created = await insertOrgAccount({
      type: "agent_sub",
      name: subAgentName(i),
      parentId: agentIds[i - 1],
      structure: null,
      maxAgentDepth: null,
    });
    if (!created.ok) throw new Error(`sub-agent ${i} failed`);
    subAgentIds.push(created.row.id);
    if (i % 20 === 0) console.log(`  sub-agents ${i}/${COUNT}`);
  }

  console.log(`Creating ${COUNT} merchants + commercial + cashiers + history…`);
  const tiers = ["small", "mid", "enterprise"];
  const feeByTier = { small: "1.8", mid: "1.2", enterprise: "0.9" };

  for (let i = 1; i <= COUNT; i++) {
    const parentId = i % 2 === 0 ? subAgentIds[i - 1] : agentIds[i - 1];
    const structure = i % 5 === 0 ? "multi_location" : "single_location";
    const created = await insertOrgAccount({
      type: "merchant",
      name: merchantName(i),
      parentId,
      structure,
      maxAgentDepth: null,
    });
    if (!created.ok) throw new Error(`merchant ${i} failed`);
    const merchantId = created.row.id;
    merchantIds.push(merchantId);

    if (structure === "multi_location") {
      const site = await insertOrgAccount({
        type: "merchant_site",
        name: `${merchantName(i)} · Site 1`,
        parentId: merchantId,
        structure: null,
        maxAgentDepth: null,
      });
      if (!site.ok) throw new Error(`merchant site ${i} failed`);
    }

    const tier = tiers[i % tiers.length];
    try {
      await bootstrapMerchantCommercial({
        orgId: merchantId,
        tier,
        volumeFeePercent: feeByTier[tier],
        actorUserId: platformOwner.id,
      });
    } catch (err) {
      // Ignore duplicate commercial if re-run mid-way.
      if (!String(err?.message ?? err).includes("duplicate")) throw err;
    }

    const cashier = await insertUserWithHash(cashierEmail(i), passwordHash);
    await ensureMembership(merchantId, cashier.id, "cashier");
    await ensureMembership(parentId, platformOwner.id, "owner");

    // Pause ~10% of merchants for filter testing.
    if (i % 10 === 0) {
      await pool.query(
        `UPDATE org_accounts SET status = 'paused', updated_at = now() WHERE id = $1`,
        [merchantId],
      );
    }
    if (i % 15 === 0) {
      await pool.query(
        `UPDATE org_accounts SET status = 'paused', updated_at = now() WHERE id = $1`,
        [agentIds[i - 1]],
      );
    }

    const createdAtOrg = daysAgo(90 - (i % 80), i % 12);
    await pool.query(
      `UPDATE org_accounts SET created_at = $2, updated_at = $2 WHERE id = $1`,
      [merchantId, createdAtOrg.toISOString()],
    );
    await pool.query(
      `UPDATE org_accounts SET created_at = $2 WHERE id = $1 AND created_at > $2`,
      [agentIds[i - 1], daysAgo(100 - (i % 90)).toISOString()],
    );
    await pool.query(
      `UPDATE org_accounts SET created_at = $2 WHERE id = $1 AND created_at > $2`,
      [subAgentIds[i - 1], daysAgo(95 - (i % 85)).toISOString()],
    );

    await insertAudit(pool, {
      actorUserId: platformOwner.id,
      orgId: merchantId,
      action: "org_create",
      metadata: { type: "merchant", name: merchantName(i), seed: "load" },
      createdAt: createdAtOrg,
    });
    await insertAudit(pool, {
      actorUserId: platformOwner.id,
      orgId: agentIds[i - 1],
      action: "org_create",
      metadata: { type: "agent", name: agentName(i), seed: "load" },
      createdAt: daysAgo(100 - (i % 90), 2),
    });
    await insertAudit(pool, {
      actorUserId: platformOwner.id,
      orgId: subAgentIds[i - 1],
      action: "org_create",
      metadata: { type: "agent_sub", name: subAgentName(i), seed: "load" },
      createdAt: daysAgo(95 - (i % 85), 1),
    });

    const orderCount = 4 + (i % 5);
    for (let o = 0; o < orderCount; o++) {
      const pair = ASSETS[(i + o) % ASSETS.length];
      const status = STATUSES[(i + o) % STATUSES.length];
      const amount = (25 + ((i * 7 + o * 13) % 500) + (o % 10) / 10).toFixed(2);
      await insertOrder(pool, {
        orgId: merchantId,
        createdBy: cashier.id,
        status,
        amount,
        asset: pair.asset,
        network: pair.network,
        address: fakeAddress(`${merchantId}-${o}`),
        createdAt: daysAgo((i + o * 3) % 60, o),
        n: o,
      });
    }

    if (i % 10 === 0) console.log(`  merchants ${i}/${COUNT}`);
  }

  // Light agent owner memberships for platform owner (already on platform).
  for (const id of agentIds) {
    await ensureMembership(id, platformOwner.id, "owner");
  }

  console.log("\nLoad seed ready:");
  console.log(`  Agents:      ${COUNT}  (${agentName(1)} … ${agentName(COUNT)})`);
  console.log(`  Sub-agents:  ${COUNT}  (${subAgentName(1)} … ${subAgentName(COUNT)})`);
  console.log(`  Merchants:   ${COUNT}  (${merchantName(1)} … ${merchantName(COUNT)})`);
  console.log(`  Cashiers:    ${COUNT}  (${cashierEmail(1)} … ${cashierEmail(COUNT)})`);
  console.log(`  Cashier pw:  ${CASHIER_PASSWORD}`);
  console.log("  History:     payment orders + org_create audit (backdated)");
  console.log(`\nPlatform login: ${SEED_PLATFORM_OWNER_EMAIL} / User1234567890!`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closePool());
