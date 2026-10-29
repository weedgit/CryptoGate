/**
 * Postgres integration for watcher order writes. Skipped when DATABASE_URL is unset.
 * Uses the API migrations for the schema.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { applyMatchResult } from "../src/orders/order-store.mjs";

const describePg = process.env.DATABASE_URL?.trim() ? describe : describe.skip;
const apiRoot = join(dirname(fileURLToPath(import.meta.url)), "../../api");

describePg("watcher order-store against Postgres", () => {
  /** @type {pg.Pool} */
  let pool;
  /** @type {string} */
  let orgId;
  /** @type {string} */
  let userId;
  let n = 0;

  async function order(createdAt) {
    n += 1;
    const { rows } = await pool.query(
      `INSERT INTO payment_orders (
         org_id, created_by, order_number, status, matching_mode, payable_amount,
         receive_address, address_source, asset, network, expires_at,
         required_confirmations, idempotency_key, idempotency_body_hash, invoice_amount_usd,
         created_at, updated_at)
       VALUES ($1, $2, $3, 'pending_payment', 'B', '50', 'TCollide', 'main', 'USDT', 'tron',
               now() + interval '1 hour', 19, $3, 'h', '50', $4, $4)
       RETURNING id`,
      [orgId, userId, `M1-${Date.now()}-${n}`, createdAt],
    );
    return rows[0].id;
  }

  before(async () => {
    const migrate = spawnSync("node", ["scripts/migrate.mjs"], { cwd: apiRoot, env: process.env });
    assert.equal(migrate.status, 0, String(migrate.stderr));
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const platform = await pool.query(`SELECT id FROM org_accounts WHERE type = 'platform' LIMIT 1`);
    const parentId =
      platform.rows[0]?.id ??
      (
        await pool.query(
          `INSERT INTO org_accounts (type, name, max_agent_depth) VALUES ('platform', 'M1 Platform', 1)
           RETURNING id`,
        )
      ).rows[0].id;
    const org = await pool.query(
      `INSERT INTO org_accounts (type, name, parent_id) VALUES ('merchant', $1, $2) RETURNING id`,
      [`m1-watcher-${Date.now()}`, parentId],
    );
    orgId = org.rows[0].id;
    const user = await pool.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`,
      [`m1-watcher-${Date.now()}@paymentgate.local`],
    );
    userId = user.rows[0].id;
  });

  after(async () => {
    await pool?.end();
  });

  it("saves a same-amount collision on every order, hash on the oldest (M1)", async () => {
    const older = await order("2026-10-01T00:00:00Z");
    const newer = await order("2026-10-01T00:05:00Z");
    const txHash = `m1-tx-${Date.now()}`;
    const out = await applyMatchResult(pool, {
      result: {
        status: "payment_anomaly",
        orderIds: [newer, older],
        reason: "mode_b_same_amount_collision",
      },
      transfer: { txHash, amount: "50", network: "tron" },
    });
    assert.equal(out.updated, 2, JSON.stringify(out));
    const { rows } = await pool.query(
      `SELECT id, status, tx_hash, anomaly_reason FROM payment_orders
       WHERE id = ANY($1::uuid[]) ORDER BY created_at`,
      [[older, newer]],
    );
    assert.deepEqual(
      rows.map((r) => [r.status, r.tx_hash, r.anomaly_reason]),
      [
        ["payment_anomaly", txHash, "mode_b_same_amount_collision"],
        ["payment_anomaly", null, "mode_b_same_amount_collision"],
      ],
    );
    const again = await applyMatchResult(pool, {
      result: { status: "payment_anomaly", orderIds: [newer, older], reason: "mode_b_same_amount_collision" },
      transfer: { txHash, amount: "50", network: "tron" },
    });
    assert.equal(again.updated, 0);
  });
});
