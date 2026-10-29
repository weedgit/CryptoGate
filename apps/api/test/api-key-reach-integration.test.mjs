/**
 * Postgres integration — signed API keys reach order and webhook endpoints only (H7),
 * and one signed request authenticates once (H6). Skipped when DATABASE_URL is unset.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createUser } from "../src/auth/users.mjs";
import { generateApiKeyId, generateApiKeySecret } from "../src/api-keys/api-key-rules.mjs";
import { insertMembership } from "../src/orgs/membership-store.mjs";
import { insertApiKey } from "../src/signing/api-key-store.mjs";
import { canonicalString, hmacSha256Hex } from "../src/signing/signing-rules.mjs";
import {
  ensureV032Seed,
  hasPostgres,
  runMigrations,
  startTestServer,
  stopTestServer,
} from "./helpers/postgres-integration.mjs";

const describePg = hasPostgres() ? describe : describe.skip;

describePg("API key reach (H6 / H7)", () => {
  /** @type {import("node:http").Server} */
  let server;
  /** @type {string} */
  let base;
  /** @type {Awaited<ReturnType<typeof ensureV032Seed>>} */
  let seed;
  /** @type {{ keyId: string, secret: string }} */
  let ordersKey;

  /**
   * @param {string} method
   * @param {string} path
   * @param {object} [body]
   * @param {{ keyId: string, secret: string }} [key]
   */
  function signedRequest(method, path, body, key = ordersKey) {
    const raw = body === undefined ? "" : JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = randomBytes(16).toString("hex");
    const signature = hmacSha256Hex(
      key.secret,
      canonicalString({
        timestamp,
        nonce,
        method,
        pathAndQuery: path,
        rawBody: Buffer.from(raw, "utf8"),
      }),
    );
    /** @type {Record<string, string>} */
    const headers = {
      "X-Api-Key": key.keyId,
      "X-Timestamp": timestamp,
      "X-Nonce": nonce,
      "X-Signature": signature,
    };
    if (raw) headers["Content-Type"] = "application/json";
    return { url: `${base}${path}`, init: { method, headers, body: raw || undefined } };
  }

  /** @param {{ url: string, init: RequestInit }} request */
  async function send(request) {
    const res = await fetch(request.url, request.init);
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  }

  before(async () => {
    runMigrations();
    seed = await ensureV032Seed();
    ({ server, base } = await startTestServer());
    const owner = await createUser({
      email: `key-owner-${Date.now()}@paymentgate.local`,
      password: "KeyOwnerPass12345!",
    });
    await insertMembership({ orgId: seed.merchantOrgId, userId: owner.id, role: "owner" });
    ordersKey = { keyId: generateApiKeyId(), secret: generateApiKeySecret() };
    const inserted = await insertApiKey({
      orgId: seed.merchantOrgId,
      userId: owner.id,
      keyId: ordersKey.keyId,
      secret: ordersKey.secret,
      label: "reach test",
      expiresAt: null,
      scopes: ["orders"],
      ipAllowlist: [],
    });
    assert.equal(inserted.ok, true);
  });

  after(async () => {
    await stopTestServer(server);
  });

  it("refuses portal routes even for an Owner's key", async () => {
    for (const [method, path, body] of [
      ["GET", "/v1/audit"],
      ["GET", `/v1/orgs/${seed.merchantOrgId}/users`],
      ["GET", `/v1/orgs/${seed.merchantOrgId}/settlement`],
      ["POST", "/v1/auth/contact/email/send"],
      ["POST", "/v1/api-keys", { orgId: seed.merchantOrgId, label: "more", scopes: ["orders"] }],
      ["POST", `/v1/orgs/${seed.merchantOrgId}/users`, { email: "x@example.com", role: "owner" }],
    ]) {
      const res = await send(signedRequest(method, path, body));
      assert.equal(res.status, 403, `${method} ${path}`);
      assert.equal(res.json.code, "api_key_route_forbidden", `${method} ${path}`);
    }
  });

  it("enforces the key's scope", async () => {
    const res = await send(signedRequest("GET", "/v1/webhooks"));
    assert.equal(res.status, 403);
    assert.equal(res.json.code, "insufficient_scope");
  });

  it("a signed mutation authenticates once, and its nonce stays single-use (H6)", async () => {
    const request = signedRequest("POST", "/v1/orders", {
      orgId: seed.merchantOrgId,
      asset: "USDT",
      network: "tron",
      amountUsd: "10.00",
      validitySeconds: 1800,
    });
    request.init.headers["Idempotency-Key"] = `h6-${Date.now()}`;
    const first = await send(request);
    assert.notEqual(first.status, 401, JSON.stringify(first.json));
    assert.notEqual(first.json?.code, "nonce_replay");
    const replay = await send(request);
    assert.equal(replay.status, 401);
    assert.equal(replay.json.code, "nonce_replay");
  });

  it("reads orders", async () => {
    const res = await send(signedRequest("GET", `/v1/orders?orgId=${seed.merchantOrgId}`));
    assert.equal(res.status, 200, JSON.stringify(res.json));
  });
});
