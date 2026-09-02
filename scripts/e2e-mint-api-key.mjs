#!/usr/bin/env node
/**
 * Local/dev only — mint a merchant API key for X-07 signed live smoke.
 *
 *   node scripts/e2e-mint-api-key.mjs
 *   # prints E2E_API_KEY_ID / E2E_API_SECRET (secret once)
 *
 * Uses DATABASE_URL (.env). Does not commit secrets.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closePool, getPool } from "../apps/api/src/db/pool.mjs";
import {
  generateApiKeyId,
  generateApiKeySecret,
} from "../apps/api/src/api-keys/api-key-rules.mjs";
import { insertApiKey } from "../apps/api/src/signing/api-key-store.mjs";

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

async function main() {
  loadEnv();
  const email = process.env.E2E_MERCHANT_EMAIL ?? "owner.singlemerchant@paymentgate.io";
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT u.id AS user_id, m.org_id
     FROM users u
     INNER JOIN org_memberships m ON m.user_id = u.id
     INNER JOIN org_accounts o ON o.id = m.org_id
     WHERE lower(u.email) = lower($1)
       AND o.type = 'merchant'
       AND m.role IN ('owner', 'administrator')
       AND coalesce(m.status, 'active') = 'active'
     LIMIT 1`,
    [email],
  );
  const row = rows[0];
  if (!row) {
    console.error(`No merchant Owner/Admin membership for ${email} — run seed-local`);
    process.exit(1);
  }

  const keyId = generateApiKeyId();
  const secret = generateApiKeySecret();
  const inserted = await insertApiKey({
    orgId: row.org_id,
    userId: row.user_id,
    keyId,
    secret,
    label: "e2e-smoke",
    expiresAt: null,
  });
  if (!inserted.ok) {
    console.error("API key limit reached for merchant org");
    process.exit(1);
  }

  console.log(`# Merchant org ${row.org_id}`);
  console.log(`export E2E_API_KEY_ID=${keyId}`);
  console.log(`export E2E_API_SECRET=${secret}`);
  console.log(
    `# Then: E2E_API_BASE=http://127.0.0.1:3000 node scripts/e2e-smoke.mjs --live`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await closePool();
  });
