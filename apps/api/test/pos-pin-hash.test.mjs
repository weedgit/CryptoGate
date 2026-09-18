import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  hashPosPin,
  validatePosPin,
  verifyPosPin,
} from "../src/auth/pos-pin-hash.mjs";

describe("pos-pin-hash", () => {
  it("rejects non-digit and wrong length", () => {
    assert.equal(validatePosPin("12").ok, false);
    assert.equal(validatePosPin("abcdef").ok, false);
    assert.equal(validatePosPin("123456").ok, true);
  });

  it("hashes and verifies", async () => {
    const encoded = await hashPosPin("482910");
    assert.equal(await verifyPosPin("482910", encoded), true);
    assert.equal(await verifyPosPin("000000", encoded), false);
  });
});
