#!/usr/bin/env node
/**
 * M3-T07 / M4-11 signing smoke (no Postgres).
 * Canonical + HMAC match apps/api signing-rules; nonce replay models
 * ON CONFLICT DO NOTHING → empty RETURNING → code nonce_replay.
 *
 *   node doc/examples/api-signing-smoke.mjs
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const EMPTY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function canonicalString({ timestamp, nonce, method, pathAndQuery, rawBody }) {
  return [
    timestamp,
    nonce,
    method.toUpperCase(),
    pathAndQuery,
    sha256Hex(rawBody),
  ].join("\n");
}

function hmacSha256Hex(secret, canonical) {
  return createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
}

function hmacMatches(secret, canonical, signatureHex) {
  if (typeof signatureHex !== "string" || !/^[0-9a-f]{64}$/.test(signatureHex)) {
    return false;
  }
  const expected = hmacSha256Hex(secret, canonical);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signatureHex, "hex");
  if (a.length !== 32 || b.length !== 32) return false;
  return timingSafeEqual(a, b);
}

/** Mirrors consumeApiKeyNonce: INSERT … ON CONFLICT DO NOTHING RETURNING */
function interpretNonceInsert(returningRows) {
  if (!returningRows || returningRows.length === 0) {
    return { ok: false, code: "nonce_replay" };
  }
  return { ok: true };
}

function selfTest() {
  if (sha256Hex(Buffer.alloc(0)) !== EMPTY_SHA256) {
    console.error("empty body hash mismatch");
    process.exit(1);
  }

  const secret = "test-api-secret-32bytes-minimum!!";
  const canonical = canonicalString({
    timestamp: "1710000000",
    nonce: "nonce-value-16xx",
    method: "get",
    pathAndQuery: "/v1/orders?limit=1",
    rawBody: Buffer.alloc(0),
  });
  const sig = hmacSha256Hex(secret, canonical);
  if (!hmacMatches(secret, canonical, sig)) {
    console.error("valid HMAC rejected");
    process.exit(1);
  }
  if (hmacMatches("wrong-secret-32bytes-minimum!!!!!", canonical, sig)) {
    console.error("wrong secret accepted");
    process.exit(1);
  }
  if (hmacMatches(secret, canonical, undefined)) {
    console.error("missing signature accepted");
    process.exit(1);
  }

  const first = interpretNonceInsert([{ nonce: "nonce-value-16xx" }]);
  const replay = interpretNonceInsert([]);
  if (!first.ok || replay.ok || replay.code !== "nonce_replay") {
    console.error("nonce_replay mapping failed");
    process.exit(1);
  }

  console.log("api-signing-smoke self-test: ok");
}

selfTest();
