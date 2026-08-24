import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assignModeB,
  assignModeC,
  assignModeD,
  assignModeDForConfig,
  assignModeS,
  assignOnCreate,
  assertMatchingSettings,
  majorToMinor,
  matchModeB,
  minorToMajor,
  modeSAddressSource,
  pickUniqueMemoOrTag,
  pickUniquePayableMinor,
  sanitizeMemoSeed,
  validateMatchingSettings,
  MODE_C_RESERVED_STATUSES,
  MODE_D_RESERVED_STATUSES,
  MODE_S_CONFLICT_STATUSES,
  matchTransaction,
} from "../dist/index.js";

const baseAssign = {
  merchantId: "m1",
  asset: "USDT",
  network: "tron",
  requestedAmount: "50.00",
  mainSettlementAddress: "TMainAddressExample",
};

describe("@cryptogate/matching Mode B assign (M2-40)", () => {
  it("assigns main settlement address and payable = requested amount", async () => {
    const result = await assignModeB({ ...baseAssign, mode: "B" });
    assert.equal(result.receiveAddress, "TMainAddressExample");
    assert.equal(result.addressSource, "main");
    assert.equal(result.payableAmount.amount, "50.00");
    assert.equal(result.payableAmount.currency, "USDT");
    assert.equal(result.hdIndex, null);
    assert.equal(result.memoOrTag, null);
  });

  it("trims settlement address", async () => {
    const result = await assignModeB({
      ...baseAssign,
      mode: "B",
      mainSettlementAddress: "  TMainAddressExample  ",
    });
    assert.equal(result.receiveAddress, "TMainAddressExample");
  });

  it("assignOnCreate routes Mode B", async () => {
    const result = await assignOnCreate({ ...baseAssign, mode: "B" });
    assert.equal(result.receiveAddress, "TMainAddressExample");
    assert.equal(result.hdIndex, null);
  });

  it("rejects empty settlement address", async () => {
    await assert.rejects(
      () =>
        assignModeB({
          ...baseAssign,
          mode: "B",
          mainSettlementAddress: "   ",
        }),
      /mainSettlementAddress is required/,
    );
  });

  it("rejects amount below registry minAmount", async () => {
    await assert.rejects(
      () =>
        assignModeB({
          ...baseAssign,
          mode: "B",
          requestedAmount: "0.001",
        }),
      /below minAmount/,
    );
  });

  it("rejects unknown asset/network pair", async () => {
    await assert.rejects(
      () =>
        assignModeB({
          ...baseAssign,
          mode: "B",
          network: "ethereum",
        }),
      /not enabled in registry/,
    );
  });

  it("rejects too many decimal places for USDT", async () => {
    await assert.rejects(
      () =>
        assignModeB({
          ...baseAssign,
          mode: "B",
          requestedAmount: "1.1234567",
        }),
      /decimal places/,
    );
  });

  it("majorToMinor respects decimals", () => {
    assert.equal(majorToMinor("50.01", 6), 50010000n);
    assert.equal(majorToMinor("0.01", 6), 10000n);
  });
});

describe("@cryptogate/matching Mode C assign (M2-41)", () => {
  it("exports reserved statuses for Andrew's open-order query", () => {
    assert.deepEqual([...MODE_C_RESERVED_STATUSES], [
      "pending_payment",
      "verifying",
      "confirmed",
      "payment_anomaly",
    ]);
  });

  it("uses requested amount when no reserved payables", async () => {
    const result = await assignModeC({
      ...baseAssign,
      mode: "C",
      listReservedPayableAmounts: async () => [],
    });
    assert.equal(result.payableAmount.amount, "50.00");
    assert.equal(result.receiveAddress, "TMainAddressExample");
    assert.equal(result.addressSource, "main");
    assert.equal(result.hdIndex, null);
    assert.equal(result.memoOrTag, null);
  });

  it("bumps by amountStep when base is reserved", async () => {
    const result = await assignModeC({
      ...baseAssign,
      mode: "C",
      listReservedPayableAmounts: async () => ["50.00", "50.01"],
    });
    assert.equal(result.payableAmount.amount, "50.02");
  });

  it("treats equivalent decimal strings as the same reserved minor", async () => {
    const result = await assignModeC({
      ...baseAssign,
      mode: "C",
      listReservedPayableAmounts: async () => ["50", "50.010000"],
    });
    assert.equal(result.payableAmount.amount, "50.02");
  });

  it("assignOnCreate routes Mode C with reservation port", async () => {
    const result = await assignOnCreate({
      ...baseAssign,
      mode: "C",
      listReservedPayableAmounts: async () => ["50.00"],
    });
    assert.equal(result.payableAmount.amount, "50.01");
  });

  it("rejects Mode C without listReservedPayableAmounts", async () => {
    await assert.rejects(
      () => assignModeC({ ...baseAssign, mode: "C" }),
      /listReservedPayableAmounts is required/,
    );
  });

  it("fails when fingerprint range is exhausted", () => {
    const step = 10000n; // 0.01 USDT at 6 decimals
    const reserved = new Set();
    const base = 50000000n;
    for (let i = 0; i <= 3; i++) reserved.add(base + BigInt(i) * step);
    assert.throws(
      () => pickUniquePayableMinor(base, step, reserved, 3),
      /no free Mode C fingerprint/,
    );
  });

  it("minorToMajor pads fractional digits", () => {
    assert.equal(minorToMajor(50010000n, 6), "50.010000");
    assert.equal(minorToMajor(1n, 6), "0.000001");
  });
});

