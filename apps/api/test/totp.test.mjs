import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decodeBase32,
  generateTotpSecret,
  hotp,
  otpauthUrl,
  verifyTotp,
} from "../src/auth/totp.mjs";

describe("totp", () => {
  it("round-trips a generated secret", () => {
    const secret = generateTotpSecret();
    const bytes = decodeBase32(secret);
    assert.ok(bytes);
    assert.equal(bytes.length, 20);
    const counter = Math.floor(Date.now() / 1000 / 30);
    const code = hotp(bytes, counter);
    assert.equal(verifyTotp(secret, code), true);
    assert.equal(verifyTotp(secret, "000000"), false);
  });

  it("builds otpauth URL with issuer", () => {
    const url = otpauthUrl("owner@example.com", "MFRGGZDF");
    assert.match(url, /^otpauth:\/\/totp\//);
    assert.match(url, /secret=MFRGGZDF/);
    assert.match(url, /issuer=CryptoGate/);
  });
});
