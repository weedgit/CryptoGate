import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalString,
  checkTimestampSkew,
  hmacMatches,
  hmacSha256Hex,
  parseSigningHeaders,
  sha256Hex,
} from "../src/signing/signing-rules.mjs";

const EMPTY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

describe("API signing (M3-10)", () => {
  it("hashes empty body as SHA-256 of empty bytes", () => {
    assert.equal(sha256Hex(Buffer.alloc(0)), EMPTY_SHA256);
  });

  it("builds the canonical LF string", () => {
    const canonical = canonicalString({
      timestamp: "1710000000",
      nonce: "nonce-value-16xx",
      method: "post",
      pathAndQuery: "/v1/orders?limit=10",
      rawBody: Buffer.from('{"a":1}', "utf8"),
    });
    const bodyHash = sha256Hex(Buffer.from('{"a":1}', "utf8"));
    assert.equal(
      canonical,
      `1710000000\nnonce-value-16xx\nPOST\n/v1/orders?limit=10\n${bodyHash}`,
    );
  });

  it("accepts a matching HMAC and rejects a wrong secret", () => {
    const canonical = canonicalString({
      timestamp: "1710000000",
      nonce: "nonce-value-16xx",
      method: "GET",
      pathAndQuery: "/v1/orders/ord-1",
      rawBody: Buffer.alloc(0),
    });
    const secret = "test-api-secret-32bytes-minimum";
    const sig = hmacSha256Hex(secret, canonical);
    assert.match(sig, /^[0-9a-f]{64}$/);
    assert.equal(hmacMatches(secret, canonical, sig), true);
    assert.equal(hmacMatches("other-secret-32bytes-minimum!!", canonical, sig), false);
  });

  it("rejects incomplete or malformed signing headers", () => {
    assert.equal(parseSigningHeaders({ "x-api-key": "cgk_test" }).ok, false);
    assert.equal(
      parseSigningHeaders({
        "x-api-key": "cgk_test",
        "x-timestamp": "not-a-unix",
        "x-nonce": "nonce-value-16xx",
        "x-signature": "a".repeat(64),
      }).ok,
      false,
    );
    assert.equal(
      parseSigningHeaders({
        "x-api-key": "cgk_test",
        "x-timestamp": "1710000000",
        "x-nonce": "short",
        "x-signature": "a".repeat(64),
      }).ok,
      false,
    );
    const ok = parseSigningHeaders({
      "x-api-key": "cgk_test",
      "x-timestamp": "1710000000",
      "x-nonce": "nonce-value-16xx",
      "x-signature": "a".repeat(64),
    });
    assert.equal(ok.ok, true);
  });

  it("flags timestamp skew beyond 300s", () => {
    const now = 1_710_000_000;
    assert.equal(checkTimestampSkew(String(now), now).ok, true);
    assert.equal(checkTimestampSkew(String(now - 300), now).ok, true);
    const skew = checkTimestampSkew(String(now - 301), now);
    assert.equal(skew.ok, false);
    assert.equal(skew.code, "timestamp_skew");
  });
});
