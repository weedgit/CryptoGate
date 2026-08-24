import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { OrderStatus } from "@cryptogate/domain";
import { createSession } from "../auth/sessions.mjs";
import { closePool, getPool } from "../db/pool.mjs";
import { handleRequest } from "../http/app.mjs";
import { SESSION_COOKIE_NAME } from "../http/cookies.mjs";
import { findSettlementAddress, upsertSettlementAddress } from "../settlement/settlement-store.mjs";
import { processPaymentOrderWebhookOutbox } from "../webhooks/webhook-fanout.mjs";
import { ensureLoadSeed } from "./load-m4-12-db.mjs";
import { runConcurrent, summarize } from "./load-metrics.mjs";

const SETTLEMENT_ADDRESS = "TLoadTestAddressXXXXXXXXXXXXXX";

/**
 * @param {string} base
 * @param {string} path
 * @param {{
 *   method?: string,
 *   cookie?: string,
 *   body?: object,
 *   headers?: Record<string, string>,
 * }} [opts]
 */
async function loadHttpFetch(base, path, opts = {}) {
  /** @type {Record<string, string>} */
  const headers = { ...(opts.headers ?? {}) };
  if (opts.cookie) {
    headers.Cookie = `${SESSION_COOKIE_NAME}=${opts.cookie}`;
  }
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${base}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  /** @type {unknown} */
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  return { status: res.status, json };
}

/**
 * Ensure merchant settlement so POST /v1/orders can assign Mode B.
 * @param {string} orgId
 */
async function ensureLoadSettlement(orgId) {
  const existing = await findSettlementAddress(orgId, "USDT", "tron");
  if (existing?.address) return;
  await upsertSettlementAddress({
    orgId,
    asset: "USDT",
    network: "tron",
    address: SETTLEMENT_ADDRESS,
    cooldownMs: 0,
  });
}

/**
 * HTTP router load: POST /v1/orders + GET /v1/orders/{id} + fan-out drain.
 * @param {{
 *   createN?: number,
 *   statusN?: number,
 *   concurrency?: number,
 * }} [opts]
 */
export async function runHttpLoad(opts = {}) {
  const createN = opts.createN ?? 30;
  const statusN = opts.statusN ?? 60;
  const concurrency = opts.concurrency ?? 8;

  const seed = await ensureLoadSeed();
  await ensureLoadSettlement(seed.orgId);
  const session = await createSession({ userId: seed.userId, mfaVerified: true });

  const server = createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end(String(err));
      }
    });
  });

  const base = await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("could not bind HTTP load server"));
        return;
      }
      resolve(`http://127.0.0.1:${addr.port}`);
    });
  });

  const runTag = randomBytes(4).toString("hex");
  /** @type {string[]} */
  const orderIds = [];

  try {
    const createWall0 = performance.now();
    const createSamples = await runConcurrent(createN, concurrency, async (i) => {
      const res = await loadHttpFetch(base, "/v1/orders", {
        method: "POST",
        cookie: session.token,
        headers: { "Idempotency-Key": `m412-http-${runTag}-${i}` },
        body: {
          amount: (10 + (i % 20)).toFixed(2),
          asset: "USDT",
          network: "tron",
          validitySeconds: 900,
        },
      });
      if (res.status !== 201) {
        throw new Error(`create HTTP ${res.status}: ${JSON.stringify(res.json)}`);
      }
      const id = /** @type {{ id?: string }} */ (res.json)?.id;
      if (id) orderIds.push(id);
    });
    const createWall = performance.now() - createWall0;

    if (orderIds.length === 0) {
      throw new Error("M4-12 HTTP create produced no orders");
    }

    const statusWall0 = performance.now();
    const statusSamples = await runConcurrent(statusN, concurrency, async (i) => {
      const id = orderIds[i % orderIds.length];
      const res = await loadHttpFetch(base, `/v1/orders/${id}`, {
        cookie: session.token,
      });
      if (res.status !== 200) {
        throw new Error(`get HTTP ${res.status}: ${JSON.stringify(res.json)}`);
      }
    });
    const statusWall = performance.now() - statusWall0;

    const pool = getPool();
    const advance = Math.min(5, orderIds.length);
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
      mode: "http",
      seed,
      create: summarize(createSamples, createWall, "post_orders"),
      status: summarize(statusSamples, statusWall, "get_order"),
      fanout: {
        ...summarize(fanoutSamples, fanoutWall, "webhook_fanout"),
        drained,
        queued,
      },
    };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

/**
 * @param {Awaited<ReturnType<typeof runHttpLoad>>} report
 */
export function assertHttpGates(report) {
  if (report.create.count < 1) throw new Error("M4-12 HTTP create count 0");
  if (report.status.count < 1) throw new Error("M4-12 HTTP status count 0");
  if (report.fanout.drained < 1) {
    throw new Error("M4-12 HTTP fan-out drained 0 outbox rows");
  }
  if (report.create.p95Ms > 5000) {
    throw new Error(`M4-12 HTTP create p95 too high: ${report.create.p95Ms}ms`);
  }
  if (report.status.p95Ms > 2000) {
    throw new Error(`M4-12 HTTP status p95 too high: ${report.status.p95Ms}ms`);
  }
}

export async function shutdownLoadHttp() {
  await closePool();
}
