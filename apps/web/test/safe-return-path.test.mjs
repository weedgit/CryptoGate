import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isSafeInAppPath } from "../src/shared/portalRouting.ts";

describe("returnTo stays in the portal (open redirect)", () => {
  it("accepts in-app paths and refuses other sites", () => {
    assert.equal(isSafeInAppPath("/accounts/123", "/"), true);
    assert.equal(isSafeInAppPath("/platform/accounts", "/platform/"), true);
    for (const raw of ["//evil.com", "/\\evil.com", "//evil.com/platform/", "https://evil.com", "/\\\\evil", "/ok\u0000x"]) {
      assert.equal(isSafeInAppPath(raw, "/"), false, raw);
    }
    assert.equal(isSafeInAppPath("/merchant/x", "/platform/"), false);
  });
});
