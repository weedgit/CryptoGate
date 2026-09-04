#!/usr/bin/env node
/**
 * Client-demo polish — second agent tree, more Nile merchants, platform team,
 * audit “grow” events, dashboard-friendly bills & commissions.
 *
 * Prerequisites: seed-local → seed-kevin-uat → seed-kevin-uat-rich
 * Usage: node scripts/seed-kevin-uat-client-demo.mjs
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
import {
  findPlatformOrg,
  insertOrgAccount,
} from "../apps/api/src/orgs/org-store.mjs";
import {
  roundUsd,
  volumeFeeUsd,
} from "../apps/api/src/service-bills/generate-rules.mjs";
import { addUsdAmounts } from "../apps/api/src/service-bills/service-bill-rules.mjs";
import { findFeeTierBand } from "../apps/api/src/platform-settings/fee-tier-store.mjs";
import { SEED_PASSWORD, SEED_PLATFORM_OWNER_EMAIL } from "./seed-constants.mjs";
import { patchCommissionTreeSnapshots } from "./seed-commission-helpers.mjs";
import { NILE_HD_WALLETS, UAT_SETTLEMENT } from "./seed-nile-wallets.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ONBOARD_AT = "2026-06-01T00:00:00.000Z";
const MARKER_ATLAS = "Atlas Agent";

/** Enterprise custom rates for Fees → Custom merchant rate overrides tab. */
const ENTERPRISE_OVERRIDE_FIXTURES = [
  {
    merchantName: "Kevin Multi Merchant",
    requestedVolumeFeePercent: "0.45",
    status: "approved",
    requestedByEmail: "own.agent@paymentgate.io",
    daysAgo: 45,
  },
  {
    merchantName: "Atlas Merchant · Casablanca",
    requestedVolumeFeePercent: "1.05",
    status: "approved",
    requestedByEmail: "own.atlas@paymentgate.io",
    daysAgo: 28,
  },
  {
    merchantName: "Kevin Merchant #2",
    requestedVolumeFeePercent: "0.52",
    status: "approved",
    requestedByEmail: "own.agent@paymentgate.io",
    daysAgo: 12,
  },
  {
    merchantName: "Kevin Merchant #3",
    requestedVolumeFeePercent: "0.38",
    status: "pending",
    requestedByEmail: "own.agent@paymentgate.io",
    daysAgo: 4,
  },
  {
    merchantName: "Atlas Merchant · Rabat",
    requestedVolumeFeePercent: "1.18",
    status: "pending",
    requestedByEmail: "own.atlas@paymentgate.io",
    daysAgo: 1,
  },
];

const PLATFORM_TEAM = [
  {
    email: "admin.platform@paymentgate.io",
    role: "administrator",
    displayName: "Platform Admin",
  },
  {
    email: "view.platform@paymentgate.io",
    role: "viewer",
    displayName: "Platform Viewer",
  },
  {
    email: "ops.platform@paymentgate.io",
    role: "administrator",
    displayName: "Platform Ops",
  },
];

