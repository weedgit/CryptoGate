import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapPool } from "../src/map-pool.mjs";

describe("mapPool", () => {
  it("preserves input order with concurrency > 1", async () => {
    const started = [];
    const out = await mapPool([30, 10, 20], 2, async (ms, i) => {
      started.push(i);
      await new Promise((r) => setTimeout(r, ms));
      return i;
    });
    assert.deepEqual(out, [0, 1, 2]);
    assert.equal(started.length, 3);
  });
});
