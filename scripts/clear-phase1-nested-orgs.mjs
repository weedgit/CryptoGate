#!/usr/bin/env node
/**
 * Phase 1 cleanup — remove agent_sub orgs only (merchant sites stay).
 *
 * - Reparents merchants (and sites) under agent_sub → that sub's parent agent
 * - Purges operational RESTRICT rows (same set as org-delete.mjs)
 * - Deletes agent_sub
 *
 * Usage: node scripts/clear-phase1-nested-orgs.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closePool, getPool } from "../apps/api/src/db/pool.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  for (const envPath of [
    "/etc/cryptogate/api.env",
    join(root, ".env"),
    join(root, "apps/api/.env"),
  ]) {
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!process.env[key]) {
        let val = trimmed.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
}

async function purgeOrgIds(client, orgIds) {
  if (orgIds.length === 0) return;
  await client.query(
    `DELETE FROM commission_payouts
     WHERE payee_org_id = ANY($1::uuid[]) OR payer_org_id = ANY($1::uuid[])`,
    [orgIds],
  );
  await client.query(
    `DELETE FROM payment_order_webhook_outbox WHERE org_id = ANY($1::uuid[])`,
    [orgIds],
  );
  await client.query(
    `DELETE FROM webhook_endpoints WHERE org_id = ANY($1::uuid[])`,
    [orgIds],
  );
  await client.query(`DELETE FROM api_keys WHERE org_id = ANY($1::uuid[])`, [
    orgIds,
  ]);
  await client.query(
    `DELETE FROM hd_pool_addresses WHERE org_id = ANY($1::uuid[])`,
    [orgIds],
  );
  await client.query(
    `DELETE FROM payment_orders WHERE org_id = ANY($1::uuid[])`,
    [orgIds],
  );
  await client.query(
    `DELETE FROM service_bills WHERE org_id = ANY($1::uuid[])`,
    [orgIds],
  );
  await client.query(
    `DELETE FROM site_setting_overrides
     WHERE site_org_id = ANY($1::uuid[]) OR parent_org_id = ANY($1::uuid[])`,
    [orgIds],
  );
  await client.query(
    `DELETE FROM enterprise_rate_approvals WHERE org_id = ANY($1::uuid[])`,
    [orgIds],
  );
  await client.query(
    `DELETE FROM notification_preferences WHERE org_id = ANY($1::uuid[])`,
    [orgIds],
  );
  await client.query(
    `DELETE FROM agent_commission WHERE org_id = ANY($1::uuid[])`,
    [orgIds],
  );
  await client.query(
    `DELETE FROM agent_payout_addresses WHERE org_id = ANY($1::uuid[])`,
    [orgIds],
  );
  await client.query(
    `DELETE FROM settlement_addresses WHERE org_id = ANY($1::uuid[])`,
    [orgIds],
  );
  await client.query(
    `DELETE FROM merchant_matching_settings WHERE org_id = ANY($1::uuid[])`,
    [orgIds],
  );
  await client.query(
    `DELETE FROM merchant_commercial WHERE org_id = ANY($1::uuid[])`,
    [orgIds],
  );
  await client.query(
    `DELETE FROM merchant_xpubs WHERE org_id = ANY($1::uuid[])`,
    [orgIds],
  );
  await client.query(
    `DELETE FROM compliance_overrides WHERE org_id = ANY($1::uuid[])`,
    [orgIds],
  );
}

async function main() {
  loadEnv();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const before = await client.query(
      `SELECT type, count(*)::int AS n
       FROM org_accounts
       WHERE type = 'agent_sub'
       GROUP BY type`,
    );
    console.log(
      "before:",
      before.rows.length
        ? before.rows.map((r) => `${r.type}=${r.n}`).join(" ")
        : "none",
    );

    const reparent = await client.query(
      `UPDATE org_accounts m
       SET parent_id = s.parent_id, updated_at = now()
       FROM org_accounts s
       WHERE m.parent_id = s.id
         AND s.type = 'agent_sub'
         AND m.type IN ('merchant', 'merchant_site')
       RETURNING m.id`,
    );
    console.log(`reparented_from_agent_sub=${reparent.rowCount}`);

    const doomed = await client.query(
      `SELECT id FROM org_accounts WHERE type = 'agent_sub'`,
    );
    const doomedIds = doomed.rows.map((r) => r.id);
    await purgeOrgIds(client, doomedIds);
    console.log(`purged_ops_for=${doomedIds.length}`);

    const delSubs = await client.query(
      `DELETE FROM org_accounts WHERE type = 'agent_sub' RETURNING id`,
    );
    console.log(`deleted_agent_sub=${delSubs.rowCount}`);

    const after = await client.query(
      `SELECT count(*)::int AS n FROM org_accounts WHERE type = 'agent_sub'`,
    );
    if (after.rows[0].n > 0) {
      throw new Error(`cleanup incomplete: agent_sub=${after.rows[0].n}`);
    }

    const summary = await client.query(
      `SELECT type, count(*)::int AS n FROM org_accounts GROUP BY type ORDER BY type`,
    );
    console.log(
      "org_counts:",
      summary.rows.map((r) => `${r.type}=${r.n}`).join(" "),
    );

    await client.query("COMMIT");
    console.log("ok: agent_sub cleared (merchant sites preserved)");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