/** @type {const} */
const ATLAS_TREE = {
  agent: {
    name: MARKER_ATLAS,
    legalName: "Atlas Payments Agency LLC",
    country: "MA",
    billingEmail: "billing.atlas@paymentgate.io",
    payout: NILE_HD_WALLETS.customer15,
    commissionPercent: "18",
    ownerEmail: "own.atlas@paymentgate.io",
    ownerName: "Atlas Agent Owner",
  },
  subAgent: {
    name: "Atlas Sub-Agent",
    legalName: "Atlas Sub-Agent SARL",
    country: "MA",
    billingEmail: "billing.atlas-sub@paymentgate.io",
    payout: NILE_HD_WALLETS.customer16,
    commissionPercent: "12",
    ownerEmail: "own.atlas-sub@paymentgate.io",
    ownerName: "Atlas Sub-Agent Owner",
  },
  merchants: [
    {
      key: "atlas-casa",
      name: "Atlas Merchant · Casablanca",
      legalName: "Atlas Casa Retail SARL",
      settlement: NILE_HD_WALLETS.customer17,
      tier: "mid",
      volumeFeePercent: "1.2",
      matchingMode: "B",
      parent: "subAgent",
    },
    {
      key: "atlas-rabat",
      name: "Atlas Merchant · Rabat",
      legalName: "Atlas Rabat Services SA",
      settlement: NILE_HD_WALLETS.customer18,
      tier: "mid",
      volumeFeePercent: "1.2",
      matchingMode: "C",
      parent: "subAgent",
    },
    {
      key: "atlas-tanger",
      name: "Atlas Merchant · Tangier",
      legalName: "Atlas Tangier Trading Ltd",
      settlement: NILE_HD_WALLETS.customer19,
      tier: "small",
      volumeFeePercent: "2.0",
      matchingMode: "B",
      parent: "agent",
    },
    {
      key: "atlas-multi",
      name: "Atlas Multi Merchant",
      legalName: "Atlas Multi Group SA",
      settlement: NILE_HD_WALLETS.customer20,
      tier: "mid",
      volumeFeePercent: "1.2",
      matchingMode: "B",
      parent: "subAgent",
      structure: "multi_location",
      sites: ["Atlas Multi · Site Nord", "Atlas Multi · Site Sud"],
    },
  ],
};

/** Extra merchants on Kevin tree (#8–#12). */
const KEVIN_EXTRA = [
  {
    key: "m8",
    name: "Kevin Merchant #8",
    legalName: "Kevin Merchant Eight SARL",
    settlement: NILE_HD_WALLETS.customer21,
    tier: "mid",
    volumeFeePercent: "1.2",
    matchingMode: "B",
    parentKey: "subAgent",
  },
  {
    key: "m9",
    name: "Kevin Merchant #9",
    legalName: "Kevin Merchant Nine SA",
    settlement: NILE_HD_WALLETS.customer22,
    tier: "small",
    volumeFeePercent: "2.0",
    matchingMode: "C",
    parentKey: "subAgent",
  },
  {
    key: "m10",
    name: "Kevin Merchant #10",
    legalName: "Kevin Merchant Ten Ltd",
    settlement: NILE_HD_WALLETS.customer23,
    tier: "mid",
    volumeFeePercent: "1.2",
    matchingMode: "B",
    parentKey: "agent",
  },
  {
    key: "m11",
    name: "Kevin Merchant #11",
    legalName: "Kevin Merchant Eleven SARL AU",
    settlement: NILE_HD_WALLETS.customer24,
    tier: "small",
    volumeFeePercent: "2.0",
    matchingMode: "D",
    parentKey: "subAgent",
  },
  {
    key: "m12",
    name: "Kevin Merchant #12",
    legalName: "Kevin Merchant Twelve Group",
    settlement: NILE_HD_WALLETS.customer25,
    tier: "mid",
    volumeFeePercent: "1.2",
    matchingMode: "B",
    parentKey: "agent",
  },
];

const CASHIER_SLOTS = ["a", "b", "c", "d", "e"];

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

function daysAgo(days, hours = 10) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(hours, 0, 0, 0);
  return d;
}

async function ensureUser(email, displayName) {
  let user = await findUserByEmail(email);
  const passwordHash = await hashPassword(SEED_PASSWORD);
  if (!user) user = await createUser({ email, password: SEED_PASSWORD });
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
  if (rows.length === 0) await insertMembership({ orgId, userId, role });
}

async function findOrg(type, name, parentId) {
  const { rows } = await getPool().query(
    `SELECT id FROM org_accounts
     WHERE type = $1 AND name = $2
       AND (($3::uuid IS NULL AND parent_id IS NULL) OR parent_id = $3)
     LIMIT 1`,
    [type, name, parentId],
  );
  return rows[0]?.id ?? null;
}

