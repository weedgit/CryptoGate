import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { qrPayloadForOrder, toPaymentDetails } from "../src/orders/order-map.mjs";

const row = {
  id: "ord-1",
  org_name: "Hotel Marrakech",
  order_number: "CG-2026-0042",
  status: "pending_payment",
  matching_mode: "B",
  payable_amount: "245.00",
  receive_address: "TCryptoGateStubReceiveAddress00001",
  memo_or_tag: null,
  asset: "USDT",
  network: "tron",
  expires_at: new Date("2026-08-24T12:00:00.000Z"),
};

describe("payment details mapper", () => {
  it("builds guest payload without keys or fees", () => {
    const details = toPaymentDetails(row);
    assert.equal(details.merchantName, "Hotel Marrakech");
    assert.equal(details.copyAmount, "245.00");
    assert.equal(details.paymentPageUrl, "http://localhost:5173/pay/ord-1");
    assert.match(details.wrongNetworkWarning, /TRON TRC-20/);
    assert.equal(
      details.contractAddress,
      "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    );
    assert.equal(details.payExactAmountWarning, undefined);
    assert.equal("fee" in details, false);
    assert.equal("xPub" in details, false);
  });

  it("adds Mode C exact-amount warning", () => {
    const details = toPaymentDetails({ ...row, matching_mode: "C" });
    assert.ok(details.payExactAmountWarning);
  });

  it("encodes a network URI, not an RPC URL", () => {
    const payload = qrPayloadForOrder({
      receiveAddress: row.receive_address,
      amount: "245.00",
      asset: "USDT",
      network: "tron",
    });
    assert.match(payload, /^tron:/);
    assert.doesNotMatch(payload, /https?:\/\//);
  });
});
