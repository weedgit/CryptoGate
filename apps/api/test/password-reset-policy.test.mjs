import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validatePassword,
  validatePasswordReset,
} from "../src/auth/password-policy.mjs";

describe("validatePasswordReset", () => {
  it("requires min length", () => {
    const r = validatePasswordReset("Short1a");
    assert.equal(r.ok, false);
    assert.equal(r.code, "password_too_short");
  });

  it("requires mixed case", () => {
    const r = validatePasswordReset("123456789012");
    assert.equal(r.ok, false);
    assert.equal(r.code, "password_needs_mixed_case");
  });

  it("requires a number", () => {
    const r = validatePasswordReset("PasswordOnlyLong");
    assert.equal(r.ok, false);
    assert.equal(r.code, "password_needs_number");
  });

  it("accepts a strong password", () => {
    assert.equal(validatePasswordReset("LocalReview1!").ok, true);
    assert.equal(validatePassword("LocalReview1!").ok, true);
  });
});
