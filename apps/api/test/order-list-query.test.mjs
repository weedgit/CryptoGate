import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CSV_DEFAULT_LIMIT,
  JSON_DEFAULT_LIMIT,
  JSON_MAX_LIMIT,
  assertListOrdersBounds,
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
    assert.equal(r.createdBy, null);
    assert.equal(r.createdFrom, null);
    assert.equal(r.q, null);
    assert.equal(r.limit, JSON_DEFAULT_LIMIT);
    assert.equal(r.offset, 0);
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
    assert.equal(r.statuses, null);
    assert.equal(r.orgId, "11111111-1111-1111-1111-111111111111");
    assert.equal(r.includeSubtree, false);
    assert.equal(r.limit, 50);
  });

  it("accepts status=closed and status=open as statuses arrays", () => {
    const closed = parseListOrdersQuery(
      new URLSearchParams("status=closed"),
      undefined,
    );
    assert.equal(closed.ok, true);
    if (!closed.ok) return;
    assert.equal(closed.status, null);
    assert.deepEqual(closed.statuses, ["expired", "failed", "cancelled"]);

    const open = parseListOrdersQuery(
      new URLSearchParams("status=open"),
      undefined,
    );
    assert.equal(open.ok, true);
    if (!open.ok) return;
    assert.deepEqual(open.statuses, ["pending_payment", "verifying"]);
  });

  it("parses includeSubtree, createdBy, period, q, asset, and network", () => {
    const bad = parseListOrdersQuery(
      new URLSearchParams("includeSubtree=true"),
      undefined,
    );
    assert.equal(bad.ok, false);

    const ok = parseListOrdersQuery(
      new URLSearchParams(
        [
          "orgId=11111111-1111-1111-1111-111111111111",
          "includeSubtree=1",
          "createdBy=22222222-2222-2222-2222-222222222222",
          "createdFrom=2026-09-01T00:00:00.000Z",
          "createdTo=2026-09-30T23:59:59.999Z",
          "q=PO-42",
          "asset=USDT",
          "network=tron",
        ].join("&"),
      ),
      undefined,
    );
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    assert.equal(ok.includeSubtree, true);
    assert.equal(ok.createdBy, "22222222-2222-2222-2222-222222222222");
    assert.equal(ok.createdFrom, "2026-09-01T00:00:00.000Z");
    assert.equal(ok.q, "PO-42");
    assert.equal(ok.asset, "USDT");
    assert.equal(ok.network, "tron");
  });

  it("rejects one-character reference q", () => {
    const r = parseListOrdersQuery(new URLSearchParams("q=a"), undefined);
    assert.equal(r.ok, false);
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

    const badOffset = parseListOrdersQuery(
      new URLSearchParams("offset=-1"),
      undefined,
    );
    assert.equal(badOffset.ok, false);

    const withOffset = parseListOrdersQuery(
      new URLSearchParams("limit=50&offset=100"),
      undefined,
    );
    assert.equal(withOffset.ok, true);
    if (!withOffset.ok) return;
    assert.equal(withOffset.limit, 50);
    assert.equal(withOffset.offset, 100);
  });
});

describe("assertListOrdersBounds", () => {
  it("allows open triage without period platform-wide", () => {
    const r = assertListOrdersBounds(
      {
        status: "payment_anomaly",
        statuses: null,
        orgId: null,
        createdFrom: null,
        createdTo: null,
      },
      { hasOrgScope: false },
    );
    assert.equal(r.ok, true);
  });

  it("requires period or org for completed platform-wide", () => {
    const r = assertListOrdersBounds(
      {
        status: "completed",
        statuses: null,
        orgId: null,
        createdFrom: null,
        createdTo: null,
      },
      { hasOrgScope: false },
    );
    assert.equal(r.ok, false);
  });

  it("allows completed with 31-day period platform-wide", () => {
    const r = assertListOrdersBounds(
      {
        status: "completed",
        statuses: null,
        orgId: null,
        createdFrom: "2026-09-01T00:00:00.000Z",
        createdTo: "2026-09-25T00:00:00.000Z",
      },
      { hasOrgScope: false },
    );
    assert.equal(r.ok, true);
  });

  it("rejects oversized period without org", () => {
    const r = assertListOrdersBounds(
      {
        status: "completed",
        statuses: null,
        orgId: null,
        createdFrom: "2026-01-01T00:00:00.000Z",
        createdTo: "2026-06-01T00:00:00.000Z",
      },
      { hasOrgScope: false },
    );
    assert.equal(r.ok, false);
  });
});
