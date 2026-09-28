import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  recordServerTime,
  serverClockOffsetMs,
  serverNow,
} from "../src/shared/serverClock.ts";

describe("server clock offset", () => {
  it("estimates offset from the round-trip midpoint", () => {
    const sentAt = Date.now();
    // Server is 90s ahead; 200ms round trip → server stamped at sentAt + 100ms.
    recordServerTime(String(sentAt + 100 + 90_000), sentAt, 200);
    assert.equal(serverClockOffsetMs(), 90_000);
    assert.ok(Math.abs(serverNow() - (Date.now() + 90_000)) < 50);
  });

  it("keeps the faster sample and ignores missing or bad headers", () => {
    const sentAt = Date.now();
    recordServerTime(String(sentAt + 500 + 5_000), sentAt, 1_000);
    assert.equal(serverClockOffsetMs(), 90_000);
    recordServerTime(null, sentAt, 10);
    recordServerTime("not-a-number", sentAt, 10);
    assert.equal(serverClockOffsetMs(), 90_000);
    recordServerTime(String(sentAt + 25 - 30_000), sentAt, 50);
    assert.equal(serverClockOffsetMs(), -30_000);
  });
});
