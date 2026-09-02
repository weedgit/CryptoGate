import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getHealthPayload } from "../src/health-payload.mjs";

describe("health-payload", () => {
  it("returns ok without db check", async () => {
    const p = await getHealthPayload({ checkDb: false });
    assert.equal(p.service, "paymentgate-api");
    assert.equal(p.status, "ok");
    assert.equal(p.phase, "m1");
    assert.ok(p.timestamp);
    assert.equal(p.webhook, "unknown");
    assert.match(String(p.webhookDetail), /not started/i);
  });

  it("skips db when DATABASE_URL unset", async () => {
    const prev = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const p = await getHealthPayload({ checkDb: true });
      assert.equal(p.db, "skipped");
      assert.equal(p.status, "ok");
      assert.equal(p.webhook, "unknown");
    } finally {
      if (prev !== undefined) process.env.DATABASE_URL = prev;
    }
  });
});
