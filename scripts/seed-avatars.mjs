#!/usr/bin/env node
/**
 * Assign demo avatar images to known seed users.
 *
 * Stores public paths (`/avatars/seed-NN.jpg`) on users.avatar_url.
 * Idempotent — safe to re-run against an existing UAT database.
 *
 * Usage: node scripts/seed-avatars.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closePool, getPool } from "../apps/api/src/db/pool.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Fixed email → public avatar path (12 images). */
export const SEED_AVATAR_BY_EMAIL = Object.freeze({
  "own.platform@paymentgate.io": "/avatars/seed-01.jpg",
  "admin.platform@paymentgate.io": "/avatars/seed-02.jpg",
  "view.platform@paymentgate.io": "/avatars/seed-03.jpg",
  "own.agent@paymentgate.io": "/avatars/seed-04.jpg",
  "admin.agent@paymentgate.io": "/avatars/seed-05.jpg",
  "view.agent@paymentgate.io": "/avatars/seed-06.jpg",
  "own.single@paymentgate.io": "/avatars/seed-07.jpg",
  "cashier.single@paymentgate.io": "/avatars/seed-08.jpg",
  "own.multi@paymentgate.io": "/avatars/seed-09.jpg",
  "cashier.multi@paymentgate.io": "/avatars/seed-10.jpg",
  "own.merchant2@paymentgate.io": "/avatars/seed-11.jpg",
  "cashier.merchant2@paymentgate.io": "/avatars/seed-12.jpg",
});

function loadEnv() {
  for (const envPath of [
    join(root, ".env"),
    "/etc/paymentgate/api.env",
    join(root, "apps/api/.env"),
  ]) {
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
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

/**
 * @param {import("pg").Pool} [pool]
 * @returns {Promise<{ updated: number; missing: string[]; filledBlank: number }>}
 */
export async function seedDemoAvatars(pool = getPool()) {
  let updated = 0;
  /** @type {string[]} */
  const missing = [];
  for (const [email, avatarUrl] of Object.entries(SEED_AVATAR_BY_EMAIL)) {
    const { rowCount } = await pool.query(
      `UPDATE users SET avatar_url = $2 WHERE lower(email) = lower($1)`,
      [email, avatarUrl],
    );
    if (rowCount && rowCount > 0) updated += 1;
    else missing.push(email);
  }

  // Cycle leftover seed photos onto any user still without an avatar (load-seed, ops, etc.).
  const paths = Array.from({ length: 12 }, (_, i) => {
    const n = String(i + 1).padStart(2, "0");
    return `/avatars/seed-${n}.jpg`;
  });
  const { rows: blank } = await pool.query(
    `SELECT id FROM users
     WHERE avatar_url IS NULL OR btrim(avatar_url) = ''
     ORDER BY created_at ASC NULLS LAST, email ASC`,
  );
  let filledBlank = 0;
  for (let i = 0; i < blank.length; i++) {
    const avatarUrl = paths[i % paths.length];
    const { rowCount } = await pool.query(
      `UPDATE users SET avatar_url = $2 WHERE id = $1`,
      [blank[i].id, avatarUrl],
    );
    if (rowCount) filledBlank += 1;
  }

  return { updated, missing, filledBlank };
}

async function main() {
  loadEnv();
  const { updated, missing, filledBlank } = await seedDemoAvatars();
  console.log(`\nSeed avatars: mapped ${updated} known user(s).`);
  if (filledBlank) {
    console.log(`  Filled blank avatars: ${filledBlank}`);
  }
  if (missing.length) {
    console.log(`  Skipped (user not found): ${missing.join(", ")}`);
  }
  console.log("");
}

const isDirectRun =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  main()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => closePool());
}
