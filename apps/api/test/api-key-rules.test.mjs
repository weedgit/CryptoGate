import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { API_KEY_MAX_PER_ORG } from "@cryptogate/domain";
import {
  generateApiKeyId,
  generateApiKeySecret,
  toApiKey,
  toApiKeyCreated,
  validateCreateApiKeyBody,
  validateRotateApiKeyBody,
} from "../src/api-keys/api-key-rules.mjs";
import { resolveApiKeyOrgId } from "../src/orgs/role-policy.mjs";

describe("api-key rules (M4-11)", () => {
  it("generates cgk_ keyId and long secret", () => {
    const keyId = generateApiKeyId();
    assert.match(keyId, /^cgk_live_[a-f0-9]{24}$/);
    const secret = generateApiKeySecret();
    assert.equal(secret.length >= 32, true);
  });

  it("validates create body and rejects past expiresAt", () => {
    const bad = validateCreateApiKeyBody({});
    assert.equal(bad.ok, false);
    const ok = validateCreateApiKeyBody({ label: "Production" });
    assert.equal(ok.ok, true);
    assert.equal(ok.expiresAt, null);
    const past = validateCreateApiKeyBody({
      label: "x",
      expiresAt: "2020-01-01T00:00:00.000Z",
    });
    assert.equal(past.ok, false);
  });

  it("rotate omits expiresAt to keep previous", () => {
    const omit = validateRotateApiKeyBody({});
    assert.equal(omit.ok, true);
    assert.equal(omit.expiresAt, undefined);
    const clear = validateRotateApiKeyBody({ expiresAt: null });
    assert.equal(clear.ok, true);
    assert.equal(clear.expiresAt, null);
  });

  it("never maps secret onto list shape", () => {
    const mapped = toApiKey({
      id: "id1",
      org_id: "o1",
      key_id: "cgk_live_abc",
      label: "Prod",
      created_at: new Date("2026-08-24T12:00:00.000Z"),
      last_used_at: null,
      expires_at: null,
      secret: "should-not-leak",
    });
    assert.equal("secret" in mapped, false);
    assert.equal(mapped.keyId, "cgk_live_abc");
    const created = toApiKeyCreated(
      {
        id: "id1",
        org_id: "o1",
        key_id: "cgk_live_abc",
        label: "Prod",
        created_at: new Date("2026-08-24T12:00:00.000Z"),
        last_used_at: null,
        expires_at: null,
      },
      "plain-secret-value-xxxxxxxx",
    );
    assert.equal(created.secret, "plain-secret-value-xxxxxxxx");
    assert.equal(API_KEY_MAX_PER_ORG, 10);
  });
});

describe("api-key role scope", () => {
  it("forbids cashiers and agents from managing API keys", () => {
    const cashier = resolveApiKeyOrgId(
      [{ orgId: "m1", role: "cashier", orgType: "merchant" }],
      null,
      "manage",
    );
    assert.equal(cashier.ok, false);
    assert.equal(cashier.status, 403);

    const agent = resolveApiKeyOrgId(
      [{ orgId: "a1", role: "owner", orgType: "agent" }],
      null,
      "manage",
    );
    assert.equal(agent.ok, false);
    assert.equal(agent.message.includes("Agent"), true);
  });

  it("lets merchant owner resolve a single org", () => {
    const r = resolveApiKeyOrgId(
      [{ orgId: "m1", role: "owner", orgType: "merchant" }],
      null,
      "manage",
    );
    assert.equal(r.ok, true);
    assert.equal(r.orgId, "m1");
  });
});