async function ensureOrgAccount({
  type,
  name,
  parentId,
  structure,
  country,
  legalName,
  billingEmail,
}) {
  const existing = await findOrg(type, name, parentId);
  if (existing) {
    await getPool().query(
      `UPDATE org_accounts
       SET country = $2, legal_name = $3, billing_email = $4,
           created_at = COALESCE(created_at, $5::timestamptz), updated_at = now()
       WHERE id = $1`,
      [existing, country, legalName, billingEmail, ONBOARD_AT],
    );
    return existing;
  }
  const created = await insertOrgAccount({
    type,
    name,
    parentId,
    structure: structure ?? null,
    maxAgentDepth: null,
    country,
    legalName,
  });
  if (!created.ok) {
    throw new Error(`create ${name}: ${created.code ?? "unknown"}`);
  }
  await getPool().query(
    `UPDATE org_accounts
     SET billing_email = $2, created_at = $3::timestamptz, updated_at = now()
     WHERE id = $1`,
    [created.row.id, billingEmail, ONBOARD_AT],
  );
  return created.row.id;
}

async function ensureSettlement(orgId, address) {
  await getPool().query(
    `INSERT INTO settlement_addresses (org_id, asset, network, address)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (org_id, asset, network) DO UPDATE
       SET address = EXCLUDED.address, updated_at = now()`,
    [orgId, UAT_SETTLEMENT.asset, UAT_SETTLEMENT.network, address],
  );
}

async function ensureCommercial(orgId, spec, actorId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT org_id FROM merchant_commercial WHERE org_id = $1`,
    [orgId],
  );
  if (rows.length === 0) {
    await bootstrapMerchantCommercial({
      orgId,
      tier: spec.tier,
      volumeFeePercent: spec.volumeFeePercent,
      actorUserId: actorId,
    });
  }
}

async function ensureMatching(orgId, mode) {
  await getPool().query(
    `INSERT INTO merchant_matching_settings (org_id, matching_mode)
     VALUES ($1, $2)
     ON CONFLICT (org_id) DO UPDATE SET matching_mode = EXCLUDED.matching_mode`,
    [orgId, mode],
  );
}

async function ensureCashiers(orgId, key, label) {
  const ids = [];
  for (const slot of CASHIER_SLOTS) {
    const user = await ensureUser(
      `cashier.${key}.${slot}@paymentgate.io`,
      `${label} Cashier ${slot.toUpperCase()}`,
    );
    await ensureMembership(orgId, user.id, "cashier");
    ids.push(user.id);
  }
  return ids;
}

async function insertAudit(pool, { actorId, orgId, action, metadata, at }) {
  const { rowCount } = await pool.query(
    `INSERT INTO audit_log (actor_user_id, org_id, action, metadata, created_at)
     SELECT $1, $2, $3, $4::jsonb, $5::timestamptz
     WHERE NOT EXISTS (
       SELECT 1 FROM audit_log
       WHERE org_id = $2 AND action = $3
         AND metadata @> $4::jsonb
         AND created_at >= ($5::timestamptz - interval '1 day')
     )`,
    [
      actorId,
      orgId,
      action,
      JSON.stringify(metadata),
      at.toISOString(),
    ],
  );
  return rowCount ?? 0;
}

async function seedQuickOrders(pool, orgId, key, address, mode, cashierIds, ownerId) {
  const amounts = [25, 40, 60, 85];
  for (let i = 0; i < amounts.length; i += 1) {
    const createdAt = daysAgo(i + 1, 11 + i);
    const idem = `client-demo-${key}-sep-${i + 1}`;
    const bodyHash = createHash("sha256").update(idem).digest("hex");
    const expiresAt = new Date(createdAt.getTime() + 30 * 60 * 1000);
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
         'CG-DEMO-' || lpad(nextval('payment_orders_order_number_seq')::text, 8, '0'),
         'completed', $3, $4, $5, 'main',
         $6, $7, $8, 19,
         $9, $10, '{"seed":"client-demo"}'::jsonb,
         $11, $11,
         $4, $12, 19, $13, $11
       )
       ON CONFLICT (org_id, idempotency_key) DO NOTHING`,
      [
        orgId,
        cashierIds[i % cashierIds.length] ?? ownerId,
        mode,
        amounts[i].toFixed(2),
        address,
        UAT_SETTLEMENT.asset,
        UAT_SETTLEMENT.network,
        expiresAt.toISOString(),
        idem,
        bodyHash,
        createdAt.toISOString(),
        createHash("sha256").update(`tx-${idem}`).digest("hex"),
        NILE_HD_WALLETS.customer29,
      ],
    );
  }
}

