import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chartScaleTop, niceAxisTicks } from "../src/platform/ui/chartAxis.ts";

describe("chartAxis", () => {
  it("keeps a positive Y scale when all series values are zero", () => {
    assert.deepEqual(niceAxisTicks(0), [0]);
    assert.equal(chartScaleTop(0), 1);
  });

  it("uses nice tick top for non-zero max", () => {
    assert.ok(chartScaleTop(150) >= 150);
    assert.ok(chartScaleTop(7) >= 7);
  });

  it("prefers ~5 even Y ticks like exchange volume charts", () => {
    assert.deepEqual(niceAxisTicks(892, 5), [0, 250, 500, 750, 1000]);
    assert.deepEqual(niceAxisTicks(90_000, 5), [
      0, 25_000, 50_000, 75_000, 100_000,
    ]);
  });
});
