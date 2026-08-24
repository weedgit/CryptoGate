import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapAssignError } from "../src/orders/order-assign.mjs";

describe("mapAssignError", () => {
  it("maps missing settlement address", () => {
    const r = mapAssignError(new Error("mainSettlementAddress is required for Mode B"));
    assert.equal(r.status, 422);
    assert.equal(r.code, "settlement_address_required");
  });

  it("maps Mode D when memo is unsupported", () => {
    const r = mapAssignError(
      new Error(
        "Mode D unavailable: memo not supported for USDT/tron (registry memoSupported=false)",
      ),
    );
    assert.equal(r.status, 422);
    assert.equal(r.code, "matching_mode_unavailable");
  });

  it("maps Mode C fingerprint exhaustion", () => {
    const r = mapAssignError(
      new Error("no free Mode C fingerprint slot within allowed range — refuse create"),
    );
    assert.equal(r.status, 409);
    assert.equal(r.code, "matching_exhausted");
  });
});
