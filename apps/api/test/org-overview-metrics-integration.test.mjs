/**
 * Postgres integration — GET /v1/orgs/{id}/overview period-to-date metrics are
 * server aggregates (not a capped order list). Skipped when DATABASE_URL is unset.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createSession } from "../src/auth/sessions.mjs";
import { createUser } from "../src/auth/users.mjs";
import { getPool } from "../src/db/pool.mjs";
import { insertMembership } from "../src/orgs/membership-store.mjs";
import { findPlatformOrg, insertOrgAccount } from "../src/orgs/org-store.mjs";
import {
  apiFetch,
  closePool,
  hasPostgres,
  runMigrations,
  startTestServer,
  stopTestServer,
} from "./helpers/postgres-integration.mjs";

const describePg = hasPostgres() ? describe : describe.skip;

describePg("org overview metrics (Postgres integration)", () => {
  /** @type {import("node:http").Server} */
  let server;
  let base = "";
  const ids = /** @type {Record<string, string>} */ ({});
  const tokens = /** @type {Record<string, string>} */ ({});
  let ownerId = "";

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const thisMonth = new Date(Math.min(monthStart.getTime() + 3600_000, now.getTime() - 60_000)).toISOString();
  const lastMonth = new Date(monthStart.getTime() - 86400_000).toISOString();
  const ymd = (d) => d.toISOString().slice(0, 10);

  async function org(type, name, parentId) {
    const created = await insertOrgAccount({ type, name, parentId, maxAgentDepth: null });
    return created.row.id;
  }

  let seq = 0;
  async function order(orgId, status, usd, createdAt) {
    seq += 1;
    const n = `${randomUUID().slice(0, 8)}-${seq}`;
    await getPool().query(
      `INSERT INTO payment_orders (
         org_id, created_by, order_number, status, matching_mode, payable_amount,
         receive_address, address_source, asset, network, expires_at,
         required_confirmations, idempotency_key, idempotency_body_hash,
         invoice_amount_usd, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'B', $5, 'addr', 'main', 'USDT', 'tron',
               $6::timestamptz + interval '1 hour', 1, $3, 'h', $5, $6, $6)`,
      [orgId, ownerId, `OVM-${n}`, status, usd, createdAt],
    );
  }

  async function bill(orgId, periodStart, periodEnd, sub, vol, status, createdAt) {
    await getPool().query(
      `INSERT INTO service_bills (
         org_id, period_start, period_end, subscription_amount, volume_fee_amount,
         total_amount, due_at, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, now() + interval '7 days', $7, $8)`,
      [orgId, periodStart, periodEnd, sub, vol, String(Number(sub) + Number(vol)), status, createdAt],
    );
  }

  before(async () => {
    runMigrations();
    const prefix = `ovm-${randomUUID().slice(0, 6)}`;
    let platform = await findPlatformOrg();
    if (!platform) {
      const created = await insertOrgAccount({ type: "platform", name: "Overview Test Platform", parentId: null, maxAgentDepth: 1 });
      platform = created.row;
    }
    ids.agent = await org("agent", `${prefix}-agent`, platform.id);
    ids.m1 = await org("merchant", `${prefix}-m1`, ids.agent);
    ids.m2 = await org("merchant", `${prefix}-m2`, ids.agent);
    await getPool().query(
      `UPDATE org_accounts SET created_at = $2 WHERE id = ANY($1::uuid[])`,
      [[ids.m1, ids.m2], lastMonth],
    );

    const u = await createUser({ email: `${prefix}@ovm.test`, password: "OverviewTest12!" });
    ownerId = u.id;
    await insertMembership({ orgId: platform.id, userId: u.id, role: "owner" });
    tokens.platform = (await createSession({ userId: u.id, mfaVerified: true })).token;

    // More than the old 200-row overview cap, so a capped list would undercount.
    await getPool().query(
      `INSERT INTO payment_orders (
         org_id, created_by, order_number, status, matching_mode, payable_amount,
         receive_address, address_source, asset, network, expires_at,
         required_confirmations, idempotency_key, idempotency_body_hash,
         invoice_amount_usd, created_at, updated_at)
       SELECT $1, $2, 'OVMB-' || g || '-' || $4, 'completed', 'B', '1', 'addr', 'main',
              'USDT', 'tron', $3::timestamptz + interval '1 hour', 1,
              'OVMB-' || g || '-' || $4, 'h', '1', $3, $3
       FROM generate_series(1, 250) g`,
      [ids.m1, ownerId, thisMonth, prefix],
    );
    await order(ids.m1, "pending_payment", "40", thisMonth);
    await order(ids.m1, "completed", "999", lastMonth);
    await order(ids.m1, "payment_anomaly", "5", lastMonth);
    await order(ids.m2, "confirmed", "10", thisMonth);

    await bill(ids.m1, ymd(monthStart), ymd(monthEnd), "20", "5", "issued", thisMonth);
    await bill(ids.m2, ymd(monthStart), ymd(monthEnd), "30", "0", "voided", thisMonth);
    await bill(ids.m2, ymd(new Date(lastMonth)), ymd(new Date(lastMonth)), "70", "0", "issued", thisMonth);

    ({ server, base } = await startTestServer());
  });

  after(async () => {
    if (server) await stopTestServer(server);
    await closePool();
  });

  it("merchant overview totals the whole billing period on the server", async () => {
    const res = await apiFetch(base, `/v1/orgs/${ids.m1}/overview`, { token: tokens.platform });
    assert.equal(res.status, 200);
    assert.equal(res.json.orders, undefined);
    assert.equal(res.json.metrics.ordersMtd, 251);
    assert.equal(res.json.metrics.settledVolumeMtdUsd, 250);
    assert.equal(res.json.metrics.openOrders, 2);
    assert.equal(res.json.metrics.platformFeeMtdUsd, null);
  });

  it("agent overview sums subtree volume and this month's live bill fees", async () => {
    const res = await apiFetch(base, `/v1/orgs/${ids.agent}/overview`, { token: tokens.platform });
    assert.equal(res.status, 200);
    assert.equal(res.json.metrics.ordersMtd, 252);
    assert.equal(res.json.metrics.settledVolumeMtdUsd, 260);
    assert.equal(res.json.metrics.platformFeeMtdUsd, 25);
    assert.equal(res.json.metrics.periodStart, monthStart.toISOString());
  });
});