describe("@cryptogate/matching Mode D assign (M2-42)", () => {
  it("rejects USDT Tron because memoSupported is false", async () => {
    await assert.rejects(
      () =>
        assignModeD({
          ...baseAssign,
          mode: "D",
          memoSeed: "idem-1",
          listReservedMemoOrTags: async () => [],
        }),
      /memo not supported/,
    );
  });

  it("assignOnCreate routes Mode D to memoSupported reject on Tron", async () => {
    await assert.rejects(
      () => assignOnCreate({ ...baseAssign, mode: "D", memoSeed: "x" }),
      /memo not supported/,
    );
  });

  it("exports reserved statuses for Andrew's open-order memo query", () => {
    assert.deepEqual([...MODE_D_RESERVED_STATUSES], [
      "pending_payment",
      "verifying",
      "confirmed",
      "payment_anomaly",
    ]);
  });

  it("pickUniqueMemoOrTag uses CG-seed and bumps on collision", () => {
    assert.equal(pickUniqueMemoOrTag("ord-1", new Set()), "CG-ord-1");
    assert.equal(
      pickUniqueMemoOrTag("ord-1", new Set(["CG-ord-1"])),
      "CG-ord-1-2",
    );
  });

  it("sanitizeMemoSeed strips unsafe characters", () => {
    assert.equal(sanitizeMemoSeed("  ab/cd#1  "), "ab_cd_1");
  });

  it("assignModeDForConfig assigns memo when memoSupported", async () => {
    const config = {
      asset: "USDT",
      network: "ton",
      enabled: true,
      displayNetwork: "TON",
      contractAddress: null,
      decimals: 6,
      minAmount: "0.01",
      amountStep: "0.01",
      requiredConfirmations: 1,
      memoSupported: true,
    };
    const result = await assignModeDForConfig(
      {
        ...baseAssign,
        mode: "D",
        network: "ton",
        memoSeed: "idem-abc",
        listReservedMemoOrTags: async () => ["CG-other"],
      },
      config,
    );
    assert.equal(result.memoOrTag, "CG-idem-abc");
    assert.equal(result.payableAmount.amount, "50.00");
    assert.equal(result.receiveAddress, "TMainAddressExample");
    assert.equal(result.addressSource, "main");
    assert.equal(result.hdIndex, null);
  });

  it("assignModeDForConfig requires memoSeed and reservation port", async () => {
    const config = {
      asset: "USDT",
      network: "ton",
      enabled: true,
      displayNetwork: "TON",
      contractAddress: null,
      decimals: 6,
      minAmount: "0.01",
      amountStep: "0.01",
      requiredConfirmations: 1,
      memoSupported: true,
    };
    await assert.rejects(
      () =>
        assignModeDForConfig(
          { ...baseAssign, mode: "D", listReservedMemoOrTags: async () => [] },
          config,
        ),
      /memoSeed is required/,
    );
    await assert.rejects(
      () =>
        assignModeDForConfig(
          { ...baseAssign, mode: "D", memoSeed: "x" },
          config,
        ),
      /listReservedMemoOrTags is required/,
    );
  });
});

