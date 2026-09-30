import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GENERATED_POS_PIN_LENGTH,
  assertPosPinPepperEnv,
  generatePosPin,
  hashPosPin,
  posPinLookup,
  validatePosPin,
  verifyPosPin,
} from "../src/auth/pos-pin-hash.mjs";

const PEPPER = "unit-test-pos-pin-pepper-0123456789abcdef";

function withPepper(value, fn) {
  const prev = process.env.POS_PIN_PEPPER;
  if (value === undefined) delete process.env.POS_PIN_PEPPER;
  else process.env.POS_PIN_PEPPER = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.POS_PIN_PEPPER;
    else process.env.POS_PIN_PEPPER = prev;
  }
}

describe("pos-pin-hash", () => {
  it("accepts 6–8 digits only", () => {
    assert.equal(validatePosPin("12").ok, false);
    assert.equal(validatePosPin("1234").ok, false);
    assert.equal(validatePosPin("12345").ok, false);
    assert.equal(validatePosPin("abcdef").ok, false);
    assert.equal(validatePosPin("123456").ok, true);
    assert.equal(validatePosPin("12345678").ok, true);
    assert.equal(validatePosPin("123456789").ok, false);
  });

  it("generates 6-digit PINs, keeping leading zeros", () => {
    assert.equal(GENERATED_POS_PIN_LENGTH, 6);
    for (let i = 0; i < 200; i++) {
      const pin = generatePosPin();
      assert.match(pin, /^\d{6}$/);
      assert.equal(validatePosPin(pin).ok, true);
    }
  });

  it("hashes and verifies", async () => {
    const encoded = await hashPosPin("482910");
    assert.equal(await verifyPosPin("482910", encoded), true);
    assert.equal(await verifyPosPin("000000", encoded), false);
  });

  it("builds a per-org keyed lookup", () => {
    withPepper(PEPPER, () => {
      const a = posPinLookup("org-a", "482910");
      assert.match(a, /^[0-9a-f]{64}$/);
      assert.equal(posPinLookup("org-a", "482910"), a);
      assert.notEqual(posPinLookup("org-b", "482910"), a);
      assert.notEqual(posPinLookup("org-a", "482911"), a);
    });
  });

  it("refuses a missing or short pepper", () => {
    withPepper(undefined, () => {
      assert.throws(() => assertPosPinPepperEnv());
      assert.throws(() => posPinLookup("org-a", "482910"), { code: "pos_pin_pepper_missing" });
    });
    withPepper("too-short", () => {
      assert.throws(() => assertPosPinPepperEnv());
    });
    withPepper(PEPPER, () => {
      assert.doesNotThrow(() => assertPosPinPepperEnv());
    });
  });
});
