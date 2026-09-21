import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chartScaleTop, niceAxisTicks, dualAxisScale, DUAL_AXIS_SECONDARY_HEADROOM } from "../src/platform/ui/chartAxis.ts";

describe("chartAxis", () => {
  it("keeps a positive Y scale when all series values are zero", () => {
    const zeroTicks = niceAxisTicks(0);
    assert.ok(zeroTicks.length >= 3);
    assert.equal(zeroTicks[0], 0);
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

  it("dual secondary headroom raises the USD unit grid above the data max", () => {
    const dataMax = 7000;
    const tight = dualAxisScale(dataMax, 5, 1);
    const loose = dualAxisScale(dataMax, 5, DUAL_AXIS_SECONDARY_HEADROOM);
    assert.ok(loose.top > tight.top);
    assert.ok(loose.top >= dataMax * DUAL_AXIS_SECONDARY_HEADROOM);
    // Same data peak sits lower on the stretched axis (fewer shared pixels).
    const tightY = dataMax / tight.top;
    const looseY = dataMax / loose.top;
    assert.ok(looseY < tightY);
  });
});
