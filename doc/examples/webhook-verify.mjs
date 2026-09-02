#!/usr/bin/env node
/**
 * M3-03 sample merchant webhook verifier.
 * Matches apps/api webhook-deliver-rules: HMAC-SHA256(secret, rawBody) → hex.
 *
 *   node doc/examples/webhook-verify.mjs
 *   WEBHOOK_SIGNING_SECRET=… PORT=8787 node doc/examples/webhook-verify.mjs --listen
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer as createHttpServer } from "node:http";

const seenEventIds = new Set();

/**
 * @param {string} secret
 * @param {string | Buffer} rawBody
 * @param {string} signatureHex
 */
export function verifyWebhookSignature(secret, rawBody, signatureHex) {
  if (typeof signatureHex !== "string" || !/^[0-9a-f]{64}$/.test(signatureHex)) {
    return false;
  }
  const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const expected = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signatureHex, "hex");
  if (a.length !== 32 || b.length !== 32) return false;
  return timingSafeEqual(a, b);
}

/**
 * @param {string} eventId
 * @returns {boolean} true if this is the first time we see the id
 */
export function claimEventId(eventId) {
  if (!eventId || typeof eventId !== "string") return false;
  if (seenEventIds.has(eventId)) return false;
  seenEventIds.add(eventId);
  return true;
}

function signBody(secret, rawBody) {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

function selfTest() {
  const secret = "s".repeat(32);
  const body =
    '{"id":"e1","type":"webhook.test","createdAt":"2026-08-24T00:00:00.000Z","data":{"orgId":"o1"}}';
  const sig = signBody(secret, body);
  if (!verifyWebhookSignature(secret, body, sig)) {
    console.error("self-test: valid signature rejected");
    process.exit(1);
  }
  if (verifyWebhookSignature(secret, body, "a".repeat(64))) {
    console.error("self-test: bad signature accepted");
    process.exit(1);
  }
  if (!claimEventId("e1")) {
    console.error("self-test: first claim failed");
    process.exit(1);
  }
  if (claimEventId("e1")) {
    console.error("self-test: replay not ignored");
    process.exit(1);
  }
  console.log("webhook-verify self-test: ok");
}

/**
 * @param {import("node:http").IncomingMessage} req
 */
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function listen() {
  const secret = process.env.WEBHOOK_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    console.error("Set WEBHOOK_SIGNING_SECRET (min 32 chars) for --listen");
    process.exit(1);
  }
  const port = Number(process.env.PORT || 8787);
  const server = createHttpServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/hook") {
      res.statusCode = 404;
      res.end();
      return;
    }
    const raw = await readRawBody(req);
    const signature = String(req.headers["x-paymentgate-signature"] ?? "");
    const eventId = String(req.headers["x-paymentgate-event-id"] ?? "");
    if (!verifyWebhookSignature(secret, raw, signature)) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "signature_invalid" }));
      return;
    }
    const first = claimEventId(eventId);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, duplicate: !first }));
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`webhook-verify listening on http://127.0.0.1:${port}/hook`);
  });
}

if (process.argv.includes("--listen")) {
  listen();
} else {
  selfTest();
}