async function ensureAtlasServiceBills(pool, merchantId, tier, feePct, key) {
  const band = await findFeeTierBand(tier);
  const subscription = roundUsd(band?.subscription_amount_usd ?? "199.00");
  const monthKey = new Date().toISOString().slice(0, 7);
  const periodStart = `${monthKey}-01`;
  const periodEnd = new Date(`${monthKey}-01T00:00:00.000Z`);
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
  periodEnd.setUTCDate(0);
  const volumeFee = volumeFeeUsd("210.00", feePct);
  const total = addUsdAmounts(subscription, volumeFee);
  const dueAt = daysAgo(5);

  await pool.query(
    `INSERT INTO service_bills (
       org_id, period_start, period_end,
       subscription_amount, volume_fee_amount, total_amount,
       currency, status, due_at, paid_at, payment_reference,
       tier, volume_fee_percent, billed_volume_usd, created_at, updated_at
     ) SELECT $1, $2::date, $3::date, $4, $5, $6,
       'USD', 'issued', $7, NULL, $8,
       $9, $10, '210.00', now(), now()
     WHERE NOT EXISTS (
       SELECT 1 FROM service_bills
       WHERE org_id = $1 AND to_char(period_start, 'YYYY-MM') = $11
     )`,
    [
      merchantId,
      periodStart,
      periodEnd.toISOString().slice(0, 10),
      subscription,
      volumeFee,
      total,
      dueAt.toISOString(),
      `atlas-bill-${key}-${monthKey}`,
      tier,
      feePct,
      monthKey,
    ],
  );
}

async function patchDashboardBills(pool) {
  const now = new Date();

  const overdue = await pool.query(
    `UPDATE service_bills sb
     SET status = 'overdue', updated_at = now(),
         due_at = (now() AT TIME ZONE 'utc' - interval '5 days')
     WHERE sb.id IN (
       SELECT sb2.id FROM service_bills sb2
       JOIN org_accounts o ON o.id = sb2.org_id
       WHERE sb2.status IN ('issued', 'paid')
         AND o.name LIKE 'Atlas %'
       ORDER BY sb2.total_amount::numeric DESC
       LIMIT 4
     )`,
  );

  const paidRecent = await pool.query(
    `UPDATE service_bills sb
     SET status = 'paid', paid_at = $1::timestamptz, updated_at = now()
     WHERE sb.id IN (
       SELECT sb2.id FROM service_bills sb2
       JOIN org_accounts o ON o.id = sb2.org_id
       WHERE sb2.status IN ('issued', 'paid')
         AND o.name LIKE 'Kevin %'
       ORDER BY sb2.created_at DESC
       LIMIT 8
     )`,
    [now.toISOString()],
  );

  return {
    paidMarked: paidRecent.rowCount ?? 0,
    overdueMarked: overdue.rowCount ?? 0,
  };
}

