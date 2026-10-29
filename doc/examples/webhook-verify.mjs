#!/usr/bin/env node
/**
 * M3-03 sample merchant webhook verifier.
 * Matches apps/api webhook-deliver-rules v2: HMAC-SHA256(secret, `${ts}.${eventId}.${rawBody}`).
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

/** Largest accepted |now - X-PaymentGate-Timestamp|. */
const MAX_SKEW_SECONDS = 300;

/**
 * Verify X-PaymentGate-Signature-V2 (timestamp and event id are signed with the body).
 * @param {string} secret
 * @param {{ rawBody: string | Buffer, timestamp: string, eventId: string, signatureHex: string, nowSec?: number }} p
 */
export function verifyWebhookSignatureV2(secret, p) {
  const ts = Number(p.timestamp);
  const now = p.nowSec ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_SKEW_SECONDS) return false;
  if (!p.eventId) return false;
  const body = typeof p.rawBody === "string" ? p.rawBody : p.rawBody.toString("utf8");
  return verifyWebhookSignature(secret, `${p.timestamp}.${p.eventId}.${body}`, p.signatureHex);
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
  const ts = String(Math.floor(Date.now() / 1000));
  const v2 = signBody(secret, `${ts}.e1.${body}`);
  if (!verifyWebhookSignatureV2(secret, { rawBody: body, timestamp: ts, eventId: "e1", signatureHex: v2 })) {
    console.error("self-test: valid v2 signature rejected");
    process.exit(1);
  }
  if (verifyWebhookSignatureV2(secret, { rawBody: body, timestamp: ts, eventId: "e2", signatureHex: v2 })) {
    console.error("self-test: v2 accepted a swapped event id");
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
    const signature = String(req.headers["x-paymentgate-signature-v2"] ?? "");
    const eventId = String(req.headers["x-paymentgate-event-id"] ?? "");
    const timestamp = String(req.headers["x-paymentgate-timestamp"] ?? "");
    if (!verifyWebhookSignatureV2(secret, { rawBody: raw, timestamp, eventId, signatureHex: signature })) {
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
