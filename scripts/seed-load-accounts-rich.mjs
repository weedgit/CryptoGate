#!/usr/bin/env node
/**
 * Enrich Load agents with a dense, Phase-1-correct Accounts forest for UI/API tests.
 *
 * Prerequisites: `node scripts/seed-local.mjs` then `node scripts/seed-load-orgs.mjs`
 * Idempotent: skips when "Load Desk 001-A" already exists.
 *
 * Matching logic (per Load Agent N):
 *   Agent
 *   ├── Load Sub-Agent N          (existing) → +2 shops (S1, S2)
 *   ├── Load Desk N-A             (new sub)  → +2 shops (A1, A2)
 *   ├── Load Desk N-B             (new sub)  → +1 shop  (B1)
 *   └── Load Shop N-R*            (+2 root shops under agent)
 *   Existing Load Merchant N stays where seed-load-orgs placed it.
 *
 * Rules respected:
 *   - agent_sub only under agent (depth 2 — never agent_sub → agent_sub)
 *   - merchant under agent or agent_sub
 *   - merchant_site only under multi_location merchant
 *   - Agents list MERCHANTS = merchant accounts in subtree (sites excluded)
 *
 * Usage: node scripts/seed-load-accounts-rich.mjs
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "../apps/api/src/auth/password-hash.mjs";
import { findUserByEmail } from "../apps/api/src/auth/users.mjs";
import { bootstrapMerchantCommercial } from "../apps/api/src/commercial/merchant-commercial-routes.mjs";
import { closePool, getPool } from "../apps/api/src/db/pool.mjs";
import { insertMembership } from "../apps/api/src/orgs/membership-store.mjs";
import { insertOrgAccount } from "../apps/api/src/orgs/org-store.mjs";

const PREFIX = "Load";
const CASHIER_PASSWORD = "LoadTest1!ab";
const STATUSES = [
  "pending_payment",
  "verifying",
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
const TIERS = ["small", "mid", "enterprise"];
const FEE_BY_TIER = { small: "1.8", mid: "1.2", enterprise: "0.9" };

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

function pad(n) {
  return String(n).padStart(3, "0");
}

function agentName(n) {
  return `${PREFIX} Agent ${pad(n)}`;
}

function subAgentName(n) {
  return `${PREFIX} Sub-Agent ${pad(n)}`;
}

function deskName(n, letter) {
  return `${PREFIX} Desk ${pad(n)}-${letter}`;
}

function shopName(n, slot) {
  return `${PREFIX} Shop ${pad(n)}-${slot}`;
}

function cashierEmail(n, slot) {
  return `cashier.rich${pad(n)}.${slot.toLowerCase()}@local.cryptogate`;
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
  const idem = `load-rich-${orgId}-${n}`;
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
       'CG-RICH-' || lpad(nextval('payment_orders_order_number_seq')::text, 8, '0'),
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

function expectedMerchantCountForAgent(_n) {
  // 1 existing Load Merchant + S1 S2 + A1 A2 + B1 + R1 R2
  return 8;
}

async function createMerchantBundle({
  pool,
  platformOwnerId,
  passwordHash,
  parentId,
  name,
  structure,
  siteCount,
  n,
  slot,
  createdAt,
}) {
  const created = await insertOrgAccount({
    type: "merchant",
    name,
    parentId,
    structure,
    maxAgentDepth: null,
  });
  if (!created.ok) {
    if (created.code === "duplicate_sibling_name") return null;
    throw new Error(`merchant ${name} failed: ${created.code ?? "unknown"}`);
  }
  const merchantId = created.row.id;

  for (let s = 1; s <= siteCount; s++) {
    const site = await insertOrgAccount({
      type: "merchant_site",
      name: `${name} · Site ${s}`,
      parentId: merchantId,
      structure: null,
      maxAgentDepth: null,
    });
    if (!site.ok && site.code !== "duplicate_sibling_name") {
      throw new Error(`site ${name} #${s} failed`);
    }
  }

  const tier = TIERS[(n + slot.length) % TIERS.length];
  try {
    await bootstrapMerchantCommercial({
      orgId: merchantId,
      tier,
      volumeFeePercent: FEE_BY_TIER[tier],
      actorUserId: platformOwnerId,
    });
  } catch (err) {
    if (!String(err?.message ?? err).includes("duplicate")) throw err;
  }

  const cashier = await insertUserWithHash(
    cashierEmail(n, slot),
    passwordHash,
  );
  await ensureMembership(merchantId, cashier.id, "cashier");
  await ensureMembership(parentId, platformOwnerId, "owner");

  await pool.query(
    `UPDATE org_accounts SET created_at = $2, updated_at = $2 WHERE id = $1`,
    [merchantId, createdAt.toISOString()],
  );

  await pool.query(
    `INSERT INTO audit_log (actor_user_id, org_id, action, metadata, created_at)
     VALUES ($1, $2, 'org_create', $3::jsonb, $4)`,
    [
      platformOwnerId,
      merchantId,
      JSON.stringify({ type: "merchant", name, seed: "load-rich" }),
      createdAt.toISOString(),
    ],
  );

  const orderCount = 2 + (n % 3);
  for (let o = 0; o < orderCount; o++) {
    const pair = ASSETS[(n + o) % ASSETS.length];
    const status = STATUSES[(n + o) % STATUSES.length];
    const amount = (30 + ((n * 11 + o * 17) % 400) + (o % 10) / 10).toFixed(2);
    await insertOrder(pool, {
      orgId: merchantId,
      createdBy: cashier.id,
      status,
      amount,
      asset: pair.asset,
      network: pair.network,
      address: fakeAddress(`${merchantId}-rich-${o}`),
      createdAt: daysAgo((n + o * 2) % 45, o),
      n: o,
    });
  }

  return merchantId;
}

async function ensureSitesForMultiMerchant(pool, merchantId, merchantName, siteCount) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM org_accounts
     WHERE type = 'merchant_site' AND parent_id = $1`,
    [merchantId],
  );
  let have = rows[0]?.n ?? 0;
  while (have < siteCount) {
    have += 1;
    const site = await insertOrgAccount({
      type: "merchant_site",
      name: `${merchantName} · Site ${have}`,
      parentId: merchantId,
      structure: null,
      maxAgentDepth: null,
    });
    if (!site.ok && site.code !== "duplicate_sibling_name") {
      throw new Error(`backfill site ${merchantName} failed`);
    }
  }
}

async function main() {
  loadEnv();
  const pool = getPool();

  const platformOwner = await findUserByEmail("owner@local.cryptogate");
  if (!platformOwner) {
    throw new Error(
      "Missing owner@local.cryptogate — run `node scripts/seed-local.mjs` first.",
    );
  }

  const { rows: agents } = await pool.query(
    `SELECT id, name FROM org_accounts
     WHERE type = 'agent' AND name LIKE $1
     ORDER BY name ASC`,
    [`${PREFIX} Agent %`],
  );
  if (agents.length === 0) {
    throw new Error(
      `No ${PREFIX} agents — run \`node scripts/seed-load-orgs.mjs\` first.`,
    );
  }

  const { rows: marker } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM org_accounts
     WHERE type = 'agent_sub' AND name = $1`,
    [deskName(1, "A")],
  );
  if ((marker[0]?.n ?? 0) > 0) {
    console.log(
      `Rich accounts seed already present (${deskName(1, "A")} exists). Skipping.`,
    );
    return;
  }

  console.log(`Hashing shared cashier password…`);
  const passwordHash = await hashPassword(CASHIER_PASSWORD);

  let desksCreated = 0;
  let shopsCreated = 0;
  let sitesBackfilled = 0;

  console.log(
    `Enriching ${agents.length} agents with desks + shops (matching Accounts tree)…`,
  );

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const m = /^Load Agent (\d+)$/.exec(agent.name);
    const n = m ? Number(m[1]) : i + 1;

    const { rows: primarySubs } = await pool.query(
      `SELECT id, name FROM org_accounts
       WHERE type = 'agent_sub' AND parent_id = $1 AND name = $2
       LIMIT 1`,
      [agent.id, subAgentName(n)],
    );
    const primarySub = primarySubs[0];
    if (!primarySub) {
      console.warn(`  skip ${agent.name}: missing ${subAgentName(n)}`);
      continue;
    }

    // Extra desks — always direct children of the agent (Phase 1 depth).
    const deskIds = {};
    for (const letter of ["A", "B"]) {
      const created = await insertOrgAccount({
        type: "agent_sub",
        name: deskName(n, letter),
        parentId: agent.id,
        structure: null,
        maxAgentDepth: null,
      });
      if (!created.ok) throw new Error(`desk ${deskName(n, letter)} failed`);
      deskIds[letter] = created.row.id;
      desksCreated += 1;
      await ensureMembership(created.row.id, platformOwner.id, "owner");
      await pool.query(
        `INSERT INTO audit_log (actor_user_id, org_id, action, metadata, created_at)
         VALUES ($1, $2, 'org_create', $3::jsonb, $4)`,
        [
          platformOwner.id,
          created.row.id,
          JSON.stringify({
            type: "agent_sub",
            name: deskName(n, letter),
            seed: "load-rich",
          }),
          daysAgo(70 - (n % 40)).toISOString(),
        ],
      );
    }

    /** @type {Array<{ parentId: string, slot: string, multi: boolean, sites: number }>} */
    const shopPlan = [
      { parentId: primarySub.id, slot: "S1", multi: false, sites: 0 },
      { parentId: primarySub.id, slot: "S2", multi: true, sites: 2 },
      { parentId: deskIds.A, slot: "A1", multi: false, sites: 0 },
      { parentId: deskIds.A, slot: "A2", multi: true, sites: 2 },
      { parentId: deskIds.B, slot: "B1", multi: false, sites: 0 },
      { parentId: agent.id, slot: "R1", multi: false, sites: 0 },
      { parentId: agent.id, slot: "R2", multi: n % 4 === 0, sites: n % 4 === 0 ? 3 : 0 },
    ];

    for (const plan of shopPlan) {
      const structure = plan.multi ? "multi_location" : "single_location";
      const id = await createMerchantBundle({
        pool,
        platformOwnerId: platformOwner.id,
        passwordHash,
        parentId: plan.parentId,
        name: shopName(n, plan.slot),
        structure,
        siteCount: plan.sites,
        n,
        slot: plan.slot,
        createdAt: daysAgo(60 - (n % 50), plan.slot.charCodeAt(0) % 9),
      });
      if (id) shopsCreated += 1;
    }

    // Backfill sites on existing multi_location Load Merchant N.
    const { rows: legacyMerchants } = await pool.query(
      `SELECT id, name, structure FROM org_accounts
       WHERE type = 'merchant' AND name = $1
       LIMIT 1`,
      [`${PREFIX} Merchant ${pad(n)}`],
    );
    const legacy = legacyMerchants[0];
    if (legacy?.structure === "multi_location") {
      const before = await pool.query(
        `SELECT COUNT(*)::int AS n FROM org_accounts
         WHERE type = 'merchant_site' AND parent_id = $1`,
        [legacy.id],
      );
      await ensureSitesForMultiMerchant(pool, legacy.id, legacy.name, 2);
      const after = await pool.query(
        `SELECT COUNT(*)::int AS n FROM org_accounts
         WHERE type = 'merchant_site' AND parent_id = $1`,
        [legacy.id],
      );
      sitesBackfilled += Math.max(0, (after.rows[0]?.n ?? 0) - (before.rows[0]?.n ?? 0));
    }

    if ((i + 1) % 10 === 0) {
      console.log(`  agents ${i + 1}/${agents.length}`);
    }
  }

  // Sanity: merchant counts for first three agents must match expected.
  console.log("\nVerifying merchant counts (type=merchant in agent subtree)…");
  for (const sample of agents.slice(0, 3)) {
    const { rows } = await pool.query(
      `WITH RECURSIVE tree AS (
         SELECT id, type, parent_id FROM org_accounts WHERE id = $1
         UNION ALL
         SELECT c.id, c.type, c.parent_id
         FROM org_accounts c
         JOIN tree t ON c.parent_id = t.id
         WHERE c.type IN ('agent', 'agent_sub', 'merchant', 'merchant_site')
       )
       SELECT COUNT(*)::int AS merchants
       FROM tree WHERE type = 'merchant'`,
      [sample.id],
    );
    const got = rows[0]?.merchants ?? 0;
    const expect = expectedMerchantCountForAgent(1);
    const ok = got === expect ? "ok" : `MISMATCH expected ${expect}`;
    console.log(`  ${sample.name}: merchants=${got} (${ok})`);
    if (got !== expect) {
      throw new Error(
        `Merchant count for ${sample.name} is ${got}, expected ${expect}`,
      );
    }
  }

  console.log("\nRich accounts seed ready:");
  console.log(`  Desks added:     ${desksCreated}`);
  console.log(`  Shops added:     ${shopsCreated}`);
  console.log(`  Sites backfill:  ${sitesBackfilled}`);
  console.log(
    `  Per agent:       ~${expectedMerchantCountForAgent(1)} merchants (list MERCHANTS column)`,
  );
  console.log(
    "  Tree shape:      Sub + Desk-A + Desk-B + root shops; sites under multi merchants",
  );
  console.log("\nRe-run bills for new shops:");
  console.log("  node scripts/seed-load-bills.mjs");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closePool());
