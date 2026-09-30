import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isPosSessionPathAllowed } from "../src/pos/pos-session-scope.mjs";

const ORG = "org-term";
const allowed = (method, path) => isPosSessionPathAllowed(method, path, ORG);

describe("POS session allowlist", () => {
  it("allows exactly the terminal routes", () => {
    for (const [method, path] of [
      ["GET", "/v1/auth/session"],
      ["POST", "/v1/auth/logout"],
      ["POST", "/v1/orders"],
      ["GET", "/v1/orders"],
      ["GET", "/v1/orders/ord-1"],
      ["GET", "/v1/orders/ord-1/payment"],
      ["POST", "/v1/orders/ord-1/cancel"],
      ["GET", `/v1/orgs/${ORG}/pos-settings`],
      ["GET", "/v1/pos/terminal"],
      ["POST", "/v1/pos/unlock"],
      ["POST", "/v1/pos/lock"],
      ["POST", "/v1/pos/unbind"],
      ["GET", "/v1/network-maintenance"],
    ]) {
      assert.equal(allowed(method, path), true, `${method} ${path}`);
    }
  });

  it("blocks everything else", () => {
    for (const [method, path] of [
      ["GET", "/v1/orders/summary"],
      ["GET", "/v1/orders/exports"],
      ["GET", "/v1/orgs"],
      ["GET", "/v1/orgs/other-org/pos-settings"],
      ["PUT", `/v1/orgs/${ORG}/pos-settings`],
      ["GET", `/v1/orgs/${ORG}/users`],
      ["PUT", `/v1/orgs/${ORG}/users/u1/pos-pin`],
      ["POST", "/v1/pos/terminals"],
      ["GET", `/v1/orgs/${ORG}/pos-terminals`],
      ["PATCH", "/v1/orders/ord-1"],
      ["POST", "/v1/orders/ord-1/refund"],
      ["POST", "/v1/auth/login"],
      ["PUT", "/v1/auth/pos-pin"],
      ["GET", "/v1/auth/pos-pin"],
      ["POST", "/v1/auth/mfa/verify"],
      ["DELETE", "/v1/orders/ord-1"],
    ]) {
      assert.equal(allowed(method, path), false, `${method} ${path}`);
    }
  });

  it("does not allow pos-settings without a terminal org", () => {
    assert.equal(isPosSessionPathAllowed("GET", "/v1/orgs/null/pos-settings", null), false);
  });
});