async function syncSeptemberCommissions(pool) {
  const monthKey = new Date().toISOString().slice(0, 7);
  const { rows: agents } = await pool.query(
    `SELECT o.id, o.name, o.type, ac.commission_percent, apa.address
     FROM org_accounts o
     LEFT JOIN agent_commission ac ON ac.org_id = o.id
     LEFT JOIN agent_payout_addresses apa ON apa.org_id = o.id
     WHERE o.type IN ('agent', 'agent_sub')
       AND (o.name LIKE 'Kevin %' OR o.name LIKE 'Atlas %')`,
  );

  let upserted = 0;
  for (const agent of agents.filter((a) => a.type === "agent")) {
    const { rows: feeRows } = await pool.query(
      `SELECT COALESCE(SUM(sb.volume_fee_amount::numeric), 0) AS fees
       FROM service_bills sb
       JOIN org_accounts m ON m.id = sb.org_id
       WHERE sb.status = 'paid'
         AND to_char(sb.period_start, 'YYYY-MM') = $2
         AND m.id IN (
           WITH RECURSIVE subtree AS (
             SELECT id FROM org_accounts WHERE id = $1
             UNION ALL
             SELECT o.id FROM org_accounts o JOIN subtree s ON o.parent_id = s.id
           )
           SELECT id FROM subtree WHERE type = 'merchant'
         )`,
      [agent.id, monthKey],
    );
    const feeCollected = Number(feeRows[0]?.fees ?? 0);
    const pct = Number(agent.commission_percent ?? 15);
    const commissionAmount =
      Math.round(feeCollected * (pct / 100) * 100) / 100;
    if (commissionAmount <= 0 && feeCollected <= 0) continue;

    const result = await pool.query(
      `INSERT INTO commission_payouts (
         payee_org_id, payee_name, payer, payer_org_id,
         period_key, period_label, platform_fee_collected, commission_percent,
         commission_amount, payout_status, payout_address, asset, network,
         payment_link, tx_ref, paid_at
       ) VALUES (
         $1, $2, 'platform', NULL,
         $3, $4, $5, $6,
         $7, $8, $9, $10, $11,
         $12, NULL, NULL
       )
       ON CONFLICT DO NOTHING`,
      [
        agent.id,
        agent.name,
        monthKey,
        `Sep 2026`,
        feeCollected.toFixed(2),
        String(pct),
        commissionAmount.toFixed(2),
        "issued",
        agent.address,
        UAT_SETTLEMENT.asset,
        UAT_SETTLEMENT.network,
        `/platform/commissions?payee=${agent.id}&period=${monthKey}`,
      ],
    );
    if (result.rowCount) upserted += 1;
  }

  // Atlas Agent — September row for commissions board
  const atlas = agents.find((a) => a.name === MARKER_ATLAS);
  if (atlas) {
    const ins = await pool.query(
      `INSERT INTO commission_payouts (
         payee_org_id, payee_name, payer, payer_org_id,
         period_key, period_label, platform_fee_collected, commission_percent,
         commission_amount, payout_status, payout_address, asset, network,
         payment_link
       ) VALUES (
         $1, $2, 'platform', NULL,
         $3, 'Sep 2026', '12.50', '18',
         '2.25', 'issued', $4, $5, $6,
         $7
       )
       ON CONFLICT DO NOTHING`,
      [
        atlas.id,
        atlas.name,
        monthKey,
        atlas.address,
        UAT_SETTLEMENT.asset,
        UAT_SETTLEMENT.network,
        `/platform/commissions?payee=${atlas.id}&period=${monthKey}`,
      ],
    );
    if (ins.rowCount) upserted += 1;
  }

  return upserted;
}

/**
 * Seed pending + approved Enterprise rate overrides (Fees → overrides tab).
 * @param {import("pg").Pool} pool
 * @param {{ platformOwnerId: string }} ctx
 */
