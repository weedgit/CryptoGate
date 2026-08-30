import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyHeartbeatLag } from "../src/ops/watcher-health-store.mjs";

describe("watcher-health lag", () => {
  it("stays ok within soft floor (multi-network ticks can exceed 2× poll)", () => {
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
    assert.equal(out.status, "ok");
    assert.equal(out.healthScore, 100);
  });

  it("degrades after soft floor (~45s for 5s poll)", () => {
    const now = Date.parse("2026-08-27T00:01:00.000Z");
    const out = applyHeartbeatLag(
      {
        healthScore: 100,
        status: "ok",
        tickAt: "2026-08-27T00:00:00.000Z",
        pollIntervalMs: 5000,
      },
      now,
    );
    assert.equal(out.lagMs, 60_000);
    assert.equal(out.status, "degraded");
    assert.equal(out.healthScore, 80);
  });

  it("marks down only after down floor (~180s for 5s poll)", () => {
    const now = Date.parse("2026-08-27T00:04:00.000Z");
    const out = applyHeartbeatLag(
      {
        healthScore: 100,
        status: "ok",
        tickAt: "2026-08-27T00:00:00.000Z",
        pollIntervalMs: 5000,
      },
      now,
    );
    assert.equal(out.lagMs, 240_000);
    assert.equal(out.status, "down");
    assert.equal(out.healthScore, 20);
  });
});
