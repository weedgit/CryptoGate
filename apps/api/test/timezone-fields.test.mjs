import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sessionFromUser } from "../src/auth/session-payload.mjs";
import { toOrgAccount } from "../src/orgs/org-accounts.mjs";
import { toPaymentDetails } from "../src/orders/order-map.mjs";
import { auditCsvHeaderLine, auditCsvLine } from "../src/audit/audit-csv.mjs";

describe("time zone fields", () => {
  it("session carries whether the profile zone was confirmed", () => {
    const base = { id: "u1", email: "a@example.com", timezone: "UTC" };
    assert.equal(sessionFromUser(base).timezoneConfirmed, false);
    assert.equal(
      sessionFromUser({ ...base, timezone: "Asia/Seoul", timezoneConfirmed: true }).timezoneConfirmed,
      true,
    );
  });

  it("auth route session payload forwards the confirmed flag", () => {
    const src = readFileSync(new URL("../src/http/auth-routes.mjs", import.meta.url), "utf8");
    assert.match(src, /timezoneConfirmed: user\.timezoneConfirmed === true/);
  });

  it("org account exposes its own business time zone only when set", () => {
    const row = { id: "o1", type: "merchant", name: "Kevin Co", parent_id: "a1" };
    assert.equal("businessTimezone" in toOrgAccount(row), false);
    assert.equal(
      toOrgAccount({ ...row, business_timezone: "Asia/Seoul" }).businessTimezone,
      "Asia/Seoul",
    );
  });

  it("guest payment details include the effective business zone", () => {
    const details = toPaymentDetails({
      id: "p1",
      order_number: "1",
      status: "pending_payment",
      org_name: "Store",
      business_timezone: "Asia/Seoul",
      matching_mode: "B",
      receive_address: "Taddr",
      payable_amount: "10",
      asset: "USDT",
      network: "tron",
      expires_at: new Date("2026-09-28T00:00:00Z"),
    });
    assert.equal(details.businessTimezone, "Asia/Seoul");
  });

  it("audit CSV adds a created-at column in the requested zone", () => {
    assert.match(auditCsvHeaderLine("Asia/Seoul"), /,createdAtLocal \(Asia\/Seoul\)\n$/);
    const line = auditCsvLine(
      { created_at: new Date("2026-09-28T23:30:00Z"), action: "x", metadata: {} },
      "Asia/Seoul",
    );
    assert.match(line, /,2026-09-29 08:30:00\n$/);
  });
});
