#!/usr/bin/env node
/**
 * Test tree seed — clears all data except the platform owner, platform org and
 * platform settings, then creates:
 *   100 agents      (Test Agent 001…100) under the platform
 *   100 merchants   (Test Merchant 001…100), one under each agent
 *   100 sites       merchants 001…020 each get a 5-level chain (L1 → L5)
 *
 * Every agent and merchant has its own ready-to-use Owner:
 *   owner.agent001@seed.test … owner.merchant100@seed.test
 * Password: User1234567890!
 * Seed users are verified with a complete profile and wallet, and merchants
 * have activation paid, so no setup gate blocks testing.
 *
 * `.test` addresses are never emailed (mail suppression), and the platform
 * owner is not a member of seeded orgs, so seeding sends no mail.
 *
 * Usage: node scripts/seed-test-tree.mjs
 */
import { hashPassword } from "../apps/api/src/auth/password-hash.mjs";
import { closePool, getPool } from "../apps/api/src/db/pool.mjs";
import { SEED_PASSWORD, SEED_PLATFORM_OWNER_EMAIL } from "./seed-constants.mjs";
import { loadSeedEnv } from "./seed-env.mjs";
import { resolvePlatformFeeNetwork } from "../packages/domain/dist/index.js";

const AGENTS = 100;
const MERCHANTS = 100;
const SITE_CHAINS = 20;
const SITE_DEPTH = 5;
const WALLET = "TKHT1GJK6PE5L2FLGQKWsXt4JYvNzTjYjE";

const pad = (n) => String(n).padStart(3, "0");

async function wipeKeepingPlatformOwner(client) {
  const owner = await client.query(`SELECT id FROM users WHERE email = $1`, [
    SEED_PLATFORM_OWNER_EMAIL,
  ]);
  const platform = await client.query(
    `SELECT id FROM org_accounts WHERE type = 'platform'`,
  );
  if (owner.rowCount !== 1 || platform.rowCount !== 1) {
    throw new Error(
      `expected one platform owner (${SEED_PLATFORM_OWNER_EMAIL}) and one platform org — run scripts/seed-local.mjs first`,
    );
  }
  const ownerId = owner.rows[0].id;
  const platformId = platform.rows[0].id;

  await client.query(`TRUNCATE audit_log, audit_log_archive`);
  for (const table of [
    "payment_order_webhook_outbox",
    "hd_pool_addresses",
    "payment_orders",
    "webhook_deliveries",
    "webhook_endpoints",
    "api_signing_nonces",
    "api_keys",
    "service_bills",
    "commission_payouts",
    "compliance_overrides",
    "site_setting_overrides",
    "invoice_export_jobs",
  ]) {
    await client.query(`DELETE FROM ${table}`);
  }
  for (;;) {
    const res = await client.query(
      `DELETE FROM org_accounts o
       WHERE o.id <> $1
         AND NOT EXISTS (SELECT 1 FROM org_accounts c WHERE c.parent_id = o.id)`,
      [platformId],
    );
    if (res.rowCount === 0) break;
  }
  await client.query(`DELETE FROM users WHERE id <> $1`, [ownerId]);
  await client.query(`DELETE FROM sessions WHERE user_id <> $1`, [ownerId]);
  await client.query(`DELETE FROM contact_otps`);
  await client.query(`DELETE FROM password_reset_tokens`);
  await client.query(`DELETE FROM notification_preferences`);
  await client.query(`ALTER SEQUENCE payment_orders_order_number_seq RESTART WITH 1`);
  return platformId;
}

async function insertOrg(client, { type, name, parentId, email }) {
  const { rows } = await client.query(
    `INSERT INTO org_accounts (type, name, parent_id, country, billing_email, legal_name, business_timezone)
     VALUES ($1, $2, $3, 'US', $4, $2, 'UTC')
     RETURNING id`,
    [type, name, parentId, email],
  );
  return rows[0].id;
}