async function seedEnterpriseRateOverrides(pool, { platformOwnerId }) {
  let upserted = 0;
  for (const fixture of ENTERPRISE_OVERRIDE_FIXTURES) {
    const { rows: merchants } = await pool.query(
      `SELECT id FROM org_accounts
       WHERE type = 'merchant' AND name = $1 LIMIT 1`,
      [fixture.merchantName],
    );
    const orgId = merchants[0]?.id;
    if (!orgId) continue;

    const requester = await findUserByEmail(fixture.requestedByEmail);
    if (!requester) continue;

    const createdAt = daysAgo(fixture.daysAgo);
    const decidedAt =
      fixture.status === "approved" ? daysAgo(Math.max(0, fixture.daysAgo - 2)) : null;

    const { rows: existing } = await pool.query(
      `SELECT id FROM enterprise_rate_approvals
       WHERE org_id = $1 AND status = $2
         AND requested_volume_fee_percent = $3
       LIMIT 1`,
      [orgId, fixture.status, fixture.requestedVolumeFeePercent],
    );

    if (existing[0]) {
      await pool.query(
        `UPDATE enterprise_rate_approvals
         SET requested_by_user_id = COALESCE(requested_by_user_id, $2),
             decided_by_user_id = COALESCE(decided_by_user_id, $3),
             created_at = $4,
             decided_at = COALESCE(decided_at, $5)
         WHERE id = $1`,
        [
          existing[0].id,
          requester.id,
          fixture.status === "approved" ? platformOwnerId : null,
          createdAt.toISOString(),
          decidedAt?.toISOString() ?? null,
        ],
      );
    } else {
      await pool.query(
        `INSERT INTO enterprise_rate_approvals (
           org_id, requested_tier, requested_volume_fee_percent,
           status, requested_by_user_id, decided_by_user_id,
           created_at, decided_at
         ) VALUES ($1, 'enterprise', $2, $3, $4, $5, $6, $7)`,
        [
          orgId,
          fixture.requestedVolumeFeePercent,
          fixture.status,
          requester.id,
          fixture.status === "approved" ? platformOwnerId : null,
          createdAt.toISOString(),
          decidedAt?.toISOString() ?? null,
        ],
      );
    }

    if (fixture.status === "approved") {
      await pool.query(
        `UPDATE merchant_commercial
         SET tier = 'enterprise',
             volume_fee_percent = $2,
             enterprise_approval_status = NULL,
             effective_from = LEAST(effective_from, CURRENT_DATE),
             updated_at = now()
         WHERE org_id = $1`,
        [orgId, fixture.requestedVolumeFeePercent],
      );
    } else {
      await pool.query(
        `UPDATE merchant_commercial
         SET tier = 'enterprise',
             volume_fee_percent = $2,
             enterprise_approval_status = 'pending',
             updated_at = now()
         WHERE org_id = $1`,
        [orgId, fixture.requestedVolumeFeePercent],
      );
    }
    upserted += 1;
  }
  return upserted;
}

