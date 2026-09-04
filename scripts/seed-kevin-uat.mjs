#!/usr/bin/env node
/**
 * Kevin UAT seed — real TRON Nile wallet addresses + full org profiles.
 *
 * Hierarchy (Phase 1 depth 2):
 *   Platform → Kevin Agent → Kevin Sub-Agent → merchants
 *                          └→ Kevin Merchant #2 (direct under agent)
 *
 * Prerequisites: `node scripts/seed-local.mjs` (platform + owner).
 * Idempotent: skips when org "Kevin Agent" already exists.
 *
 * Usage: node scripts/seed-kevin-uat.mjs
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createUser, findUserByEmail } from "../apps/api/src/auth/users.mjs";
import { hashPassword } from "../apps/api/src/auth/password-hash.mjs";
import { bootstrapMerchantCommercial } from "../apps/api/src/commercial/merchant-commercial-routes.mjs";
import { upsertAgentCommission } from "../apps/api/src/commercial/agent-commission-store.mjs";
import { upsertAgentPayoutAddress } from "../apps/api/src/commercial/agent-payout-store.mjs";
import { closePool, getPool } from "../apps/api/src/db/pool.mjs";
import { insertMembership } from "../apps/api/src/orgs/membership-store.mjs";
import { findPlatformOrg, insertOrgAccount } from "../apps/api/src/orgs/org-store.mjs";
import { SEED_PASSWORD, SEED_PLATFORM_OWNER_EMAIL } from "./seed-constants.mjs";
import { NILE_HD_WALLETS, UAT_SETTLEMENT } from "./seed-nile-wallets.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MARKER_ORG = "Kevin Agent";
/** Three months of billing + order history (Jun 2026 onward). */
const ONBOARD_AT = "2026-06-01T00:00:00.000Z";

/** @type {const} */
const ORG_TREE = {
  agent: {
    name: "Kevin Agent",
    type: "agent",
    displayName: "Kevin Agent",
    legalName: "Kevin Agent Partners LLC",
    country: "MA",
    billingEmail: "billing.agent@paymentgate.io",
    payoutAddress: NILE_HD_WALLETS.kevinAgent,
    commissionPercent: "15",
    users: [
      {
        email: "own.agent@paymentgate.io",
        role: "owner",
        displayName: "Kevin Agent Owner",
      },
      {
        email: "admin.agent@paymentgate.io",
        role: "administrator",
        displayName: "Kevin Agent Admin",
      },
      {
        email: "view.agent@paymentgate.io",
        role: "viewer",
        displayName: "Kevin Agent Viewer",
      },
    ],
  },
  subAgent: {
    name: "Kevin Sub-Agent",
    type: "agent_sub",
    displayName: "Kevin Sub-Agent",
    legalName: "Kevin Sub-Agent SARL",
    country: "MA",
    billingEmail: "billing.subagent@paymentgate.io",
    payoutAddress: NILE_HD_WALLETS.kevinSubAgent,
    commissionPercent: "10",
    users: [
      {
        email: "own.subagent@paymentgate.io",
        role: "owner",
        displayName: "Kevin Sub-Agent Owner",
      },
    ],
  },
  merchantSingle: {
    name: "Kevin Single Merchant",
    type: "merchant",
    structure: "single_location",
    displayName: "Kevin Single Merchant",
    legalName: "Kevin Single Merchant SARL AU",
    country: "MA",
    billingEmail: "billing.single@paymentgate.io",
    settlementAddress: NILE_HD_WALLETS.kevinSingleMerchant,
    tier: "mid",
    volumeFeePercent: "1.2",
    matchingMode: "B",
    users: [
      {
        email: "own.single@paymentgate.io",
        role: "owner",
        displayName: "Kevin Single Owner",
      },
      {
        email: "cashier.single@paymentgate.io",
        role: "cashier",
        displayName: "Kevin Single Cashier",
      },
    ],
  },
  merchantMulti: {
    name: "Kevin Multi Merchant",
    type: "merchant",
    structure: "multi_location",
    displayName: "Kevin Multi Merchant",
    legalName: "Kevin Multi Merchant Group SA",
    country: "MA",
    billingEmail: "billing.multi@paymentgate.io",
    settlementAddress: NILE_HD_WALLETS.customer2,
    tier: "mid",
    volumeFeePercent: "1.2",
    matchingMode: "B",
    sites: [
      { name: "Kevin Multi · Casablanca", country: "MA" },
      { name: "Kevin Multi · Marrakech", country: "MA" },
    ],
    users: [
      {
        email: "own.multi@paymentgate.io",
        role: "owner",
        displayName: "Kevin Multi Owner",
      },
    ],
  },
  merchant2: {
    name: "Kevin Merchant #2",
    type: "merchant",
    structure: "single_location",
    displayName: "Kevin Merchant #2",
    legalName: "Kevin Merchant Two Ltd",
    country: "MA",
    billingEmail: "billing.merchant2@paymentgate.io",
    settlementAddress: NILE_HD_WALLETS.kevinMerchant2,
    tier: "small",
    volumeFeePercent: "2.0",
    matchingMode: "C",
    users: [
      {
        email: "own.merchant2@paymentgate.io",
        role: "owner",
        displayName: "Kevin Merchant #2 Owner",
      },
      {
        email: "cashier.merchant2@paymentgate.io",
        role: "cashier",
        displayName: "Kevin Merchant #2 Cashier",
      },
    ],
  },
};

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