async function insertOwner(client, { email, firstName, lastName, phone, orgId, passwordHash }) {
  const { rows } = await client.query(
    `INSERT INTO users (
       email, password_hash, first_name, last_name, display_name, timezone,
       timezone_confirmed_at, phone, email_verified_at, phone_verified_at
     ) VALUES ($1, $2, $3, $4, $3 || ' ' || $4, 'UTC', now(), $5, now(), now())
     RETURNING id`,
    [email, passwordHash, firstName, lastName, phone],
  );
  await client.query(
    `INSERT INTO org_memberships (org_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [orgId, rows[0].id],
  );
}

async function main() {
  loadSeedEnv();
  const pool = getPool();
  const passwordHash = await hashPassword(SEED_PASSWORD);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    console.log("Clearing data (keeping platform owner, platform org, platform settings)…");
    const platformId = await wipeKeepingPlatformOwner(client);

    console.log(`Creating ${AGENTS} agents, ${MERCHANTS} merchants, ${SITE_CHAINS * SITE_DEPTH} sites…`);
    const merchantIds = [];
    for (let i = 1; i <= AGENTS; i += 1) {
      const agentId = await insertOrg(client, {
        type: "agent",
        name: `Test Agent ${pad(i)}`,
        parentId: platformId,
        email: `billing.agent${pad(i)}@seed.test`,
      });
      await insertOwner(client, {
        email: `owner.agent${pad(i)}@seed.test`,
        firstName: "Agent",
        lastName: pad(i),
        phone: `+1555100${String(i).padStart(4, "0")}`,
        orgId: agentId,
        passwordHash,
      });
      await client.query(
        `INSERT INTO agent_payout_addresses (org_id, asset, network, address) VALUES ($1, 'USDT', $2, $3)`,
        [agentId, resolvePlatformFeeNetwork(), WALLET],
      );

      if (i > MERCHANTS) continue;
      const merchantId = await insertOrg(client, {
        type: "merchant",
        name: `Test Merchant ${pad(i)}`,
        parentId: agentId,
        email: `billing.merchant${pad(i)}@seed.test`,
      });
      await insertOwner(client, {
        email: `owner.merchant${pad(i)}@seed.test`,
        firstName: "Merchant",
        lastName: pad(i),
        phone: `+1555200${String(i).padStart(4, "0")}`,
        orgId: merchantId,
        passwordHash,
      });
      await client.query(
        `INSERT INTO settlement_addresses (org_id, asset, network, address) VALUES ($1, 'USDT', $2, $3)`,
        [merchantId, resolvePlatformFeeNetwork(), WALLET],
      );
      await client.query(
        `INSERT INTO merchant_commercial (
           org_id, tier, volume_fee_percent, effective_from, rate_mode,
           billing_anchor_at, next_invoice_on, volume_period_start
         ) VALUES ($1, 'small', '1.8', current_date, 'automatic', now(),
                   (current_date + interval '1 month')::date, current_date)`,
        [merchantId],
      );
      merchantIds.push(merchantId);
    }

    for (let m = 1; m <= SITE_CHAINS; m += 1) {
      let parentId = merchantIds[m - 1];
      for (let level = 1; level <= SITE_DEPTH; level += 1) {
        parentId = await insertOrg(client, {
          type: "merchant_site",
          name: `Test Merchant ${pad(m)} · Site L${level}`,
          parentId,
          email: `billing.merchant${pad(m)}@seed.test`,
        });
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const { rows } = await pool.query(
    `SELECT type, count(*)::int AS n FROM org_accounts GROUP BY type ORDER BY type`,
  );
  console.log("\nTest tree ready:");
  for (const r of rows) console.log(`  ${r.type.padEnd(14)} ${r.n}`);
  console.log(`\n  Platform owner: ${SEED_PLATFORM_OWNER_EMAIL} (unchanged)`);
  console.log(`  Agent owners:    owner.agent001@seed.test … owner.agent${pad(AGENTS)}@seed.test`);
  console.log(`  Merchant owners: owner.merchant001@seed.test … owner.merchant${pad(MERCHANTS)}@seed.test`);
  console.log(`  Password:        ${SEED_PASSWORD}`);
  console.log(`  Sites:           Test Merchant 001…${pad(SITE_CHAINS)} → Site L1 → … → L${SITE_DEPTH}\n`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
