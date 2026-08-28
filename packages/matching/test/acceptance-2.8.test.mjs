/**
 * Phase1 §2.8 / M3-64 matching acceptance.
 * Named scenarios for Kevin's M3-T02–T06 (matching-owned slices).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assignModeC,
  assignModeD,
  assignModeDForConfig,
  assignModeS,
  hdPoolStateAfterClaim,
  hdPoolStateAfterCooldownElapsed,
  hdPoolStateAfterOrderFinal,
  isHdPoolCooldownElapsed,
  matchModeDForConfig,
  matchTransaction,
  DEFAULT_HD_POOL_COOLDOWN_MS,
} from "../dist/index.js";

const MAIN = "TMainAddressExample";
const USDT_TRON = { asset: "USDT", network: "tron" };

const memoNetworkConfig = {
  asset: "USDT",
  network: "tron",
  enabled: true,
  displayNetwork: "test memo net",
  contractAddress: "TMemo",
  decimals: 6,
  minAmount: "0.01",
  amountStep: "0.01",
  requiredConfirmations: 1,
  memoSupported: true,
};

function candidate(orderId, receiveAddress, payableAmount, extra = {}) {
  return {
    orderId,
    receiveAddress,
    payableAmount,
    asset: "USDT",
    network: "tron",
    ...extra,
  };
}

describe("M3-64 §2.8 Mode B — same-amount collision → Anomaly (M3-T02)", () => {
  it("two open orders same address+amount → payment_anomaly, never verifying", async () => {
    const result = await matchTransaction({
      mode: "B",
      toAddress: MAIN,
      amount: "50.00",
      ...USDT_TRON,
      txHash: "0xb-collision",
      candidates: [
        candidate("ord-b1", MAIN, "50.00"),
        candidate("ord-b2", MAIN, "50.00"),
      ],
    });
    assert.equal(result.status, "payment_anomaly");
    assert.notEqual(result.status, "verifying");
    assert.notEqual(result.status, "completed");
    assert.deepEqual(result.orderIds, ["ord-b1", "ord-b2"]);
  });
});

describe("M3-64 §2.8 Mode C — concurrent fingerprints (M3-T03)", () => {
  it("two reserved amounts match the correct orders", async () => {
    const reserved = [];
    const first = await assignModeC({
      mode: "C",
      merchantId: "m1",
      ...USDT_TRON,
      requestedAmount: "50.00",
      mainSettlementAddress: MAIN,
      listReservedPayableAmounts: async () => [...reserved],
    });
    reserved.push(first.payableAmount.amount);
    const second = await assignModeC({
      mode: "C",
      merchantId: "m1",
      ...USDT_TRON,
      requestedAmount: "50.00",
      mainSettlementAddress: MAIN,
      listReservedPayableAmounts: async () => [...reserved],
    });
    assert.notEqual(first.payableAmount.amount, second.payableAmount.amount);

    const candidates = [
      candidate("ord-c1", MAIN, first.payableAmount.amount),
      candidate("ord-c2", MAIN, second.payableAmount.amount),
    ];
    const hit1 = await matchTransaction({
      mode: "C",
      toAddress: MAIN,
      amount: first.payableAmount.amount,
      ...USDT_TRON,
      txHash: "0xc1",
      candidates,
    });
    const hit2 = await matchTransaction({
      mode: "C",
      toAddress: MAIN,
      amount: second.payableAmount.amount,
      ...USDT_TRON,
      txHash: "0xc2",
      candidates,
    });
    assert.equal(hit1.orderId, "ord-c1");
    assert.equal(hit2.orderId, "ord-c2");
    assert.equal(hit1.status, "verifying");
    assert.equal(hit2.status, "verifying");
  });
});

describe("M3-64 §2.8 Mode D — supported vs USDT Tron (M3-T04)", () => {
  it("rejects assign on USDT Tron (memoSupported=false)", async () => {
    await assert.rejects(
      () =>
        assignModeD({
          mode: "D",
          merchantId: "m1",
          ...USDT_TRON,
          requestedAmount: "50.00",
          mainSettlementAddress: MAIN,
          memoSeed: "seed",
          listReservedMemoOrTags: async () => [],
        }),
      /memo not supported/,
    );
  });

  it("match on USDT Tron does not auto-complete", async () => {
    const result = await matchTransaction({
      mode: "D",
      toAddress: MAIN,
      amount: "50.00",
      ...USDT_TRON,
      memoOrTag: "CG-seed",
      txHash: "0xd-tron",
      candidates: [candidate("ord-d", MAIN, "50.00", { memoOrTag: "CG-seed" })],
    });
    assert.notEqual(result.status, "verifying");
    assert.notEqual(result.status, "completed");
  });

  it("supported network: missing/wrong memo is anomaly, not verifying", async () => {
    const assigned = await assignModeDForConfig(
      {
        mode: "D",
        merchantId: "m1",
        ...USDT_TRON,
        requestedAmount: "50.00",
        mainSettlementAddress: MAIN,
        memoSeed: "seed1",
        listReservedMemoOrTags: async () => [],
      },
      memoNetworkConfig,
    );
    const missing = await matchModeDForConfig(
      {
        mode: "D",
        toAddress: MAIN,
        amount: "50.00",
        ...USDT_TRON,
        txHash: "0xd-miss",
        candidates: [
          candidate("ord-d1", MAIN, "50.00", { memoOrTag: assigned.memoOrTag }),
        ],
      },
      memoNetworkConfig,
    );
    const wrong = await matchModeDForConfig(
      {
        mode: "D",
        toAddress: MAIN,
        amount: "50.00",
        memoOrTag: "WRONG",
        ...USDT_TRON,
        txHash: "0xd-wrong",
        candidates: [
          candidate("ord-d1", MAIN, "50.00", { memoOrTag: assigned.memoOrTag }),
        ],
      },
      memoNetworkConfig,
    );
    assert.equal(missing.status, "payment_anomaly");
    assert.equal(wrong.status, "payment_anomaly");
  });
});

describe("M3-64 §2.8 Mode S — assign + match + pool reuse (M3-T05)", () => {
  it("no conflict uses main; three same-amount orders get distinct destinations", async () => {
    const claimed = [];
    let nextHd = 0;
    const claim = async () => {
      const hdIndex = nextHd++;
      const row = {
        receiveAddress: `THdDerived${String(hdIndex).padStart(4, "0")}`,
        hdIndex,
      };
      claimed.push(row);
      return row;
    };

    const o1 = await assignModeS({
      mode: "S",
      merchantId: "m1",
      ...USDT_TRON,
      requestedAmount: "50.00",
      mainSettlementAddress: MAIN,
      xPubConfigured: true,
      hasModeSSameAmountConflict: async () => false,
    });
    const o2 = await assignModeS({
      mode: "S",
      merchantId: "m1",
      ...USDT_TRON,
      requestedAmount: "50.00",
      mainSettlementAddress: MAIN,
      xPubConfigured: true,
      hasModeSSameAmountConflict: async () => true,
      claimHdPoolAddress: claim,
    });
    const o3 = await assignModeS({
      mode: "S",
      merchantId: "m1",
      ...USDT_TRON,
      requestedAmount: "50.00",
      mainSettlementAddress: MAIN,
      xPubConfigured: true,
      hasModeSSameAmountConflict: async () => true,
      claimHdPoolAddress: claim,
    });

    assert.equal(o1.addressSource, "main");
    assert.equal(o1.receiveAddress, MAIN);
    assert.equal(o2.addressSource, "hd_pool");
    assert.equal(o3.addressSource, "hd_pool");
    const dests = [o1, o2, o3].map((o) => o.receiveAddress);
    assert.equal(new Set(dests).size, 3);

    const issued = dests.slice();
    const candidates = [
      candidate("ord-s1", o1.receiveAddress, "50.00"),
      candidate("ord-s2", o2.receiveAddress, "50.00"),
      candidate("ord-s3", o3.receiveAddress, "50.00"),
    ];
    const m1 = await matchTransaction({
      mode: "S",
      toAddress: o1.receiveAddress,
      amount: "50.00",
      ...USDT_TRON,
      txHash: "0xs1",
      candidates,
    });
    const m2 = await matchTransaction({
      mode: "S",
      toAddress: o2.receiveAddress,
      amount: "50.00",
      ...USDT_TRON,
      txHash: "0xs2",
      candidates,
    });
    const m3 = await matchTransaction({
      mode: "S",
      toAddress: o3.receiveAddress,
      amount: "50.00",
      ...USDT_TRON,
      txHash: "0xs3",
      candidates,
    });
    assert.deepEqual(
      [m1.orderId, m2.orderId, m3.orderId],
      ["ord-s1", "ord-s2", "ord-s3"],
    );
    assert.deepEqual(dests, issued);
  });

  it("pool reuses FREE after cool-down; derives when empty", async () => {
    /** @type {{ receiveAddress: string, hdIndex: number, state: string, cooldownStartedAtMs?: number }[]} */
    const pool = [];
    let nextIndex = 0;

    const claim = async () => {
      const free = pool.find((s) => s.state === "FREE");
      if (free) {
        free.state = hdPoolStateAfterClaim("FREE");
        return { receiveAddress: free.receiveAddress, hdIndex: free.hdIndex };
      }
      const hdIndex = nextIndex++;
      const row = {
        receiveAddress: `THdPool${String(hdIndex).padStart(4, "0")}`,
        hdIndex,
        state: hdPoolStateAfterClaim("FREE"),
      };
      pool.push(row);
      return { receiveAddress: row.receiveAddress, hdIndex };
    };

    const first = await assignModeS({
      mode: "S",
      merchantId: "m1",
      ...USDT_TRON,
      requestedAmount: "50.00",
      mainSettlementAddress: MAIN,
      xPubConfigured: true,
      hasModeSSameAmountConflict: async () => true,
      claimHdPoolAddress: claim,
    });
    assert.equal(pool.length, 1);
    assert.equal(first.hdIndex, 0);

    for (const slot of pool) {
      slot.state = hdPoolStateAfterOrderFinal("IN_USE");
      slot.cooldownStartedAtMs = 1_000;
    }
    assert.equal(pool[0].state, "COOLDOWN");
    assert.equal(
      isHdPoolCooldownElapsed({
        cooldownStartedAtMs: 1_000,
        nowMs: 1_000 + DEFAULT_HD_POOL_COOLDOWN_MS - 1,
      }),
      false,
    );
    for (const slot of pool) {
      if (
        slot.state === "COOLDOWN" &&
        isHdPoolCooldownElapsed({
          cooldownStartedAtMs: slot.cooldownStartedAtMs,
          nowMs: 1_000 + DEFAULT_HD_POOL_COOLDOWN_MS,
        })
      ) {
        slot.state = hdPoolStateAfterCooldownElapsed("COOLDOWN");
      }
    }
    assert.equal(pool[0].state, "FREE");

    const reused = await assignModeS({
      mode: "S",
      merchantId: "m1",
      ...USDT_TRON,
      requestedAmount: "50.00",
      mainSettlementAddress: MAIN,
      xPubConfigured: true,
      hasModeSSameAmountConflict: async () => true,
      claimHdPoolAddress: claim,
    });
    assert.equal(reused.receiveAddress, first.receiveAddress);
    assert.equal(reused.hdIndex, 0);
    assert.equal(pool.length, 1);

    const derived = await assignModeS({
      mode: "S",
      merchantId: "m1",
      ...USDT_TRON,
      requestedAmount: "50.00",
      mainSettlementAddress: MAIN,
      xPubConfigured: true,
      hasModeSSameAmountConflict: async () => true,
      claimHdPoolAddress: claim,
    });
    assert.equal(pool.length, 2);
    assert.notEqual(derived.receiveAddress, first.receiveAddress);
    assert.equal(derived.hdIndex, 1);
  });

  it("issued order address is never rewritten by later assigns", async () => {
    const issued = [];
    let nextHd = 0;
    const o1 = await assignModeS({
      mode: "S",
      merchantId: "m1",
      ...USDT_TRON,
      requestedAmount: "50.00",
      mainSettlementAddress: MAIN,
      xPubConfigured: true,
      hasModeSSameAmountConflict: async () => false,
    });
    issued.push({ ...o1 });
    const o2 = await assignModeS({
      mode: "S",
      merchantId: "m1",
      ...USDT_TRON,
      requestedAmount: "50.00",
      mainSettlementAddress: MAIN,
      xPubConfigured: true,
      hasModeSSameAmountConflict: async () => true,
      claimHdPoolAddress: async () => ({
        receiveAddress: `THdNever${nextHd}`,
        hdIndex: nextHd++,
      }),
    });
    issued.push({ ...o2 });
    assert.equal(issued[0].receiveAddress, MAIN);
    assert.equal(o1.receiveAddress, issued[0].receiveAddress);
    assert.equal(o1.addressSource, "main");
    assert.notEqual(o2.receiveAddress, o1.receiveAddress);
  });
});

