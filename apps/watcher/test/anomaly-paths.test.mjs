import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyWrongNetworkOrAsset,
  isDuplicateTxHash,
} from "../src/match/classify.mjs";
import {
  matchInboundTransfer,
  processTransferBatch,
} from "../src/match/inbound.mjs";
import { matchWriteNeeded } from "../src/orders/restart-safety.mjs";

describe("@paymentgate/watcher anomaly paths (M3-43 / M3-44)", () => {
  it("classifies wrong_network at same address", () => {
    const d = classifyWrongNetworkOrAsset(
      { toAddress: "TMain", asset: "USDT", network: "ethereum" },
      [
        {
          orderId: "o1",
          receiveAddress: "TMain",
          asset: "USDT",
          network: "tron",
          status: "pending_payment",
        },
      ],
    );
    assert.ok(d);
    assert.equal(d.reason, "wrong_network");
    assert.deepEqual(d.orderIds, ["o1"]);
  });

  it("matchInboundTransfer applies wrong_network anomaly", async () => {
    const out = await matchInboundTransfer({
      transfer: {
        toAddress: "TMain",
        amount: "50.00",
        asset: "USDT",
        network: "ethereum",
        txHash: "0xeth",
      },
      openOrders: [
        {
          orderId: "o1",
          matchingMode: "B",
          payableAmount: "50.00",
          receiveAddress: "TMain",
          asset: "USDT",
          network: "tron",
          status: "pending_payment",
        },
      ],
    });
    assert.equal(out.applied, true);
    assert.equal(out.result.status, "payment_anomaly");
    assert.equal(out.result.reason, "wrong_network");
  });

  it("processTransferBatch classifies duplicate_tx_hash", async () => {
    const outcomes = await processTransferBatch({
      transfers: [
        {
          toAddress: "TMain",
          amount: "50.00",
          asset: "USDT",
          network: "tron",
          txHash: "0xdupe",
        },
      ],
      openOrders: [],
      knownTxHashes: new Set(["0xdupe"]),
      apply: async () => {
        throw new Error("should not apply");
      },
    });
    assert.equal(outcomes[0].reason, "duplicate_tx_hash");
    assert.equal(outcomes[0].classified, true);
  });

  it("isDuplicateTxHash helper", () => {
    assert.equal(isDuplicateTxHash("0xa", new Set(["0xa"])), true);
    assert.equal(isDuplicateTxHash("0xb", new Set(["0xa"])), false);
  });

  it("allows expired → payment_anomaly for late payment", () => {
    const d = matchWriteNeeded(
      { status: "expired", txHash: null, receivedAmount: null },
      { status: "payment_anomaly" },
      { txHash: "0xlate", amount: "50.00" },
    );
    assert.equal(d.write, true);
  });

  it("underpay Mode B applies payment_anomaly via batch", async () => {
    const applied = [];
    const outcomes = await processTransferBatch({
      transfers: [
        {
          toAddress: "TMain",
          amount: "49.00",
          asset: "USDT",
          network: "tron",
          txHash: "0xunder",
        },
      ],
      openOrders: [
        {
          orderId: "11111111-1111-1111-1111-111111111111",
          matchingMode: "B",
          payableAmount: "50.00",
          receiveAddress: "TMain",
          asset: "USDT",
          network: "tron",
          status: "pending_payment",
        },
      ],
      apply: async (args) => {
        applied.push(args);
        return { updated: 1 };
      },
    });
    assert.equal(applied[0].result.status, "payment_anomaly");
    assert.match(applied[0].result.reason, /underpay/);
    assert.equal(outcomes[0].status, "payment_anomaly");
  });
});
