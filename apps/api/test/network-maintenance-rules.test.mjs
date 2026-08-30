import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isKnownNetworkId,
  isMaintenanceEffective,
  validatePutNetworkMaintenanceBody,
} from "../src/platform-settings/network-maintenance-rules.mjs";

describe("network maintenance rules", () => {
  it("accepts known network ids", () => {
    assert.equal(isKnownNetworkId("arbitrum_one"), true);
    assert.equal(isKnownNetworkId("tron"), true);
    assert.equal(isKnownNetworkId("nope"), false);
  });

  it("requires active boolean and defaults message when enabling", () => {
    const ok = validatePutNetworkMaintenanceBody({ active: true });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.active, true);
      assert.match(ok.message ?? "", /unavailable/i);
    }

    const off = validatePutNetworkMaintenanceBody({ active: false });
    assert.equal(off.ok, true);
    if (off.ok) {
      assert.equal(off.active, false);
      assert.equal(off.message, null);
      assert.equal(off.endsAt, null);
    }

    const bad = validatePutNetworkMaintenanceBody({});
    assert.equal(bad.ok, false);
  });

  it("treats expired endsAt as not effective", () => {
    assert.equal(
      isMaintenanceEffective({
        active: true,
        endsAt: "2020-01-01T00:00:00.000Z",
      }),
      false,
    );
    assert.equal(
      isMaintenanceEffective({
        active: true,
        endsAt: null,
      }),
      true,
    );
  });
});
