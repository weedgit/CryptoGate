#!/usr/bin/env node
/**
 * Detach load-test gen-*@paymentgate.local users from the platform org.
 *
 * Leaves real owners intact. Clears their sessions. Optionally deletes orphan
 * gen users with --delete-users when they have no remaining memberships.
 *
 * Usage:
 *   node scripts/cleanup-gen-platform-members.mjs
 *   node scripts/cleanup-gen-platform-members.mjs --delete-users
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closePool, getPool } from "../apps/api/src/db/pool.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const deleteUsers = process.argv.includes("--delete-users");

function loadEnv() {
  for (const p of ["/etc/cryptogate/api.env", join(root, ".env")]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

async function main() {
  loadEnv();
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL required");
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const realOwners = await client.query(`
      SELECT count(*)::int AS n
      FROM org_memberships m
      JOIN org_accounts o ON o.id = m.org_id AND o.type = 'platform'
      JOIN users u ON u.id = m.user_id
      WHERE m.role = 'owner'
        AND u.email NOT ILIKE 'gen-%@paymentgate.local'
    `);
    if (realOwners.rows[0].n < 1) {
      throw new Error("refusing: no real platform owner would remain");
    }

    const rem = await client.query(`
      DELETE FROM org_memberships m
      USING users u, org_accounts o
      WHERE m.user_id = u.id
        AND m.org_id = o.id
        AND o.type = 'platform'
        AND u.email ILIKE 'gen-%@paymentgate.local'
      RETURNING u.email, m.role
    `);
    console.log(`detached_platform_memberships=${rem.rowCount}`);
    for (const r of rem.rows) console.log(`  ${r.email} (${r.role})`);

    const sess = await client.query(`
      DELETE FROM sessions s
      USING users u
      WHERE s.user_id = u.id AND u.email ILIKE 'gen-%@paymentgate.local'
    `);
    console.log(`sessions_cleared=${sess.rowCount}`);

    if (deleteUsers) {
      const del = await client.query(`
        DELETE FROM users u
        WHERE u.email ILIKE 'gen-%@paymentgate.local'
          AND NOT EXISTS (
            SELECT 1 FROM org_memberships m WHERE m.user_id = u.id
          )
        RETURNING email
      `);
      console.log(`orphan_users_deleted=${del.rowCount}`);
      for (const r of del.rows) console.log(`  ${r.email}`);
    }

    const leftMem = await client.query(`
      SELECT count(*)::int AS n
      FROM org_memberships m
      JOIN users u ON u.id = m.user_id
      JOIN org_accounts o ON o.id = m.org_id AND o.type = 'platform'
      WHERE u.email ILIKE 'gen-%@paymentgate.local'
    `);
    console.log(`remaining_gen_platform_memberships=${leftMem.rows[0].n}`);
    await client.query("COMMIT");
    console.log("ok");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
