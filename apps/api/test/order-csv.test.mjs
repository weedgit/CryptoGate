import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  csvCell,
  ORDER_CSV_HEADERS,
  paymentOrdersToCsv,
} from "../src/orders/order-csv.mjs";

describe("order CSV export", () => {
  it("neutralizes formula injection and quotes commas", () => {
    assert.equal(csvCell("=1+1"), "'=1+1");
    assert.equal(csvCell("+cmd"), "'+cmd");
    assert.equal(csvCell("-1"), "'-1");
    assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
    assert.equal(csvCell("a,b"), '"a,b"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  });

  it("includes matching columns from M3-15", () => {
    const csv = paymentOrdersToCsv([
      {
        id: "o1",
        order_number: "CG-2026-0001",
        status: "pending_payment",
        matching_mode: "B",
        payable_amount: "10.00",
        receive_address: "Taddr",
        address_source: "main",
        hd_index: null,
        memo_or_tag: null,
        asset: "USDT",
        network: "tron",
        expires_at: new Date("2026-08-24T12:00:00.000Z"),
        created_at: new Date("2026-08-24T11:00:00.000Z"),
        created_by: "u1",
      },
    ]);
    const header = csv.split("\r\n")[0];
    assert.equal(header, ORDER_CSV_HEADERS.join(","));
    assert.match(header, /matching_mode/);
    assert.match(header, /payable_amount/);
    assert.match(header, /receive_address/);
    assert.match(header, /address_source/);
    assert.match(header, /hd_index/);
    assert.match(header, /memo_or_tag/);
    assert.match(csv, /CG-2026-0001/);
    assert.match(csv, /2026-08-24T12:00:00.000Z/);
  });
});
