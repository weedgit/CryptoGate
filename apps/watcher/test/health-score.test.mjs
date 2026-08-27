import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyHeartbeatLag,
  computeWatcherHealthScore,
} from "../src/health/score.mjs";

describe("watcher health score", () => {
  it("marks stub RPC as degraded", () => {
    const out = computeWatcherHealthScore({
      chain: { ok: true, mode: "stub", rpcConfigured: false },
      ingest: { mode: "match+confirm" },
      isActiveTarget: true,
    });
    assert.equal(out.status, "degraded");
    assert.ok(out.score < 100);
    assert.ok(out.reasons.includes("rpc_stub_or_unconfigured"));
  });

  it("marks ingest error as down", () => {
    const out = computeWatcherHealthScore({
      chain: { ok: true, mode: "trongrid", rpcConfigured: true },
      ingest: { mode: "error", error: "boom" },
      isActiveTarget: true,
    });
    assert.equal(out.status, "down");
    assert.ok(out.score <= 25);
  });

  it("idle non-target only scores RPC", () => {
    const out = computeWatcherHealthScore({
      chain: { ok: true, mode: "eth-rpc", rpcConfigured: true },
      ingest: { mode: "idle" },
      isActiveTarget: false,
    });
    assert.equal(out.status, "ok");
    assert.equal(out.score, 100);
  });

  it("applies lag penalty on read", () => {
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
    assert.equal(out.status, "down");
    assert.ok(out.healthScore <= 20);
  });
});