async function patchOrgProfile(pool, orgId, profile) {
  await pool.query(
    `UPDATE org_accounts
     SET country = $2,
         legal_name = $3,
         billing_email = $4,
         created_at = COALESCE(created_at, $5::timestamptz),
         updated_at = now()
     WHERE id = $1`,
    [
      orgId,
      profile.country,
      profile.legalName,
      profile.billingEmail,
      ONBOARD_AT,
    ],
  );
}

async function ensureOrg(parentId, spec) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id FROM org_accounts
     WHERE type = $1 AND lower(btrim(name)) = lower(btrim($2))
       AND (($3::uuid IS NULL AND parent_id IS NULL) OR parent_id = $3)
     LIMIT 1`,
    [spec.type, spec.name, parentId],
  );
  if (rows[0]?.id) {
    await patchOrgProfile(pool, rows[0].id, spec);
    return rows[0].id;
  }

  const created = await insertOrgAccount({
    type: spec.type,
    name: spec.name,
    parentId,
    structure: spec.structure ?? null,
    maxAgentDepth: null,
    country: spec.country,
    legalName: spec.legalName,
  });
  if (!created.ok) {
    throw new Error(`Could not create org ${spec.name}: ${created.code ?? "unknown"}`);
  }
  await patchOrgProfile(pool, created.row.id, spec);
  return created.row.id;
}

async function ensureSettlement(pool, orgId, address) {
  await pool.query(
    `INSERT INTO settlement_addresses (org_id, asset, network, address)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (org_id, asset, network) DO UPDATE
       SET address = EXCLUDED.address,
           updated_at = now()`,
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
       SET matching_mode = EXCLUDED.matching_mode,
           updated_at = now()`,
    [orgId, mode],
  );
}

