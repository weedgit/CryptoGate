import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PASSWORD_MIN_LENGTH,
  getPasswordMinLength,
  validatePassword,
} from "../src/auth/password-policy.mjs";
import { hashPassword, verifyPassword } from "../src/auth/password-hash.mjs";
import { hashSessionToken } from "../src/auth/session-token.mjs";

describe("password-policy", () => {
  it("defaults min length to OpenAPI 12", () => {
    assert.equal(DEFAULT_PASSWORD_MIN_LENGTH, 12);
    assert.equal(getPasswordMinLength(), 12);
  });

  it("rejects short passwords", () => {
    const r = validatePassword("short");
    assert.equal(r.ok, false);
    assert.equal(r.code, "password_too_short");
  });

  it("accepts passwords at min length", () => {
    assert.equal(validatePassword("123456789012").ok, true);
  });
});

describe("password-hash", () => {
  it("hashes and verifies", async () => {
    const encoded = await hashPassword("correct-horse-12");
    assert.match(encoded, /^scrypt\$/);
    assert.equal(await verifyPassword("correct-horse-12", encoded), true);
    assert.equal(await verifyPassword("wrong-password-12", encoded), false);
  });

  it("refuses to hash short passwords", async () => {
    await assert.rejects(() => hashPassword("too-short"), (err) => {
      assert.equal(err.code, "password_too_short");
      return true;
    });
  });
});

describe("sessions token hash", () => {
  it("is stable sha256 hex", () => {
    const a = hashSessionToken("tok");
    const b = hashSessionToken("tok");
    assert.equal(a, b);
    assert.equal(a.length, 64);
  });
});
