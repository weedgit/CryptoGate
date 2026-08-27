#!/usr/bin/env node
/**
 * Idempotent local review seed — platform + agent + merchant + login users.
 * Usage: node scripts/seed-local.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createUser, findUserByEmail } from "../apps/api/src/auth/users.mjs";
import { hashPassword } from "../apps/api/src/auth/password-hash.mjs";
import { closePool } from "../apps/api/src/db/pool.mjs";
import { bootstrapMerchantCommercial } from "../apps/api/src/commercial/merchant-commercial-routes.mjs";
import { insertMembership } from "../apps/api/src/orgs/membership-store.mjs";
import { findPlatformOrg, insertOrgAccount } from "../apps/api/src/orgs/org-store.mjs";

const USERS = [
  {
    email: "owner@local.cryptogate",
    password: "LocalReview1!",
    label: "Platform + Agent Owner",
  },
  {
    email: "merchant@local.cryptogate",
    password: "LocalReview1!",
    label: "Merchant Owner",
  },
  {
    email: "cashier@local.cryptogate",
    password: "LocalReview1!",
    label: "Merchant Cashier",
  },
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
      "postgres://cryptogate:cryptogate@localhost:5432/cryptogate";
  }
}

async function ensureUser(email, password) {
  const existing = await findUserByEmail(email);
  if (existing) {
    await resetPassword(existing.id, password);
    return existing;
  }
  return createUser({ email, password });
}

async function resetPassword(userId, password) {
  const passwordHash = await hashPassword(password);
  const pool = (await import("../apps/api/src/db/pool.mjs")).getPool();
  await pool.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [
    userId,
    passwordHash,
  ]);
}

async function ensureMembership(orgId, userId, role) {
  const pool = (await import("../apps/api/src/db/pool.mjs")).getPool();
  const { rows } = await pool.query(
    `SELECT 1 FROM org_memberships WHERE org_id = $1 AND user_id = $2`,
    [orgId, userId],
  );
  if (rows.length === 0) {
    await insertMembership({ orgId, userId, role });
  }
}

async function main() {
  loadEnv();
  const platformOwner = await ensureUser(USERS[0].email, USERS[0].password);
  const merchantOwner = await ensureUser(USERS[1].email, USERS[1].password);
  const cashier = await ensureUser(USERS[2].email, USERS[2].password);

  let platform = await findPlatformOrg();
  if (!platform) {
    const created = await insertOrgAccount({
      type: "platform",
      name: "CryptoGate Local",
      parentId: null,
      structure: null,
      maxAgentDepth: 2,
    });
    if (!created.ok) throw new Error("could not create platform org");
    platform = created.row;
  }
  await ensureMembership(platform.id, platformOwner.id, "owner");

  const pool = (await import("../apps/api/src/db/pool.mjs")).getPool();
  const { rows: agents } = await pool.query(
    `SELECT id FROM org_accounts WHERE type = 'agent' AND name = 'Demo Agent' LIMIT 1`,
  );
  let agentId = agents[0]?.id;
  if (!agentId) {
    const created = await insertOrgAccount({
      type: "agent",
      name: "Demo Agent",
      parentId: platform.id,
      structure: null,
      maxAgentDepth: null,
    });
    if (!created.ok) throw new Error("could not create agent org");
    agentId = created.row.id;
  }
  await ensureMembership(agentId, platformOwner.id, "owner");

  const { rows: merchants } = await pool.query(
    `SELECT id FROM org_accounts WHERE type = 'merchant' AND name = 'Demo Merchant' LIMIT 1`,
  );
  let merchantId = merchants[0]?.id;
  if (!merchantId) {
    const created = await insertOrgAccount({
      type: "merchant",
      name: "Demo Merchant",
      parentId: agentId,
      structure: "single_location",
      maxAgentDepth: null,
    });
    if (!created.ok) throw new Error("could not create merchant org");
    merchantId = created.row.id;
    await bootstrapMerchantCommercial({
      orgId: merchantId,
      tier: "mid",
      volumeFeePercent: "1.2",
      actorUserId: platformOwner.id,
    });
  }
  await ensureMembership(merchantId, merchantOwner.id, "owner");
  await ensureMembership(merchantId, cashier.id, "cashier");

  console.log("Local seed ready:\n");
  for (const u of USERS) {
    console.log(`  ${u.label}`);
    console.log(`    email:    ${u.email}`);
    console.log(`    password: ${u.password}\n`);
  }
  console.log("Portals (web dev server):");
  console.log("  Platform  http://127.0.0.1:5174/platform");
  console.log("  Agent     http://127.0.0.1:5174/agent");
  console.log("  Merchant  http://127.0.0.1:5174/merchant");
  console.log("\nAPI health: http://127.0.0.1:3000/health");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closePool());
