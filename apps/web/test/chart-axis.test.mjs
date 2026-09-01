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
});
