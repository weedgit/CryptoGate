import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyHeartbeatLag } from "../src/ops/watcher-health-store.mjs";

describe("watcher-health lag", () => {
  it("degrades after 2× poll interval", () => {
    const now = Date.parse("2026-08-27T00:00:12.000Z");
    const out = applyHeartbeatLag(
      {
        healthScore: 100,
        status: "ok",
        tickAt: "2026-08-27T00:00:00.000Z",
        pollIntervalMs: 5000,
      },
      now,
    );
    assert.equal(out.lagMs, 12_000);
    assert.equal(out.status, "degraded");
    assert.equal(out.healthScore, 80);
  });
});
