import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CSV_DEFAULT_LIMIT,
  JSON_DEFAULT_LIMIT,
  JSON_MAX_LIMIT,
  parseListOrdersQuery,
} from "../src/orders/order-list-query.mjs";

describe("parseListOrdersQuery", () => {
  it("defaults to json with capped limit", () => {
    const r = parseListOrdersQuery(new URLSearchParams(), undefined);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.csv, false);
    assert.equal(r.status, null);
    assert.equal(r.orgId, null);
    assert.equal(r.limit, JSON_DEFAULT_LIMIT);
  });

  it("selects csv via format or Accept", () => {
    const viaFormat = parseListOrdersQuery(new URLSearchParams("format=csv"), undefined);
    assert.equal(viaFormat.ok, true);
    if (!viaFormat.ok) return;
    assert.equal(viaFormat.csv, true);
    assert.equal(viaFormat.limit, CSV_DEFAULT_LIMIT);

    const viaAccept = parseListOrdersQuery(
      new URLSearchParams(),
      "text/csv, application/json",
    );
    assert.equal(viaAccept.ok, true);
    if (!viaAccept.ok) return;
    assert.equal(viaAccept.csv, true);

    const jsonWins = parseListOrdersQuery(
      new URLSearchParams("format=json"),
      "text/csv",
    );
    assert.equal(jsonWins.ok, true);
    if (!jsonWins.ok) return;
    assert.equal(jsonWins.csv, false);
  });

  it("rejects unknown format and status", () => {
    const format = parseListOrdersQuery(new URLSearchParams("format=xlsx"), undefined);
    assert.equal(format.ok, false);
    if (format.ok) return;
    assert.equal(format.code, "invalid_request");

    const status = parseListOrdersQuery(
      new URLSearchParams("status=paid"),
      undefined,
    );
    assert.equal(status.ok, false);
    if (status.ok) return;
    assert.equal(status.code, "invalid_request");
  });

  it("accepts domain status and UUID orgId", () => {
    const r = parseListOrdersQuery(
      new URLSearchParams(
        "status=pending_payment&orgId=11111111-1111-1111-1111-111111111111&limit=50",
      ),
      undefined,
    );
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.status, "pending_payment");
    assert.equal(r.orgId, "11111111-1111-1111-1111-111111111111");
    assert.equal(r.limit, 50);
  });

  it("rejects bad orgId and limit, and caps json limit", () => {
    const org = parseListOrdersQuery(new URLSearchParams("orgId=not-a-uuid"), undefined);
    assert.equal(org.ok, false);

    const limit = parseListOrdersQuery(new URLSearchParams("limit=0"), undefined);
    assert.equal(limit.ok, false);

    const capped = parseListOrdersQuery(new URLSearchParams("limit=9999"), undefined);
    assert.equal(capped.ok, true);
    if (!capped.ok) return;
    assert.equal(capped.limit, JSON_MAX_LIMIT);
  });
});
