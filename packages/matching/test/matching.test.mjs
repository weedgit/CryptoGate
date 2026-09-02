import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assignModeC,
  assignModeD,
  assignModeDForConfig,
  assignModeS,
  assignOnCreate,
  assertMatchingSettings,
  matchModeC,
  matchModeD,
  matchModeDForConfig,
  matchModeS,
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
  canClaimHdPoolSlot,
  hdPoolStateAfterClaim,
  hdPoolStateAfterCooldownElapsed,
  hdPoolStateAfterOrderFinal,
  isHdPoolCooldownElapsed,
  isHdPoolReleaseOrderStatus,
  DEFAULT_HD_POOL_COOLDOWN_MS,
} from "../dist/index.js";

const baseAssign = {
  merchantId: "m1",
  asset: "USDT",
  network: "tron",
  requestedAmount: "50.00",
  mainSettlementAddress: "TMainAddressExample",
};

describe("@paymentgate/matching Mode C assign (M2-41)", () => {
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

describe("@paymentgate/matching Mode D assign (M2-42)", () => {
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

describe("@paymentgate/matching matching settings policy (M2-45)", () => {
  it("allows singular Mode B / C / S; rejects Mode D in Phase 1", () => {
    for (const mode of ["B", "C", "S"]) {
      assert.equal(validateMatchingSettings({ mode }).ok, true);
    }
    const d = validateMatchingSettings({ mode: "D" });
    assert.equal(d.ok, false);
    if (!d.ok) assert.equal(d.code, "mode_d_unavailable_phase1");
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

describe("@paymentgate/matching Mode S assign (M2-43)", () => {
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

describe("@paymentgate/matching Mode S HD pool state (M2-44)", () => {
  it("claims only FREE → IN_USE", () => {
    assert.equal(canClaimHdPoolSlot("FREE"), true);
    assert.equal(canClaimHdPoolSlot("IN_USE"), false);
    assert.equal(canClaimHdPoolSlot("COOLDOWN"), false);
    assert.equal(hdPoolStateAfterClaim("FREE"), "IN_USE");
    assert.throws(() => hdPoolStateAfterClaim("IN_USE"), /FREE/);
  });

  it("releases IN_USE → COOLDOWN on final order statuses", () => {
    assert.equal(hdPoolStateAfterOrderFinal("IN_USE"), "COOLDOWN");
    assert.equal(isHdPoolReleaseOrderStatus("completed"), true);
    assert.equal(isHdPoolReleaseOrderStatus("expired"), true);
    assert.equal(isHdPoolReleaseOrderStatus("verifying"), false);
  });

  it("cooldown → FREE after window", () => {
    assert.equal(hdPoolStateAfterCooldownElapsed("COOLDOWN"), "FREE");
    assert.equal(
      isHdPoolCooldownElapsed({
        cooldownStartedAtMs: 1_000,
        nowMs: 1_000 + DEFAULT_HD_POOL_COOLDOWN_MS,
      }),
      true,
    );
    assert.equal(
      isHdPoolCooldownElapsed({
        cooldownStartedAtMs: 1_000,
        nowMs: 1_000 + DEFAULT_HD_POOL_COOLDOWN_MS - 1,
      }),
      false,
    );
  });
});

describe("@paymentgate/matching Mode S match (M3-63)", () => {
  const baseTx = {
    mode: "S",
    toAddress: "TMainAddressExample",
    amount: "50.00",
    asset: "USDT",
    network: "tron",
    txHash: "0xs1",
  };

  it("exact match on main address → verifying", async () => {
    const result = await matchModeS({
      ...baseTx,
      candidates: [
        {
          orderId: "ord-s1",
          payableAmount: "50.00",
          receiveAddress: "TMainAddressExample",
          asset: "USDT",
          network: "tron",
        },
      ],
    });
    assert.equal(result.status, "verifying");
    assert.equal(result.orderId, "ord-s1");
    assert.equal(result.reason, "mode_s_exact_match");
  });

  it("three same-amount orders on distinct addresses match correctly", async () => {
    const candidates = [
      {
        orderId: "ord-main",
        payableAmount: "50.00",
        receiveAddress: "TMainAddressExample",
        asset: "USDT",
        network: "tron",
      },
      {
        orderId: "ord-hd-0",
        payableAmount: "50.00",
        receiveAddress: "THdDerivedAddress0000",
        asset: "USDT",
        network: "tron",
      },
      {
        orderId: "ord-hd-1",
        payableAmount: "50.00",
        receiveAddress: "THdDerivedAddress0001",
        asset: "USDT",
        network: "tron",
      },
    ];

    const a = await matchTransaction({
      ...baseTx,
      toAddress: "TMainAddressExample",
      txHash: "0xa",
      candidates,
    });
    const b = await matchTransaction({
      ...baseTx,
      toAddress: "THdDerivedAddress0000",
      txHash: "0xb",
      candidates,
    });
    const c = await matchTransaction({
      ...baseTx,
      toAddress: "THdDerivedAddress0001",
      txHash: "0xc",
      candidates,
    });

    assert.equal(a.orderId, "ord-main");
    assert.equal(b.orderId, "ord-hd-0");
    assert.equal(c.orderId, "ord-hd-1");
    assert.equal(a.status, "verifying");
    assert.equal(b.status, "verifying");
    assert.equal(c.status, "verifying");
  });

  it("same-address same-amount collision → anomaly (never FIFO)", async () => {
    const result = await matchModeS({
      ...baseTx,
      candidates: [
        {
          orderId: "ord-1",
          payableAmount: "50.00",
          receiveAddress: "TMainAddressExample",
          asset: "USDT",
          network: "tron",
        },
        {
          orderId: "ord-2",
          payableAmount: "50.00",
          receiveAddress: "TMainAddressExample",
          asset: "USDT",
          network: "tron",
        },
      ],
    });
    assert.equal(result.status, "payment_anomaly");
    assert.equal(result.reason, "mode_s_same_amount_collision");
    assert.deepEqual(result.orderIds, ["ord-1", "ord-2"]);
  });

  it("sole HD order underpay → anomaly", async () => {
    const result = await matchModeS({
      ...baseTx,
      toAddress: "THdDerivedAddress0001",
      amount: "49.00",
      candidates: [
        {
          orderId: "ord-hd",
          payableAmount: "50.00",
          receiveAddress: "THdDerivedAddress0001",
          asset: "USDT",
          network: "tron",
        },
      ],
    });
    assert.equal(result.status, "payment_anomaly");
    assert.equal(result.reason, "mode_s_underpay");
    assert.equal(result.orderId, "ord-hd");
  });

  it("matchTransaction routes Mode S", async () => {
    const result = await matchTransaction({
      ...baseTx,
      candidates: [
        {
          orderId: "ord-s2",
          payableAmount: "50.00",
          receiveAddress: "TMainAddressExample",
          asset: "USDT",
          network: "tron",
        },
      ],
    });
    assert.equal(result.reason, "mode_s_exact_match");
  });
});

describe("@paymentgate/matching Mode D match (M3-62)", () => {
  const memoConfig = {
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

  const baseCandidate = {
    orderId: "ord-d1",
    payableAmount: "50.00",
    receiveAddress: "EQMainAddressExample",
    asset: "USDT",
    network: "ton",
    memoOrTag: "CG-idem-1",
  };

  const baseTx = {
    mode: "D",
    toAddress: "EQMainAddressExample",
    amount: "50.00",
    asset: "USDT",
    network: "ton",
    memoOrTag: "CG-idem-1",
    txHash: "0xdmemo",
  };

  it("rejects match on USDT Tron (memoSupported=false)", async () => {
    const result = await matchModeD({
      mode: "D",
      toAddress: "TMainAddressExample",
      amount: "50.00",
      asset: "USDT",
      network: "tron",
      memoOrTag: "CG-x",
      txHash: "0x1",
      candidates: [
        {
          orderId: "o1",
          payableAmount: "50.00",
          receiveAddress: "TMainAddressExample",
          asset: "USDT",
          network: "tron",
          memoOrTag: "CG-x",
        },
      ],
    });
    assert.equal(result.status, "pending_payment");
    assert.equal(result.reason, "mode_d_memo_unsupported_network");
  });

  it("exact amount + memo → verifying", async () => {
    const result = await matchModeDForConfig(
      { ...baseTx, candidates: [baseCandidate] },
      memoConfig,
    );
    assert.equal(result.status, "verifying");
    assert.equal(result.orderId, "ord-d1");
    assert.equal(result.reason, "mode_d_exact_match");
  });

  it("missing memo → anomaly (not auto-complete)", async () => {
    const result = await matchModeDForConfig(
      { ...baseTx, memoOrTag: "", candidates: [baseCandidate] },
      memoConfig,
    );
    assert.equal(result.status, "payment_anomaly");
    assert.equal(result.reason, "mode_d_memo_missing");
    assert.deepEqual(result.orderIds, ["ord-d1"]);
  });

  it("wrong memo → anomaly", async () => {
    const result = await matchModeDForConfig(
      { ...baseTx, memoOrTag: "CG-other", candidates: [baseCandidate] },
      memoConfig,
    );
    assert.equal(result.status, "payment_anomaly");
    assert.equal(result.reason, "mode_d_memo_mismatch");
  });

  it("two orders distinguished by memo", async () => {
    const candidates = [
      baseCandidate,
      {
        ...baseCandidate,
        orderId: "ord-d2",
        memoOrTag: "CG-idem-2",
      },
    ];
    const a = await matchModeDForConfig(
      { ...baseTx, memoOrTag: "CG-idem-1", candidates },
      memoConfig,
    );
    const b = await matchModeDForConfig(
      { ...baseTx, memoOrTag: "CG-idem-2", candidates },
      memoConfig,
    );
    assert.equal(a.orderId, "ord-d1");
    assert.equal(b.orderId, "ord-d2");
  });

  it("duplicate memo+amount → collision anomaly", async () => {
    const result = await matchModeDForConfig(
      {
        ...baseTx,
        candidates: [
          baseCandidate,
          { ...baseCandidate, orderId: "ord-d2" },
        ],
      },
      memoConfig,
    );
    assert.equal(result.status, "payment_anomaly");
    assert.equal(result.reason, "mode_d_memo_collision");
    assert.deepEqual(result.orderIds, ["ord-d1", "ord-d2"]);
  });
});

describe("@paymentgate/matching Mode C match (M3-61)", () => {
  const baseCandidate = {
    orderId: "ord-c1",
    payableAmount: "50.01",
    receiveAddress: "TMainAddressExample",
    asset: "USDT",
    network: "tron",
  };

  const baseTx = {
    mode: "C",
    toAddress: "TMainAddressExample",
    amount: "50.01",
    asset: "USDT",
    network: "tron",
    txHash: "0xcfp",
  };

  it("exact fingerprint match → verifying", async () => {
    const result = await matchModeC({
      ...baseTx,
      candidates: [
        baseCandidate,
        {
          ...baseCandidate,
          orderId: "ord-c2",
          payableAmount: "50.02",
        },
      ],
    });
    assert.equal(result.status, "verifying");
    assert.equal(result.orderId, "ord-c1");
    assert.equal(result.reason, "mode_c_exact_match");
  });

  it("two concurrent fingerprints match the correct orders", async () => {
    const a = await matchTransaction({
      ...baseTx,
      amount: "50.01",
      candidates: [
        baseCandidate,
        { ...baseCandidate, orderId: "ord-c2", payableAmount: "50.02" },
      ],
    });
    const b = await matchTransaction({
      ...baseTx,
      amount: "50.02",
      candidates: [
        baseCandidate,
        { ...baseCandidate, orderId: "ord-c2", payableAmount: "50.02" },
      ],
    });
    assert.equal(a.orderId, "ord-c1");
    assert.equal(b.orderId, "ord-c2");
  });

  it("duplicate fingerprints (data bug) → anomaly, never FIFO", async () => {
    const result = await matchModeC({
      ...baseTx,
      candidates: [
        baseCandidate,
        { ...baseCandidate, orderId: "ord-c2" },
      ],
    });
    assert.equal(result.status, "payment_anomaly");
    assert.deepEqual(result.orderIds, ["ord-c1", "ord-c2"]);
    assert.equal(result.reason, "mode_c_fingerprint_collision");
  });

  it("wrong fingerprint amount on sole order → underpay anomaly", async () => {
    const result = await matchModeC({
      ...baseTx,
      amount: "50.00",
      candidates: [baseCandidate],
    });
    assert.equal(result.status, "payment_anomaly");
    assert.equal(result.reason, "mode_c_underpay");
  });
});
