import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runWatcherOnce } from "./run-watcher-once.mjs";

describe("@cryptogate/watcher m1 loop", () => {
  it("default run executes one tick and shuts down cleanly", async () => {
    const { code, stdout, stderr } = await runWatcherOnce();
    assert.equal(code, 0, stderr);
    const lines = stdout.trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(lines[0].event, "start");
    assert.equal(lines[1].phase, "m1-loop");
    assert.equal(lines[1].tick, 1);
    assert.equal(lines[1].chain.tron.mode, "stub");
    assert.equal(lines[1].chain.ethereum.mode, "stub");
    assert.equal(lines[1].chain.bnb_smart_chain.mode, "stub");
    assert.equal(lines[1].chain.polygon.mode, "stub");
    assert.equal(lines[1].chain.arbitrum_one.mode, "stub");
    assert.equal(lines[1].chain.base.mode, "stub");
    assert.equal(lines[1].chain.solana.mode, "stub");
    assert.equal(lines[1].chain.ton.mode, "stub");
    assert.equal(lines[1].chain.bitcoin.mode, "stub");
    assert.equal(lines[1].ingest.mode, "noop");
    assert.equal(lines.at(-1).event, "shutdown");
    assert.equal(lines.at(-1).ticks, 1);
  });
});
