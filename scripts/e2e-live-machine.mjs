#!/usr/bin/env node
/**
 * X-07 live machine tier: signed POST /v1/orders + webhook listener.
 *
 * Requires:
 *   E2E_API_BASE, E2E_API_KEY_ID, E2E_API_SECRET
 *
 * Optional:
 *   E2E_ORDER_AMOUNT (default 1.01), E2E_WEBHOOK_WAIT_MS (default 20000)
 *
 * Invoked from scripts/e2e-smoke.mjs --live when key env vars are set.
 */
import { pathToFileURL } from "node:url";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { verifyWebhookSignature } from "../doc/examples/webhook-verify.mjs";

function normalizeApiBase(raw) {
  return raw.replace(/\/+$/, "").replace(/\/v1$/i, "");
}

function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function canonicalString({ timestamp, nonce, method, pathAndQuery, rawBody }) {
  return [timestamp, nonce, method.toUpperCase(), pathAndQuery, sha256Hex(rawBody)].join(
    "\n",
  );
}

function signHeaders({ keyId, secret, method, pathAndQuery, rawBody }) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(12).toString("base64url").slice(0, 24);
  const canonical = canonicalString({
    timestamp,
    nonce,
    method,
    pathAndQuery,
    rawBody,
  });
  const signature = createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
  return {
    "X-Api-Key": keyId,
    "X-Timestamp": timestamp,
    "X-Nonce": nonce,
    "X-Signature": signature,
  };
}

async function signedFetch(base, { method, pathAndQuery, bodyObj, keyId, secret, extraHeaders = {} }) {
  const rawBody = bodyObj == null ? Buffer.alloc(0) : Buffer.from(JSON.stringify(bodyObj), "utf8");
  const headers = {
    Accept: "application/json",
    ...signHeaders({ keyId, secret, method, pathAndQuery, rawBody }),
    ...extraHeaders,
  };
  if (bodyObj != null) headers["Content-Type"] = "application/json";
  const res = await fetch(`${base}${pathAndQuery}`, {
    method,
    headers,
    body: bodyObj == null ? undefined : rawBody,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { res, text, json };
}

function startListener() {
  /** @type {{ resolve: (v: object) => void, reject: (e: Error) => void } | null} */
  let pending = null;
  /** @type {string | null} */
  let expectedSecret = null;

  const server = createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/hook") {
      res.statusCode = 404;
      res.end();
      return;
    }
    /** @type {Buffer[]} */
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks);
    const signature = String(req.headers["x-cryptogate-signature"] ?? "");
    const eventId = String(req.headers["x-cryptogate-event-id"] ?? "");
    if (!expectedSecret || !verifyWebhookSignature(expectedSecret, raw, signature)) {
      res.statusCode = 401;
      res.end(JSON.stringify({ ok: false }));
      if (pending) pending.reject(new Error("webhook signature_invalid"));
      pending = null;
      return;
    }
    let payload;
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      res.statusCode = 400;
      res.end();
      return;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
    if (pending) {
      pending.resolve({ eventId, payload });
      pending = null;
    }
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}/hook`,
        setSecret(secret) {
          expectedSecret = secret;
        },
        waitForDelivery(ms) {
          return new Promise((res, rej) => {
            const timer = setTimeout(() => {
              pending = null;
              rej(new Error(`webhook not delivered within ${ms}ms`));
            }, ms);
            pending = {
              resolve(v) {
                clearTimeout(timer);
                res(v);
              },
              reject(e) {
                clearTimeout(timer);
                rej(e);
              },
            };
          });
        },
        close() {
          return new Promise((r) => server.close(() => r()));
        },
      });
    });
  });
}

export async function runLiveMachineTier(baseInput) {
  const base = normalizeApiBase(baseInput);
  const keyId = (process.env.E2E_API_KEY_ID ?? "").trim();
  const secret = (process.env.E2E_API_SECRET ?? "").trim();
  if (!keyId || !secret) {
    console.log(
      "e2e live: skip signed order/webhook (set E2E_API_KEY_ID + E2E_API_SECRET; mint via scripts/e2e-mint-api-key.mjs)",
    );
    return;
  }

  const amount = (process.env.E2E_ORDER_AMOUNT ?? "1.01").trim();
  const waitMs = Number(process.env.E2E_WEBHOOK_WAIT_MS ?? 20_000);
  const body = {
    amount,
    asset: "USDT",
    network: "tron",
    validitySeconds: 900,
  };
  const idem = `e2e-${Date.now()}-${randomBytes(4).toString("hex")}`;
  const create = await signedFetch(base, {
    method: "POST",
    pathAndQuery: "/v1/orders",
    bodyObj: body,
    keyId,
    secret,
    extraHeaders: { "Idempotency-Key": idem },
  });
  if (create.res.status !== 201 || !create.json?.id) {
    console.error(
      `signed create order failed: ${create.res.status}`,
      create.json ?? create.text,
    );
    process.exit(1);
  }
  const orderId = create.json.id;
  if (!create.json.receiveAddress || !create.json.payableAmount) {
    console.error("signed create missing receiveAddress/payableAmount");
    process.exit(1);
  }
  console.log(`e2e live: signed POST /orders 201 (${orderId})`);

  const payRes = await fetch(`${base}/v1/orders/${encodeURIComponent(orderId)}/payment`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!payRes.ok) {
    console.error(`guest payment after create failed: ${payRes.status}`);
    process.exit(1);
  }
  console.log("e2e live: guest GET /payment after signed create ok");

  const listener = await startListener();
  try {
    const reg = await signedFetch(base, {
      method: "POST",
      pathAndQuery: "/v1/webhooks",
      bodyObj: { url: listener.url },
      keyId,
      secret,
    });
    if (reg.res.status !== 201 || !reg.json?.id || !reg.json?.signingSecret) {
      console.error(`webhook register failed: ${reg.res.status}`, reg.json ?? reg.text);
      process.exit(1);
    }
    const webhookId = reg.json.id;
    const webhookSecret = reg.json.signingSecret;
    listener.setSecret(webhookSecret);
    console.log(`e2e live: registered webhook ${webhookId}`);

    const waitPromise = listener.waitForDelivery(
      Number.isFinite(waitMs) && waitMs > 0 ? waitMs : 20_000,
    );
    const test = await signedFetch(base, {
      method: "POST",
      pathAndQuery: "/v1/webhooks/test",
      bodyObj: { webhookId },
      keyId,
      secret,
    });
    if (test.res.status !== 200 && test.res.status !== 202) {
      console.error(`webhook test failed: ${test.res.status}`, test.json ?? test.text);
      process.exit(1);
    }

    const delivery = await waitPromise;
    if (delivery.payload?.type !== "webhook.test") {
      console.error("unexpected webhook payload type", delivery.payload?.type);
      process.exit(1);
    }
    console.log("e2e live: webhook.test delivered + signature verified");

    const del = await signedFetch(base, {
      method: "DELETE",
      pathAndQuery: `/v1/webhooks/${encodeURIComponent(webhookId)}`,
      bodyObj: null,
      keyId,
      secret,
    });
    if (del.res.status !== 204 && del.res.status !== 200) {
      console.error(`webhook delete failed: ${del.res.status}`);
      process.exit(1);
    }
    console.log("e2e live: webhook disabled");
  } finally {
    await listener.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.env.E2E_API_BASE ?? "";
  if (!base) {
    console.error("E2E_API_BASE required");
    process.exit(1);
  }
  runLiveMachineTier(base).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
