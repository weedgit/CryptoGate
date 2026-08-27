#!/usr/bin/env node
/**
 * Backfill merchants/agents with Phase-1 platform settings for UI/API tests.
 *
 * Seeds (idempotent ON CONFLICT / skips) — **all** merchant/agent orgs:
 *   - merchant_matching_settings — B / C / D / S cycling by name index
 *   - settlement_addresses — USDT/tron (+ ethereum for every 3rd merchant)
 *   - merchant_xpubs — watch-only BIP32 test vector for Mode S only
 *   - agent_commission — varied % for agent / agent_sub
 *   - agent_payout_addresses — USDT/tron payout per agent org
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

async function main() {
  loadEnv();
  const pool = getPool();

  const platformOwner = await findUserByEmail("owner@local.cryptogate");
  if (!platformOwner) {
    throw new Error(
      "Missing owner@local.cryptogate — run `node scripts/seed-local.mjs` first.",
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
    const pct = COMMISSION_CYCLE[(n - 1) % COMMISSION_CYCLE.length];
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

    const pRes = await pool.query(
      `INSERT INTO agent_payout_addresses (org_id, asset, network, address)
       VALUES ($1, 'USDT', 'tron', $2)
       ON CONFLICT (org_id) DO NOTHING
       RETURNING org_id`,
      [a.id, fakeAddress(`payout-${a.id}`)],
    );
    if (pRes.rowCount) payouts += 1;
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

  console.log("\nPlatform-logic seed ready:");
  console.log(`  Matching modes upserted:   ${matching}`);
  console.log(`  Settlement addresses:      ${settlement}`);
  console.log(`  Mode S xPubs:              ${xpubs}`);
  console.log(`  Sites backfilled:          ${sites}`);
  console.log(`  Enterprise pending:        ${enterprise}`);
  console.log(`  Compliance anomalies:      ${anomalies}`);
  console.log(`  Agent commissions:         ${commission}`);
  console.log(`  Agent payouts:             ${payouts}`);
  console.log(`  Suspend audits (reason):   ${suspendAudit}`);
  console.log("\nVerification:");
  console.log(
    `  Matching mix: ${modeCounts.map((r) => `${r.matching_mode}=${r.n}`).join(" · ") || "(none)"}`,
  );
  console.log(`  Multi-location with sites: ${multiWithSites[0]?.n ?? 0}`);
  console.log(`  Merchants with settlement: ${withSettlement[0]?.n ?? 0}`);
  console.log(`  Mode S with xPub:          ${modeSWithXpub[0]?.n ?? 0}`);
  console.log("\nUI checks:");
  console.log("  Settlement → Mode / Scope follow B·C·D·S");
  console.log("  Addresses appear for every merchant; xPub only when Mode = S");
  console.log("  Sites → multi merchants list sites; single shows empty state");
  console.log("  Compliance → pending enterprise + payment anomalies");
  console.log("  Agents → Profile commission + payout address");
  console.log(
    "\nTry: Load Shop 001-R1 (anomalies + enterprise pending) · Load Merchant 004 (Mode S)",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closePool());
