import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  matchInboundTransfer,
  processTransferBatch,
} from "../src/match/inbound.mjs";

const baseOrder = {
  orderId: "11111111-1111-1111-1111-111111111111",
  matchingMode: "B",
  payableAmount: "50.00",
  receiveAddress: "TMainAddressExample",
  asset: "USDT",
  network: "tron",
  memoOrTag: null,
};

const baseTransfer = {
  toAddress: "TMainAddressExample",
  amount: "50.00",
  asset: "USDT",
  network: "tron",
  txHash: "0xabc",
};

describe("@paymentgate/watcher inbound match wire (M3-41)", () => {
  it("exact Mode B match binds orderId", async () => {
    const { applied, result, mode } = await matchInboundTransfer({
      transfer: baseTransfer,
      openOrders: [baseOrder],
    });
    assert.equal(applied, true);
    assert.equal(mode, "B");
    assert.equal(result.status, "verifying");
    assert.equal(result.orderId, baseOrder.orderId);
  });

  it("Mode B same-amount collision returns all orderIds", async () => {
    const { applied, result } = await matchInboundTransfer({
      transfer: baseTransfer,
      openOrders: [
        baseOrder,
        {
          ...baseOrder,
          orderId: "22222222-2222-2222-2222-222222222222",
        },
      ],
    });
    assert.equal(applied, true);
    assert.equal(result.status, "payment_anomaly");
    assert.deepEqual(result.orderIds, [
      baseOrder.orderId,
      "22222222-2222-2222-2222-222222222222",
    ]);
  });

  it("Mode C fingerprints bind the correct order", async () => {
    const orders = [
      {
        ...baseOrder,
        matchingMode: "C",
        payableAmount: "50.01",
        orderId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      },
      {
        ...baseOrder,
        matchingMode: "C",
        payableAmount: "50.02",
        orderId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      },
    ];
    const a = await matchInboundTransfer({
      transfer: { ...baseTransfer, amount: "50.01" },
      openOrders: orders,
    });
    const b = await matchInboundTransfer({
      transfer: { ...baseTransfer, amount: "50.02" },
      openOrders: orders,
    });
    assert.equal(a.result.orderId, orders[0].orderId);
    assert.equal(b.result.orderId, orders[1].orderId);
  });

  it("Mode S HD address binds the owning order", async () => {
    const { applied, result, mode } = await matchInboundTransfer({
      transfer: {
        ...baseTransfer,
        toAddress: "THdDerivedAddress0001",
        txHash: "0xhd",
      },
      openOrders: [
        {
          ...baseOrder,
          matchingMode: "S",
          orderId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
          receiveAddress: "THdDerivedAddress0001",
        },
      ],
    });
    assert.equal(applied, true);
    assert.equal(mode, "S");
    assert.equal(result.status, "verifying");
    assert.equal(result.orderId, "cccccccc-cccc-cccc-cccc-cccccccccccc");
  });

  it("processTransferBatch calls apply for bound matches", async () => {
    const applied = [];
    const outcomes = await processTransferBatch({
      transfers: [baseTransfer],
      openOrders: [baseOrder],
      apply: async (args) => {
        applied.push(args);
        return { updated: 1 };
      },
    });
    assert.equal(applied.length, 1);
    assert.equal(outcomes[0].status, "verifying");
    assert.equal(outcomes[0].updated, 1);
  });

  it("skips unmatched transfers without calling apply", async () => {
    let applyCalls = 0;
    const outcomes = await processTransferBatch({
      transfers: [baseTransfer],
      openOrders: [],
      apply: async () => {
        applyCalls += 1;
        return { updated: 0 };
      },
    });
    assert.equal(applyCalls, 0);
    assert.equal(outcomes[0].skipped, true);
  });

  it("ignores stale transfer before order create (Mode B overpay regression)", async () => {
    const { applied, result } = await matchInboundTransfer({
      transfer: {
        ...baseTransfer,
        amount: "100",
        blockTimestampMs: Date.parse("2026-08-29T15:30:12.000Z"),
        txHash: "c926f3afd8b38b4b59cbe82ae3d619508dbb4ff7f71746c18e70a300687e1489",
      },
      openOrders: [
        {
          ...baseOrder,
          payableAmount: "10",
          createdAt: "2026-09-02T09:12:58.868Z",
        },
      ],
    });
    assert.equal(applied, false);
    assert.equal(result.status, "pending_payment");
    assert.equal(result.reason, "transfer_before_order_created");
  });
});
