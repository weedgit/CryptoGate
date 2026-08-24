import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  qrPayloadForOrder,
  toOnChainDetails,
  toPaymentDetails,
} from "../src/orders/order-map.mjs";

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

describe("on-chain details mapper", () => {
  it("maps receive address and leaves unseen chain facts null", () => {
    const details = toOnChainDetails({
      ...row,
      tx_hash: null,
      received_amount: null,
      updated_at: new Date("2026-08-24T12:05:00.000Z"),
    });
    assert.equal(details.toAddress, row.receive_address);
    assert.equal(details.txHash, null);
    assert.equal(details.blockHeight, null);
    assert.equal(details.fromAddress, null);
    assert.equal(details.amount, null);
    assert.equal(details.confirmedAt, null);
  });

  it("maps watcher tx hash and received amount without inventing height", () => {
    const details = toOnChainDetails({
      ...row,
      tx_hash: "abc123",
      received_amount: "245.00",
      confirmations: 19,
    });
    assert.equal(details.txHash, "abc123");
    assert.deepEqual(details.amount, { amount: "245.00", currency: "USDT" });
    assert.equal(details.blockHeight, null);
    assert.equal(details.fromAddress, null);
    assert.equal(details.confirmedAt, null);
  });
});