async function ensureSampleOrders(
  pool,
  orgId,
  createdBy,
  receiveAddress,
  prefix,
  matchingMode = "B",
) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const samples = [
    { status: "completed", amount: "20", daysAgo: 1, slot: 1 },
    { status: "completed", amount: "50", daysAgo: 3, slot: 2 },
    { status: "pending_payment", amount: "10", daysAgo: 0, slot: 3 },
    { status: "verifying", amount: "15", daysAgo: 0, slot: 4 },
  ];
  for (const s of samples) {
    const createdAt = new Date(monthStart);
    createdAt.setUTCDate(createdAt.getUTCDate() + (30 - s.daysAgo));
    const idem = `kevin-uat-${prefix}-${s.slot}`;
    const bodyHash = createHash("sha256").update(idem).digest("hex");
    const expiresAt = new Date(createdAt.getTime() + 30 * 60 * 1000);
    const isSettled = s.status === "completed" || s.status === "verifying";
    await pool.query(
      `INSERT INTO payment_orders (
         org_id, created_by, order_number, status, matching_mode,
         payable_amount, receive_address, address_source, asset, network,
         expires_at, required_confirmations,
         idempotency_key, idempotency_body_hash, merchant_metadata,
         created_at, updated_at,
         received_amount, tx_hash, confirmations
       ) VALUES (
         $1, $2,
         'CG-UAT-' || lpad(nextval('payment_orders_order_number_seq')::text, 8, '0'),
         $3, $4, $5, $6, 'main',
         $7, $8, $9, 19,
         $10, $11, '{"seed":"kevin-uat"}'::jsonb,
         $12, $12,
         $13, $14, $15
       )
       ON CONFLICT (org_id, idempotency_key) DO NOTHING`,
      [
        orgId,
        createdBy,
        s.status,
        matchingMode,
        s.amount,
        receiveAddress,
        UAT_SETTLEMENT.asset,
        UAT_SETTLEMENT.network,
        expiresAt.toISOString(),
        idem,
        bodyHash,
        createdAt.toISOString(),
        isSettled ? s.amount : null,
        isSettled
          ? createHash("sha256").update(`uat-tx-${idem}`).digest("hex")
          : null,
        s.status === "completed" ? 19 : s.status === "verifying" ? 4 : 0,
      ],
    );
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

  const platform = await findPlatformOrg();
  if (!platform) {
    throw new Error("Missing platform org — run seed-local.mjs first.");
  }

  const { rows: marker } = await pool.query(
    `SELECT id FROM org_accounts WHERE type = 'agent' AND name = $1 LIMIT 1`,
    [MARKER_ORG],
  );
  const resume = marker.length > 0;
  if (resume) {
    console.log(`${MARKER_ORG} exists — completing / repairing Kevin UAT…`);
  }

  console.log("Setting platform billing wallet (Nile)…");
  await pool.query(
    `INSERT INTO platform_billing_settings (id, seller_name, pay_to)
     VALUES (1, 'PaymentGate Platform', $1)
     ON CONFLICT (id) DO UPDATE
       SET seller_name = EXCLUDED.seller_name,
           pay_to = EXCLUDED.pay_to,
           updated_at = now()`,
    [NILE_HD_WALLETS.platform],
  );

  console.log("Creating Kevin agent subtree…");
  const agentId = await ensureOrg(platform.id, ORG_TREE.agent);
  await upsertAgentCommission({
    orgId: agentId,
    commissionPercent: ORG_TREE.agent.commissionPercent,
  });
  await upsertAgentPayoutAddress({
    orgId: agentId,
    asset: UAT_SETTLEMENT.asset,
    network: UAT_SETTLEMENT.network,
    address: ORG_TREE.agent.payoutAddress,
    cooldownMs: 0,
  });
  for (const u of ORG_TREE.agent.users) {
    const user = await ensureUser(u.email, u.displayName);
    await ensureMembership(agentId, user.id, u.role);
  }

  const subAgentId = await ensureOrg(agentId, ORG_TREE.subAgent);
  await upsertAgentCommission({
    orgId: subAgentId,
    commissionPercent: ORG_TREE.subAgent.commissionPercent,
  });
  await upsertAgentPayoutAddress({
    orgId: subAgentId,
    asset: UAT_SETTLEMENT.asset,
    network: UAT_SETTLEMENT.network,
    address: ORG_TREE.subAgent.payoutAddress,
    cooldownMs: 0,
  });
  for (const u of ORG_TREE.subAgent.users) {
    const user = await ensureUser(u.email, u.displayName);
    await ensureMembership(subAgentId, user.id, u.role);
  }

  const merchantSpecs = [
    { spec: ORG_TREE.merchantSingle, parentId: subAgentId, key: "single" },
    { spec: ORG_TREE.merchantMulti, parentId: subAgentId, key: "multi" },
    { spec: ORG_TREE.merchant2, parentId: agentId, key: "m2" },
  ];

  for (const { spec, parentId, key } of merchantSpecs) {
    const orgId = await ensureOrg(parentId, spec);
    await ensureMerchantCommercial(orgId, spec, platformOwner.id);
    await ensureMatching(pool, orgId, spec.matchingMode);
    await ensureSettlement(pool, orgId, spec.settlementAddress);

    let ownerId = platformOwner.id;
    for (const u of spec.users) {
      const user = await ensureUser(u.email, u.displayName);
      await ensureMembership(orgId, user.id, u.role);
      if (u.role === "owner") ownerId = user.id;
    }

    if (spec.sites?.length) {
      for (const site of spec.sites) {
        await ensureOrg(orgId, {
          type: "merchant_site",
          name: site.name,
          country: site.country,
          legalName: `${site.name} — branch`,
          billingEmail: spec.billingEmail,
        });
      }
    }

    await ensureSampleOrders(
      pool,
      orgId,
      ownerId,
      spec.settlementAddress,
      key,
      spec.matchingMode,
    );
  }

  console.log("\nKevin UAT seed complete.\n");
  console.log("  Password (all users):", SEED_PASSWORD);
  console.log("\n  Platform billing (service bills Rx):", NILE_HD_WALLETS.platform);
  console.log("  Test payer wallet (fund on Nile):  ", NILE_HD_WALLETS.customer);
  console.log("\n  Logins:");
  for (const line of [
    ["Platform Owner", SEED_PLATFORM_OWNER_EMAIL],
    ["Kevin Agent Owner", "own.agent@paymentgate.io"],
    ["Kevin Sub-Agent Owner", "own.subagent@paymentgate.io"],
    ["Kevin Single Merchant", "own.single@paymentgate.io"],
    ["Kevin Single Cashier", "cashier.single@paymentgate.io"],
    ["Kevin Multi Merchant", "own.multi@paymentgate.io"],
    ["Kevin Merchant #2", "own.merchant2@paymentgate.io"],
  ]) {
    console.log(`    ${line[0].padEnd(22)} ${line[1]}`);
  }
  console.log("\n  Settlement (USDT / tron_nile):");
  console.log(`    Kevin Single Merchant  ${NILE_HD_WALLETS.kevinSingleMerchant}`);
  console.log(`    Kevin Multi Merchant   ${NILE_HD_WALLETS.customer2}`);
  console.log(`    Kevin Merchant #2      ${NILE_HD_WALLETS.kevinMerchant2}`);
  console.log("\n  Portals: https://merchant-cg.boostbunny.io/ (and platform / agent)\n");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closePool());