describe("M3-64 §2.8 / M3-T06 underpay overpay wrong-network duplicate-hash", () => {
  it("sole Mode B underpay and overpay are anomalies", async () => {
    const under = await matchTransaction({
      mode: "B",
      toAddress: MAIN,
      amount: "49.00",
      ...USDT_TRON,
      txHash: "0xunder",
      candidates: [candidate("ord-u", MAIN, "50.00")],
    });
    const over = await matchTransaction({
      mode: "B",
      toAddress: MAIN,
      amount: "51.00",
      ...USDT_TRON,
      txHash: "0xover",
      candidates: [candidate("ord-o", MAIN, "50.00")],
    });
    assert.equal(under.status, "payment_anomaly");
    assert.equal(under.reason, "mode_b_underpay");
    assert.equal(over.status, "payment_anomaly");
    assert.equal(over.reason, "mode_b_overpay");
  });

  it("Mode B underpay within locked tolerance still matches", async () => {
    const result = await matchTransaction({
      mode: "B",
      toAddress: MAIN,
      amount: "49.99",
      ...USDT_TRON,
      txHash: "0xtol",
      candidates: [candidate("ord-tol", MAIN, "50.00", { underpayTolerance: "0.01" })],
    });
    assert.equal(result.status, "verifying");
    assert.equal(result.orderId, "ord-tol");
    assert.equal(result.reason, "mode_b_exact_match");
  });

  it("wrong network does not bind (unmatched)", async () => {
    const result = await matchTransaction({
      mode: "B",
      toAddress: MAIN,
      amount: "50.00",
      asset: "USDT",
      network: "tron",
      txHash: "0xnet",
      candidates: [
        {
          orderId: "ord-eth",
          payableAmount: "50.00",
          receiveAddress: MAIN,
          asset: "USDT",
          network: "ethereum",
        },
      ],
    });
    assert.equal(result.status, "pending_payment");
    assert.equal(result.reason, "no_open_order_at_address");
    assert.equal(result.orderId, undefined);
  });
});