async function main() {
  loadEnv();
  const pool = getPool();

  const platformOwner = await findUserByEmail(SEED_PLATFORM_OWNER_EMAIL);
  if (!platformOwner) {
    throw new Error("Run seed-local.mjs first.");
  }
  const platform = await findPlatformOrg();
  if (!platform) throw new Error("Missing platform org.");

  console.log("Platform team (Team page)…");
  for (const member of PLATFORM_TEAM) {
    const user = await ensureUser(member.email, member.displayName);
    await ensureMembership(platform.id, user.id, member.role);
  }

  console.log("Atlas agent subtree (second agent under platform)…");
  let atlasAgentId = await findOrg("agent", MARKER_ATLAS, platform.id);
  if (!atlasAgentId) {
    atlasAgentId = await ensureOrgAccount({
      type: "agent",
      name: ATLAS_TREE.agent.name,
      parentId: platform.id,
      country: ATLAS_TREE.agent.country,
      legalName: ATLAS_TREE.agent.legalName,
      billingEmail: ATLAS_TREE.agent.billingEmail,
    });
    await upsertAgentCommission({
      orgId: atlasAgentId,
      commissionPercent: ATLAS_TREE.agent.commissionPercent,
    });
    await upsertAgentPayoutAddress({
      orgId: atlasAgentId,
      asset: UAT_SETTLEMENT.asset,
      network: UAT_SETTLEMENT.network,
      address: ATLAS_TREE.agent.payout,
      cooldownMs: 0,
    });
    const owner = await ensureUser(
      ATLAS_TREE.agent.ownerEmail,
      ATLAS_TREE.agent.ownerName,
    );
    await ensureMembership(atlasAgentId, owner.id, "owner");
    await insertAudit(pool, {
      actorId: platformOwner.id,
      orgId: atlasAgentId,
      action: "org_create",
      metadata: { type: "agent", name: MARKER_ATLAS },
      at: daysAgo(18),
    });
  }

  let atlasSubId = await findOrg("agent_sub", ATLAS_TREE.subAgent.name, atlasAgentId);
  if (!atlasSubId) {
    atlasSubId = await ensureOrgAccount({
      type: "agent_sub",
      name: ATLAS_TREE.subAgent.name,
      parentId: atlasAgentId,
      country: ATLAS_TREE.subAgent.country,
      legalName: ATLAS_TREE.subAgent.legalName,
      billingEmail: ATLAS_TREE.subAgent.billingEmail,
    });
    await upsertAgentCommission({
      orgId: atlasSubId,
      commissionPercent: ATLAS_TREE.subAgent.commissionPercent,
    });
    await upsertAgentPayoutAddress({
      orgId: atlasSubId,
      asset: UAT_SETTLEMENT.asset,
      network: UAT_SETTLEMENT.network,
      address: ATLAS_TREE.subAgent.payout,
      cooldownMs: 0,
    });
    const owner = await ensureUser(
      ATLAS_TREE.subAgent.ownerEmail,
      ATLAS_TREE.subAgent.ownerName,
    );
    await ensureMembership(atlasSubId, owner.id, "owner");
    await insertAudit(pool, {
      actorId: platformOwner.id,
      orgId: atlasSubId,
      action: "org_create",
      metadata: { type: "agent_sub", name: ATLAS_TREE.subAgent.name },
      at: daysAgo(14),
    });
  }

  const atlasParents = { agent: atlasAgentId, subAgent: atlasSubId };
  for (const spec of ATLAS_TREE.merchants) {
    const parentId = atlasParents[spec.parent];
    const orgId = await ensureOrgAccount({
      type: "merchant",
      name: spec.name,
      parentId,
      structure: spec.structure ?? "single_location",
      country: "MA",
      legalName: spec.legalName,
      billingEmail: `billing.${spec.key}@paymentgate.io`,
    });
    await ensureCommercial(orgId, spec, platformOwner.id);
    await ensureMatching(orgId, spec.matchingMode);
    await ensureSettlement(orgId, spec.settlement);
    const owner = await ensureUser(
      `own.${spec.key}@paymentgate.io`,
      `${spec.name} Owner`,
    );
    await ensureMembership(orgId, owner.id, "owner");
    const cashiers = await ensureCashiers(orgId, spec.key, spec.name);
    if (spec.sites?.length) {
      for (const siteName of spec.sites) {
        await ensureOrgAccount({
          type: "merchant_site",
          name: siteName,
          parentId: orgId,
          country: "MA",
          legalName: `${siteName} branch`,
          billingEmail: `billing.${spec.key}@paymentgate.io`,
        });
      }
    }
    await seedQuickOrders(
      pool,
      orgId,
      spec.key,
      spec.settlement,
      spec.matchingMode,
      cashiers,
      owner.id,
    );
    await ensureAtlasServiceBills(
      pool,
      orgId,
      spec.tier,
      spec.volumeFeePercent,
      spec.key,
    );
    await insertAudit(pool, {
      actorId: platformOwner.id,
      orgId,
      action: "org_create",
      metadata: { type: "merchant", name: spec.name },
      at: daysAgo(10 + ATLAS_TREE.merchants.indexOf(spec)),
    });
    for (const slot of CASHIER_SLOTS.slice(0, 3)) {
      await insertAudit(pool, {
        actorId: owner.id,
        orgId,
        action: "org_user_invite",
        metadata: { role: "cashier", email: `cashier.${spec.key}.${slot}@paymentgate.io` },
        at: daysAgo(3 + slot.charCodeAt(0) % 5),
      });
    }
  }

  const { rows: kevinAgent } = await pool.query(
    `SELECT id FROM org_accounts WHERE name = 'Kevin Agent' AND type = 'agent' LIMIT 1`,
  );
  const { rows: kevinSub } = await pool.query(
    `SELECT id FROM org_accounts WHERE name = 'Kevin Sub-Agent' AND type = 'agent_sub' LIMIT 1`,
  );
  const kevinParents = {
    agent: kevinAgent[0]?.id,
    subAgent: kevinSub[0]?.id,
  };

  console.log("Kevin merchants #8–#12…");
  for (const spec of KEVIN_EXTRA) {
    const parentId = kevinParents[spec.parentKey];
    if (!parentId) continue;
    const orgId = await ensureOrgAccount({
      type: "merchant",
      name: spec.name,
      parentId,
      structure: "single_location",
      country: "MA",
      legalName: spec.legalName,
      billingEmail: `billing.${spec.key}@paymentgate.io`,
    });
    await ensureCommercial(orgId, spec, platformOwner.id);
    await ensureMatching(orgId, spec.matchingMode);
    await ensureSettlement(orgId, spec.settlement);
    const owner = await ensureUser(
      `own.${spec.key}@paymentgate.io`,
      `${spec.name} Owner`,
    );
    await ensureMembership(orgId, owner.id, "owner");
    const cashiers = await ensureCashiers(orgId, spec.key, spec.name);
    await seedQuickOrders(
      pool,
      orgId,
      spec.key,
      spec.settlement,
      spec.matchingMode,
      cashiers,
      owner.id,
    );
    await insertAudit(pool, {
      actorId: platformOwner.id,
      orgId,
      action: "org_create",
      metadata: { type: "merchant", name: spec.name },
      at: daysAgo(7 + KEVIN_EXTRA.indexOf(spec)),
    });
  }

  console.log("Grow metrics — audit backfill (last 30d)…");
  const { rows: allMerchants } = await pool.query(
    `SELECT id, name FROM org_accounts WHERE type = 'merchant' AND name LIKE 'Kevin %' LIMIT 5`,
  );
  for (const m of allMerchants) {
    await insertAudit(pool, {
      actorId: platformOwner.id,
      orgId: m.id,
      action: "org_user_invite",
      metadata: { role: "cashier", email: `cashier.demo@${m.id.slice(0, 8)}.io` },
      at: daysAgo(0, 9),
    });
  }
  await insertAudit(pool, {
    actorId: platformOwner.id,
    orgId: atlasAgentId,
    action: "org_create",
    metadata: { type: "merchant", name: "Atlas Merchant · Casablanca" },
    at: daysAgo(0, 11),
  });

  console.log("Dashboard demo — paid / overdue bills…");
  const billPatch = await patchDashboardBills(pool);

  console.log("Commissions — September invoices…");
  const commUpserted = await syncSeptemberCommissions(pool);

  console.log("Commissions — merchant tree snapshots…");
  const treePatch = await patchCommissionTreeSnapshots(pool);

  console.log("Fees — enterprise rate overrides…");
  const overrideRows = await seedEnterpriseRateOverrides(pool, {
    platformOwnerId: platformOwner.id,
  });

  console.log("\nClient demo seed complete.");
  console.log(`  Platform team members: ${PLATFORM_TEAM.length}`);
  console.log(`  Atlas merchants: ${ATLAS_TREE.merchants.length}`);
  console.log(`  Kevin extra merchants: ${KEVIN_EXTRA.length}`);
  console.log(`  Bills marked paid (recent): ${billPatch.paidMarked}`);
  console.log(`  Bills marked overdue: ${billPatch.overdueMarked}`);
  console.log(`  Commission rows (Sep): ${commUpserted}`);
  console.log(
    `  Commission tree snapshots: ${treePatch.updated}/${treePatch.scanned}`,
  );
  console.log(`  Enterprise rate overrides: ${overrideRows}`);
  console.log("\n  See doc/UAT-Client-Review-Logins.md for screenshot logins.\n");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closePool());
