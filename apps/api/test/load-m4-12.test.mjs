import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { percentile, runConcurrent, summarize } from "../src/load/load-metrics.mjs";
import {
  assertInProcessGates,
  runInProcessLoad,
} from "../src/load/load-m4-12-inprocess.mjs";

describe("load metrics", () => {
  it("computes percentiles and concurrent samples", async () => {
    assert.equal(percentile([1, 2, 3, 4, 5], 50), 3);
    const samples = await runConcurrent(10, 4, async () => {
      await new Promise((r) => setTimeout(r, 1));
    });
    assert.equal(samples.length, 10);
    const s = summarize(samples, 20, "t");
    assert.equal(s.count, 10);
    assert.equal(s.name, "t");
  });
});

describe("M4-12 load (in-process smoke)", () => {
  it("create/status/fan-out paths meet soft gates", async () => {
    const report = await runInProcessLoad({
      createN: 40,
      statusN: 80,
      fanoutN: 40,
      concurrency: 8,
    });
    assertInProcessGates(report);
    assert.equal(report.mode, "inprocess");
    assert.equal(report.fanout.queued, 40);
  });
});
