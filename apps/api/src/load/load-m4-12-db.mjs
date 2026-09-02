import { randomBytes, randomUUID } from "node:crypto";
import { OrderStatus } from "@paymentgate/domain";
import { createUser, findUserByEmail } from "../auth/users.mjs";
import { closePool, getPool } from "../db/pool.mjs";
import { insertMembership } from "../orgs/membership-store.mjs";
import { findPlatformOrg, insertOrgAccount } from "../orgs/org-store.mjs";
import { findOrderById, insertPaymentOrder } from "../orders/order-store.mjs";
import { toPaymentOrder } from "../orders/order-map.mjs";
import { processPaymentOrderWebhookOutbox } from "../webhooks/webhook-fanout.mjs";
import {
  DEFAULT_WEBHOOK_EVENTS,
  generateWebhookSigningSecret,
} from "../webhooks/webhook-rules.mjs";
import { insertWebhookEndpoint, listWebhookEndpoints } from "../webhooks/webhook-store.mjs";
import { runConcurrent, summarize } from "./load-metrics.mjs";

const LOAD_EMAIL = "loadtest-m412@paymentgate.local";
const LOAD_PASSWORD = "LoadTestPass12!";

/**
 * Seed (or reuse) merchant + webhook for DB-backed M4-12.
 * @returns {Promise<{ userId: string, orgId: string }>}
 */
export async function ensureLoadSeed() {
  let user = await findUserByEmail(LOAD_EMAIL);
  if (!user) {
    user = await createUser({ email: LOAD_EMAIL, password: LOAD_PASSWORD });
  }

  let platform = await findPlatformOrg();
  if (!platform) {
    const created = await insertOrgAccount({
      type: "platform",
      name: "Load Platform",
      parentId: null,
      structure: null,
      maxAgentDepth: 2,
    });
    if (!created.ok) throw new Error("could not create platform org");
    platform = created.row;
    await insertMembership({
      orgId: platform.id,
      userId: user.id,
      role: "owner",
    });
  }

  const pool = getPool();
  const { rows: merchants } = await pool.query(
    `SELECT id FROM org_accounts
     WHERE type = 'merchant' AND name = 'M4-12 Load Merchant'
     LIMIT 1`,
  );
  let orgId = merchants[0]?.id;
  if (!orgId) {
    const created = await insertOrgAccount({
      type: "merchant",
      name: "M4-12 Load Merchant",
      parentId: platform.id,
      structure: "single_location",
      maxAgentDepth: null,
    });
    if (!created.ok) throw new Error("could not create merchant org");
    orgId = created.row.id;
  }

  await insertMembership({
    orgId,
    userId: user.id,
    role: "owner",
  });

  const hooks = await listWebhookEndpoints(orgId);
  if (hooks.length === 0) {
    const inserted = await insertWebhookEndpoint({
      orgId,
      url: "http://127.0.0.1:9/m4-12-load",
      events: [...DEFAULT_WEBHOOK_EVENTS],
      signingSecret: generateWebhookSigningSecret(),
    });
    if (!inserted.ok) throw new Error(`webhook seed failed: ${inserted.code}`);
  }

  return { userId: user.id, orgId };
}

/**
 * DB-backed create / status / fan-out load.
 * @param {{
 *   createN?: number,
 *   statusN?: number,
 *   concurrency?: number,
 * }} [opts]
 */
export async function runDbLoad(opts = {}) {
  const createN = opts.createN ?? 50;
  const statusN = opts.statusN ?? 100;
  const concurrency = opts.concurrency ?? 10;

  const seed = await ensureLoadSeed();
  const runTag = randomBytes(4).toString("hex");

  const createWall0 = performance.now();
  const createSamples = await runConcurrent(createN, concurrency, async (i) => {
    const inserted = await insertPaymentOrder({
      orgId: seed.orgId,
      createdBy: seed.userId,
      status: OrderStatus.PendingPayment,
      matchingMode: "B",
      payableAmount: (10 + (i % 50) + i / 1000).toFixed(3),
      receiveAddress: "TLoadTestAddressXXXXXXXXXXXXXX",
      addressSource: "main",
      hdIndex: null,
      memoOrTag: null,
      asset: "USDT",
      network: "tron",
      expiresAt: new Date(Date.now() + 900_000),
      requiredConfirmations: 19,
      idempotencyKey: `m412-${runTag}-${i}`,
      idempotencyBodyHash: randomUUID().replace(/-/g, ""),
      merchantMetadata: { load: true },
    });
    if (!inserted.ok) {
      throw new Error(`insert failed: ${inserted.code}`);
    }
  });
  const createWall = performance.now() - createWall0;

  const pool = getPool();
  const { rows: orderRows } = await pool.query(
    `SELECT id FROM payment_orders
     WHERE org_id = $1 AND idempotency_key LIKE $2
     ORDER BY created_at ASC`,
    [seed.orgId, `m412-${runTag}-%`],
  );
  const orderIds = orderRows.map((r) => r.id);
  if (orderIds.length === 0) {
    throw new Error("M4-12 DB create produced no orders");
  }

  const statusWall0 = performance.now();
  const statusSamples = await runConcurrent(statusN, concurrency, async (i) => {
    const id = orderIds[i % orderIds.length];
    const row = await findOrderById(id);
    if (!row) throw new Error("order missing");
    toPaymentOrder(row);
  });
  const statusWall = performance.now() - statusWall0;

  // Advance a slice to completed so fan-out also covers status transitions.
  const advance = Math.min(10, orderIds.length);
  for (let i = 0; i < advance; i += 1) {
    await pool.query(
      `UPDATE payment_orders SET status = $2, updated_at = now() WHERE id = $1`,
      [orderIds[i], OrderStatus.Completed],
    );
  }

  const fanoutWall0 = performance.now();
  let drained = 0;
  let queued = 0;
  for (let round = 0; round < 20; round += 1) {
    const batch = await processPaymentOrderWebhookOutbox({ limit: 100 });
    if (batch.length === 0) break;
    drained += batch.length;
    queued += batch.reduce((a, b) => a + b.queued, 0);
  }
  const fanoutWall = performance.now() - fanoutWall0;
  const fanoutSamples = drained
    ? Array.from({ length: drained }, () => fanoutWall / drained)
    : [fanoutWall];

  return {
    mode: "db",
    seed,
    create: summarize(createSamples, createWall, "create_order"),
    status: summarize(statusSamples, statusWall, "get_status"),
    fanout: {
      ...summarize(fanoutSamples, fanoutWall, "webhook_fanout"),
      drained,
      queued,
    },
  };
}

/**
 * @param {Awaited<ReturnType<typeof runDbLoad>>} report
 */
export function assertDbGates(report) {
  if (report.create.count < 1) throw new Error("M4-12 create count 0");
  if (report.status.count < 1) throw new Error("M4-12 status count 0");
  if (report.fanout.drained < 1) {
    throw new Error("M4-12 fan-out drained 0 outbox rows");
  }
  if (report.create.p95Ms > 2000) {
    throw new Error(`M4-12 create p95 too high: ${report.create.p95Ms}ms`);
  }
  if (report.status.p95Ms > 500) {
    throw new Error(`M4-12 status p95 too high: ${report.status.p95Ms}ms`);
  }
}

export async function shutdownLoadDb() {
  await closePool();
}