describe("@cryptogate/matching matching settings policy (M2-45)", () => {
  it("allows singular Mode B / C / D / S", () => {
    for (const mode of ["B", "C", "D", "S"]) {
      assert.equal(validateMatchingSettings({ mode }).ok, true);
    }
  });

  it("rejects Mode S + Mode C via mode C with smartAddressEnabled", () => {
    const result = validateMatchingSettings({
      mode: "C",
      smartAddressEnabled: true,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "mode_s_with_mode_c");
  });

  it("rejects Mode S + Mode C via mode S with amountFingerprintEnabled", () => {
    const result = validateMatchingSettings({
      mode: "S",
      amountFingerprintEnabled: true,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "mode_s_with_mode_c");
  });

  it("rejects both secondary collision flags together", () => {
    const result = validateMatchingSettings({
      mode: "B",
      smartAddressEnabled: true,
      amountFingerprintEnabled: true,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "mode_s_with_mode_c");
  });

  it("allows Mode C with zero underpay tolerance", () => {
    assert.equal(
      validateMatchingSettings({
        mode: "C",
        underpayTolerance: "0",
        amountStep: "0.01",
        decimals: 6,
      }).ok,
      true,
    );
  });

  it("allows Mode C underpay strictly below amountStep", () => {
    assert.equal(
      validateMatchingSettings({
        mode: "C",
        underpayTolerance: "0.001",
        amountStep: "0.01",
        decimals: 6,
      }).ok,
      true,
    );
  });

  it("rejects Mode C underpay >= amountStep", () => {
    const result = validateMatchingSettings({
      mode: "C",
      underpayTolerance: "0.01",
      amountStep: "0.01",
      decimals: 6,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "mode_c_underpay_too_wide");
  });

  it("assertMatchingSettings throws on Mode S + C", () => {
    assert.throws(
      () =>
        assertMatchingSettings({
          mode: "S",
          amountFingerprintEnabled: true,
        }),
      /mode_s_with_mode_c/,
    );
  });
});

describe("@cryptogate/matching Mode S assign (M2-43)", () => {
  it("exports conflict statuses for Andrew's open-order query", () => {
    assert.deepEqual([...MODE_S_CONFLICT_STATUSES], [
      "pending_payment",
      "verifying",
      "confirmed",
      "payment_anomaly",
    ]);
  });

  it("modeSAddressSource maps conflict to hd_pool", () => {
    assert.equal(modeSAddressSource(false), "main");
    assert.equal(modeSAddressSource(true), "hd_pool");
  });

  it("falls back to main address when xPub is not configured", async () => {
    const result = await assignModeS({ ...baseAssign, mode: "S" });
    assert.equal(result.receiveAddress, "TMainAddressExample");
    assert.equal(result.addressSource, "main");
    assert.equal(result.hdIndex, null);
    assert.equal(result.payableAmount.amount, "50.00");
  });

  it("uses main address when xPub configured and no conflict", async () => {
    const result = await assignModeS({
      ...baseAssign,
      mode: "S",
      xPubConfigured: true,
      hasModeSSameAmountConflict: async () => false,
    });
    assert.equal(result.addressSource, "main");
    assert.equal(result.hdIndex, null);
    assert.equal(result.memoOrTag, null);
  });

  it("claims HD pool address on same-amount conflict", async () => {
    const result = await assignModeS({
      ...baseAssign,
      mode: "S",
      xPubConfigured: true,
      hasModeSSameAmountConflict: async () => true,
      claimHdPoolAddress: async () => ({
        receiveAddress: "THdDerivedAddress0001",
        hdIndex: 3,
      }),
    });
    assert.equal(result.receiveAddress, "THdDerivedAddress0001");
    assert.equal(result.addressSource, "hd_pool");
    assert.equal(result.hdIndex, 3);
    assert.equal(result.payableAmount.amount, "50.00");
  });

  it("assignOnCreate routes Mode S conflict to HD", async () => {
    const result = await assignOnCreate({
      ...baseAssign,
      mode: "S",
      xPubConfigured: true,
      hasModeSSameAmountConflict: async () => true,
      claimHdPoolAddress: async () => ({
        receiveAddress: "THdDerivedAddress0002",
        hdIndex: 0,
      }),
    });
    assert.equal(result.addressSource, "hd_pool");
    assert.equal(result.hdIndex, 0);
  });

  it("requires conflict port when xPub configured", async () => {
    await assert.rejects(
      () =>
        assignModeS({
          ...baseAssign,
          mode: "S",
          xPubConfigured: true,
        }),
      /hasModeSSameAmountConflict is required/,
    );
  });

  it("requires claimHdPoolAddress on conflict", async () => {
    await assert.rejects(
      () =>
        assignModeS({
          ...baseAssign,
          mode: "S",
          xPubConfigured: true,
          hasModeSSameAmountConflict: async () => true,
        }),
      /claimHdPoolAddress is required/,
    );
  });

  it("rejects HD claim that returns main settlement address", async () => {
    await assert.rejects(
      () =>
        assignModeS({
          ...baseAssign,
          mode: "S",
          xPubConfigured: true,
          hasModeSSameAmountConflict: async () => true,
          claimHdPoolAddress: async () => ({
            receiveAddress: "TMainAddressExample",
            hdIndex: 1,
          }),
        }),
      /must not return the main settlement address/,
    );
  });
});

describe("@cryptogate/matching Mode B match (M3-60)", () => {
  const baseCandidate = {
    orderId: "ord-1",
    payableAmount: "50.00",
    receiveAddress: "TMainAddressExample",
    asset: "USDT",
    network: "tron",
  };

  const baseTx = {
    mode: "B",
    toAddress: "TMainAddressExample",
    amount: "50.00",
    asset: "USDT",
    network: "tron",
    txHash: "0xabc",
  };

  it("exact unique match → verifying", async () => {
    const result = await matchModeB({
      ...baseTx,
      candidates: [baseCandidate],
    });
    assert.equal(result.status, "verifying");
    assert.equal(result.orderId, "ord-1");
    assert.equal(result.reason, "mode_b_exact_match");
  });

  it("same-amount collision → payment_anomaly with all orderIds (never FIFO)", async () => {
    const result = await matchTransaction({
      ...baseTx,
      candidates: [
        baseCandidate,
        { ...baseCandidate, orderId: "ord-2" },
      ],
    });
    assert.equal(result.status, "payment_anomaly");
    assert.deepEqual(result.orderIds, ["ord-1", "ord-2"]);
    assert.equal(result.orderId, undefined);
    assert.equal(result.reason, "mode_b_same_amount_collision");
  });

  it("treats equivalent decimals as the same payable", async () => {
    const result = await matchModeB({
      ...baseTx,
      amount: "50",
      candidates: [{ ...baseCandidate, payableAmount: "50.000000" }],
    });
    assert.equal(result.status, "verifying");
    assert.equal(result.orderId, "ord-1");
  });

  it("single open order underpay → anomaly", async () => {
    const result = await matchModeB({
      ...baseTx,
      amount: "49.00",
      candidates: [baseCandidate],
    });
    assert.equal(result.status, "payment_anomaly");
    assert.equal(result.orderId, "ord-1");
    assert.equal(result.reason, "mode_b_underpay");
  });

  it("single open order overpay → anomaly", async () => {
    const result = await matchModeB({
      ...baseTx,
      amount: "51.00",
      candidates: [baseCandidate],
    });
    assert.equal(result.status, "payment_anomaly");
    assert.equal(result.reason, "mode_b_overpay");
  });

  it("no candidates at address → pending (unmatched)", async () => {
    const result = await matchModeB({
      ...baseTx,
      candidates: [],
    });
    assert.equal(result.status, "pending_payment");
    assert.equal(result.reason, "no_open_order_at_address");
  });

  it("late payment after expiry → anomaly", async () => {
    const result = await matchModeB({
      ...baseTx,
      nowMs: Date.parse("2026-08-24T12:00:00.000Z"),
      candidates: [
        {
          ...baseCandidate,
          expiresAt: "2026-08-24T11:00:00.000Z",
        },
      ],
    });
    assert.equal(result.status, "payment_anomaly");
    assert.equal(result.reason, "late_payment_after_expiry");
    assert.deepEqual(result.orderIds, ["ord-1"]);
  });

  it("requires candidates", async () => {
    await assert.rejects(() => matchModeB({ ...baseTx }), /candidates is required/);
  });

  it("Mode C/D/S match still stub until M3-61+", async () => {
    const c = await matchTransaction({ ...baseTx, mode: "C", candidates: [] });
    assert.match(c.reason ?? "", /M3-61/);
    const d = await matchTransaction({ ...baseTx, mode: "D", candidates: [] });
    assert.match(d.reason ?? "", /M3-62/);
    const s = await matchTransaction({ ...baseTx, mode: "S", candidates: [] });
    assert.match(s.reason ?? "", /M3-63/);
  });
});
