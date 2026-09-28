#!/usr/bin/env node
/**
 * Kevin Multi Merchant — site + cashier logins and today's site orders.
 *
 *   Kevin Multi · Casablanca  owner, admin, cashier A (POS PIN), cashier B (no PIN)
 *   Kevin Multi · Marrakech   owner, cashier A (POS PIN)
 *   Mixed-role user           Marrakech administrator + Casablanca cashier (workspace switcher)
 *
 * Orders are stamped "today" so the site home (opens on Today) has data; re-run
 * on a later day to add a fresh set. Idempotent per day.
 *
 * Prerequisites: node scripts/seed-kevin-uat.mjs
 * Usage: node scripts/seed-kevin-multi-sites.mjs
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  clearUserPosPin,
  createUser,
  findUserByEmail,
  setUserPosPin,
} from "../apps/api/src/auth/users.mjs";
import { hashPassword } from "../apps/api/src/auth/password-hash.mjs";
import { closePool, getPool } from "../apps/api/src/db/pool.mjs";
import { insertMembership } from "../apps/api/src/orgs/membership-store.mjs";
import { SEED_PASSWORD } from "./seed-constants.mjs";
import { markUatDemoUserReady } from "./seed-uat-user-ready.mjs";
import { NILE_HD_WALLETS, UAT_SETTLEMENT } from "./seed-nile-wallets.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MERCHANT = "Kevin Multi Merchant";
const POS_PIN = "1234";

const SITES = {
  casa: {
    name: "Kevin Multi · Casablanca",
    users: [
      { email: "own.multi-casa@paymentgate.io", role: "owner", name: "Casablanca Site Owner" },
      { email: "admin.multi-casa@paymentgate.io", role: "administrator", name: "Casablanca Site Admin" },
      { email: "cashier.multi-casa.a@paymentgate.io", role: "cashier", name: "Casablanca Cashier A", pin: true },
      { email: "cashier.multi-casa.b@paymentgate.io", role: "cashier", name: "Casablanca Cashier B", pin: false },
    ],
    orders: [
      { slot: 1, status: "completed", amount: "42.50", minutesAgo: 180, by: "cashier.multi-casa.a" },
      { slot: 2, status: "completed", amount: "18.00", minutesAgo: 95, by: "cashier.multi-casa.a" },
      { slot: 3, status: "verifying", amount: "27.30", minutesAgo: 12, by: "cashier.multi-casa.a" },
      { slot: 4, status: "pending_payment", amount: "12.40", minutesAgo: 4, by: "cashier.multi-casa.a" },
      { slot: 5, status: "payment_anomaly", amount: "33.00", received: "30.00", minutesAgo: 60, by: "cashier.multi-casa.a" },
      { slot: 6, status: "completed", amount: "9.90", minutesAgo: 40, by: "mixed.multi" },
    ],
  },
  rak: {
    name: "Kevin Multi · Marrakech",
    users: [
      { email: "own.multi-rak@paymentgate.io", role: "owner", name: "Marrakech Site Owner" },
      { email: "cashier.multi-rak.a@paymentgate.io", role: "cashier", name: "Marrakech Cashier A", pin: true },
    ],
    orders: [
      { slot: 1, status: "completed", amount: "65.00", minutesAgo: 150, by: "cashier.multi-rak.a" },
      { slot: 2, status: "completed", amount: "21.75", minutesAgo: 70, by: "cashier.multi-rak.a" },
      { slot: 3, status: "pending_payment", amount: "14.60", minutesAgo: 6, by: "cashier.multi-rak.a" },
    ],
  },
};

const MIXED = {
  email: "mixed.multi@paymentgate.io",
  name: "Multi Mixed Role",
  memberships: [
    { site: "rak", role: "administrator" },
    { site: "casa", role: "cashier" },
  ],
  pin: true,
};

function loadEnv() {
  const files = [join(root, ".env"), "/etc/paymentgate/api.env", "/etc/cryptogate/api.env", "/etc/cryptogate/postgres.env"];
  for (const file of files) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key] || (key === "DATABASE_URL" && file.startsWith("/etc/"))) {
        process.env[key] = val;
      }
    }
  }
  process.env.DATABASE_URL ??= "postgres://cryptogate:cryptogate@127.0.0.1:5433/cryptogate";
}

async function ensureUser(email, displayName) {
  const pool = getPool();
  let user = await findUserByEmail(email);
  if (!user) user = await createUser({ email, password: SEED_PASSWORD });
  await pool.query(
    `UPDATE users SET password_hash = $2, display_name = $3, must_change_password = false WHERE id = $1`,
    [user.id, await hashPassword(SEED_PASSWORD), displayName],
  );
  const [firstName, ...rest] = displayName.split(/\s+/);
  await markUatDemoUserReady(pool, user.id, { firstName, lastName: rest.join(" ") || "User" });
  return user;
}

async function ensureMembership(orgId, userId, role) {
  const result = await insertMembership({ orgId, userId, role });
  if (!result.ok) {
    await getPool().query(
      `UPDATE org_memberships SET role = $3 WHERE org_id = $1 AND user_id = $2`,
      [orgId, userId, role],
    );
  }
}

async function applyPin(userId, pin) {
  if (pin) await setUserPosPin(userId, POS_PIN);
  else await clearUserPosPin(userId);
}

async function ensureOrder(pool, { orgId, siteKey, day, order, createdBy, receiveAddress }) {
  const createdAt = new Date(Date.now() - order.minutesAgo * 60_000);
  const expiresAt = new Date(createdAt.getTime() + 30 * 60_000);
  const idem = `kevin-multi-sites-${siteKey}-${day}-${order.slot}`;
  const settled = ["completed", "verifying", "payment_anomaly"].includes(order.status);
  const confirmations = order.status === "completed" ? 19 : order.status === "verifying" ? 4 : settled ? 19 : 0;
  const { rowCount } = await pool.query(
    `INSERT INTO payment_orders (
       org_id, created_by, order_number, status, matching_mode,
       payable_amount, invoice_amount_usd, invoice_currency,
       receive_address, address_source, asset, network,
       expires_at, required_confirmations,
       idempotency_key, idempotency_body_hash, merchant_metadata,
       created_at, updated_at,
       received_amount, tx_hash, confirmations
     ) VALUES (
       $1, $2,
       'CG-UAT-' || lpad(nextval('payment_orders_order_number_seq')::text, 8, '0'),
       $3, 'B', $4, $4, 'USD', $5, 'main',
       $6, $7, $8, 19,
       $9, $10, '{"seed":"kevin-multi-sites"}'::jsonb,
       $11, $11,
       $12, $13, $14
     )
     ON CONFLICT (org_id, idempotency_key) DO NOTHING`,
    [
      orgId,
      createdBy,
      order.status,
      order.amount,
      receiveAddress,
      UAT_SETTLEMENT.asset,
      UAT_SETTLEMENT.network,
      expiresAt.toISOString(),
      idem,
      createHash("sha256").update(idem).digest("hex"),
      createdAt.toISOString(),
      settled ? (order.received ?? order.amount) : null,
      settled ? createHash("sha256").update(`uat-tx-${idem}`).digest("hex") : null,
      confirmations,
    ],
  );
  return rowCount;
}

async function main() {
  loadEnv();
  const pool = getPool();

  const { rows: merchants } = await pool.query(
    `SELECT id FROM org_accounts WHERE type = 'merchant' AND name = $1 LIMIT 1`,
    [MERCHANT],
  );
  const merchantId = merchants[0]?.id;
  if (!merchantId) throw new Error(`Missing "${MERCHANT}" — run node scripts/seed-kevin-uat.mjs first.`);

  const { rows: settlement } = await pool.query(
    `SELECT address FROM settlement_addresses WHERE org_id = $1 AND asset = $2 AND network = $3`,
    [merchantId, UAT_SETTLEMENT.asset, UAT_SETTLEMENT.network],
  );
  const receiveAddress = settlement[0]?.address ?? NILE_HD_WALLETS.customer2;

  const siteIds = {};
  for (const [key, site] of Object.entries(SITES)) {
    const { rows } = await pool.query(
      `SELECT id FROM org_accounts WHERE type = 'merchant_site' AND parent_id = $1 AND name = $2 LIMIT 1`,
      [merchantId, site.name],
    );
    if (!rows[0]?.id) throw new Error(`Missing site "${site.name}" — run node scripts/seed-kevin-uat.mjs first.`);
    siteIds[key] = rows[0].id;
  }

  const userIds = {};
  for (const [key, site] of Object.entries(SITES)) {
    for (const u of site.users) {
      const user = await ensureUser(u.email, u.name);
      await ensureMembership(siteIds[key], user.id, u.role);
      if (u.role === "cashier") await applyPin(user.id, u.pin);
      userIds[u.email.split("@")[0]] = user.id;
    }
  }

  const mixed = await ensureUser(MIXED.email, MIXED.name);
  for (const m of MIXED.memberships) await ensureMembership(siteIds[m.site], mixed.id, m.role);
  await applyPin(mixed.id, MIXED.pin);
  userIds[MIXED.email.split("@")[0]] = mixed.id;

  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  let inserted = 0;
  for (const [key, site] of Object.entries(SITES)) {
    for (const order of site.orders) {
      inserted += await ensureOrder(pool, {
        orgId: siteIds[key],
        siteKey: key,
        day,
        order,
        createdBy: userIds[order.by],
        receiveAddress,
      });
    }
  }

  console.log(`\nKevin Multi sites seed complete (${inserted} new orders today).`);
  console.log(`  Password (all): ${SEED_PASSWORD}   Cashier POS PIN: ${POS_PIN}\n`);
  const rows = [
    ...Object.values(SITES).flatMap((s) =>
      s.users.map((u) => [u.email, `${u.role}${u.role === "cashier" ? (u.pin ? " (PIN)" : " (no PIN)") : ""}`, s.name]),
    ),
    [MIXED.email, "administrator + cashier (PIN)", "Marrakech admin · Casablanca cashier"],
  ];
  for (const [email, role, where] of rows) {
    console.log(`  ${email.padEnd(40)} ${role.padEnd(30)} ${where}`);
  }
  console.log("\n  Portal: https://merchant-cg.boostbunny.io/\n");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closePool());
