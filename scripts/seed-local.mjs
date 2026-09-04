#!/usr/bin/env node
/**
 * Minimal local seed — platform org + platform owner only.
 *
 * Wipes all application data (keeps schema_migrations), then creates:
 *   own.platform@paymentgate.io — Platform Owner
 *   Password: User1234567890!
 *
 * Usage: node scripts/seed-local.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createUser, findUserByEmail } from "../apps/api/src/auth/users.mjs";
import { hashPassword } from "../apps/api/src/auth/password-hash.mjs";
import { closePool, getPool } from "../apps/api/src/db/pool.mjs";
import { insertMembership } from "../apps/api/src/orgs/membership-store.mjs";
import { insertOrgAccount } from "../apps/api/src/orgs/org-store.mjs";
import { ensureDefaultFeeTierBands } from "../apps/api/src/platform-settings/fee-tier-store.mjs";

import { SEED_PASSWORD, SEED_PLATFORM_OWNER_EMAIL } from "./seed-constants.mjs";

export { SEED_PASSWORD, SEED_PLATFORM_OWNER_EMAIL };

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
  for (const fallback of [
    "/etc/paymentgate/api.env",
    "/etc/cryptogate/api.env",
  ]) {
    if (!existsSync(fallback)) continue;
    for (const line of readFileSync(fallback, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (key === "DATABASE_URL") {
        process.env.DATABASE_URL = trimmed.slice(eq + 1).trim();
        return;
      }
    }
  }
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
      "postgres://paymentgate:paymentgate@localhost:5432/paymentgate";
  }
}

async function wipeApplicationData(pool) {
  const { rows } = await pool.query(
    `SELECT tablename
     FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> 'schema_migrations'
     ORDER BY tablename`,
  );
  if (rows.length === 0) return;
  const names = rows.map((r) => `"${r.tablename}"`).join(", ");
  await pool.query(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
}

async function ensurePlatformBillingDefaults(pool) {
  await pool.query(
    `INSERT INTO platform_billing_settings (id, seller_name, seller_email, pay_to)
     VALUES (1, 'PaymentGate', NULL, NULL)
     ON CONFLICT (id) DO NOTHING`,
  );
}

async function ensureUser(email, password) {
  const existing = await findUserByEmail(email);
  if (existing) {
    const passwordHash = await hashPassword(password);
    await getPool().query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [
      existing.id,
      passwordHash,
    ]);
    return existing;
  }
  const created = await createUser({ email, password });
  const passwordHash = await hashPassword(password);
  await getPool().query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [
    created.id,
    passwordHash,
  ]);
  return created;
}

async function main() {
  loadEnv();
  const pool = getPool();

  console.log("Wiping application data…");
  await wipeApplicationData(pool);
  await ensurePlatformBillingDefaults(pool);
  await ensureDefaultFeeTierBands();

  const owner = await ensureUser(SEED_PLATFORM_OWNER_EMAIL, SEED_PASSWORD);
  await pool.query(
    `UPDATE users SET display_name = $2 WHERE id = $1`,
    [owner.id, "Platform Owner"],
  );

  const created = await insertOrgAccount({
    type: "platform",
    name: "PaymentGate",
    parentId: null,
    structure: null,
    maxAgentDepth: 2,
  });
  if (!created.ok) throw new Error("could not create platform org");
  const platform = created.row;

  await insertMembership({
    orgId: platform.id,
    userId: owner.id,
    role: "owner",
  });

  console.log("\nSeed complete — platform owner only.\n");
  console.log(`  Email:    ${SEED_PLATFORM_OWNER_EMAIL}`);
  console.log(`  Password: ${SEED_PASSWORD}`);
  console.log(`  Org:      ${platform.name} (${platform.id})`);
  console.log("\n  Platform   https://platform-cg.boostbunny.io/");
  console.log("  Local      http://127.0.0.1:5174/platform\n");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closePool());
