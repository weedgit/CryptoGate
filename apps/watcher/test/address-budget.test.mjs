import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  addressPriorityScore,
  detectionLatencyFromBlockMs,
  resolveNextPollIntervalMs,
  rotateFromCursor,
  selectAddressesForPoll,
} from "../src/ingest/address-budget.mjs";
import {
  getScopeCursor,
  resetScopeCursors,
  setScopeCursor,
  scopeCursorKey,
} from "../src/ingest/scope-cursors.mjs";
import {
  drainTransferHints,
  pushTransferHint,
  resetTransferHints,
  transferHintQueueSize,
} from "../src/ingest/transfer-hints.mjs";
import { loadWatcherConfig, resolveWatchScopes } from "../src/config.mjs";

function order(partial) {
  return {
    receiveAddress: "TADDR",
    status: "pending_payment",
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-01T01:00:00.000Z",
    ...partial,
  };
}

describe("address budget — pending-first + rotation", () => {
  it("prefers pending_payment addresses over verifying-only", () => {
    const selected = selectAddressesForPoll({
      budget: 1,
      cursor: 0,
      orders: [
        order({
          receiveAddress: "V1",
          status: "verifying",
        }),
        order({
          receiveAddress: "P1",
          status: "pending_payment",
          expiresAt: "2026-01-01T00:30:00.000Z",
        }),
      ],
    });
    assert.deepEqual(selected.addresses, ["P1"]);
    assert.equal(selected.pendingAddressCount, 1);
    assert.equal(selected.deferredAddressCount, 1);
  });

  it("among pending, prefers sooner expiry then newer create", () => {
    const selected = selectAddressesForPoll({
      budget: 1,
      cursor: 0,
      orders: [
        order({
          receiveAddress: "LATE",
          expiresAt: "2026-01-01T02:00:00.000Z",
          createdAt: "2026-01-01T00:10:00.000Z",
        }),
        order({
          receiveAddress: "SOON",
          expiresAt: "2026-01-01T00:20:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
    });
    assert.deepEqual(selected.addresses, ["SOON"]);
  });

  it("rotates fairly when pending addresses exceed budget", () => {
    const orders = ["A", "B", "C"].map((receiveAddress) =>
      order({ receiveAddress }),
    );
    const first = selectAddressesForPoll({ budget: 2, cursor: 0, orders });
    assert.deepEqual(first.addresses, ["A", "B"]);
    const second = selectAddressesForPoll({
      budget: 2,
      cursor: first.nextCursor,
      orders,
    });
    assert.deepEqual(second.addresses, ["C", "A"]);
  });

  it("includes extra backfill addresses after pending", () => {
    const selected = selectAddressesForPoll({
      budget: 2,
      cursor: 0,
      orders: [order({ receiveAddress: "P1" })],
      extraAddresses: ["BF1", "BF2"],
    });
    assert.equal(selected.addresses[0], "P1");
    assert.ok(selected.addresses.includes("BF1") || selected.addresses.includes("BF2"));
  });

  it("rotateFromCursor wraps", () => {
    assert.deepEqual(rotateFromCursor(["a", "b", "c"], 1), ["b", "c", "a"]);
    assert.deepEqual(rotateFromCursor(["a", "b", "c"], 3), ["a", "b", "c"]);
  });

  it("addressPriorityScore tiers pending ahead of verifying", () => {
    const pending = addressPriorityScore([order({ status: "pending_payment" })]);
    const verifying = addressPriorityScore([order({ status: "verifying" })]);
    assert.ok(pending.tier < verifying.tier);
  });
});

describe("adaptive poll interval", () => {
  const config = {
    pendingPollIntervalMs: 2000,
    pollIntervalMs: 5000,
    idlePollIntervalMs: 15000,
  };

  it("uses pending interval when Detected work exists", () => {
    assert.equal(
      resolveNextPollIntervalMs(config, { pendingPaymentOrders: 3 }),
      2000,
    );
  });

  it("uses normal interval when only confirming", () => {
    assert.equal(
      resolveNextPollIntervalMs(config, {
        pendingPaymentOrders: 0,
        awaitingConfirmations: 2,
      }),
      5000,
    );
  });

  it("uses idle interval when empty", () => {
    assert.equal(resolveNextPollIntervalMs(config, {}), 15000);
  });
});

describe("detection latency metric", () => {
  it("returns ms since block timestamp", () => {
    assert.equal(
      detectionLatencyFromBlockMs({
        blockTimestampMs: 1_000_000,
        nowMs: 1_007_500,
      }),
      7500,
    );
  });

  it("returns null without block time", () => {
    assert.equal(detectionLatencyFromBlockMs({ nowMs: 1 }), null);
  });
});

describe("scope cursors", () => {
  beforeEach(() => resetScopeCursors());

  it("stores per asset:network", () => {
    const key = scopeCursorKey("USDT", "tron");
    assert.equal(getScopeCursor(key), 0);
    setScopeCursor(key, 12);
    assert.equal(getScopeCursor(key), 12);
    assert.equal(getScopeCursor(scopeCursorKey("USDT", "ethereum")), 0);
  });
});

describe("transfer hints (Phase 2 push bridge)", () => {
  beforeEach(() => resetTransferHints());

  it("rejects incomplete hints", () => {
    assert.equal(pushTransferHint({ toAddress: "T1" }), false);
    assert.equal(transferHintQueueSize(), 0);
  });

  it("drains only matching asset+network+address", () => {
    assert.ok(
      pushTransferHint({
        toAddress: "T1",
        amount: "10",
        asset: "USDT",
        network: "tron",
        txHash: "tx1",
      }),
    );
    assert.ok(
      pushTransferHint({
        toAddress: "T2",
        amount: "10",
        asset: "USDT",
        network: "ethereum",
        txHash: "tx2",
      }),
    );
    const taken = drainTransferHints({
      asset: "USDT",
      network: "tron",
      watchedAddresses: ["T1"],
    });
    assert.equal(taken.length, 1);
    assert.equal(taken[0].txHash, "tx1");
    assert.equal(transferHintQueueSize(), 1);
  });
});

describe("loadWatcherConfig hot-path defaults", () => {
  it("defaults pending faster than confirm cadence", () => {
    const keys = [
      "WATCHER_POLL_INTERVAL_MS",
      "WATCHER_PENDING_POLL_INTERVAL_MS",
      "WATCHER_IDLE_POLL_INTERVAL_MS",
      "WATCHER_ADDRESS_POLL_BUDGET",
      "WATCHER_PENDING_FAST_TICKS",
    ];
    /** @type {Record<string, string | undefined>} */
    const prev = {};
    for (const k of keys) {
      prev[k] = process.env[k];
      delete process.env[k];
    }
    try {
      const cfg = loadWatcherConfig();
      assert.equal(cfg.pollIntervalMs, 5000);
      assert.equal(cfg.pendingPollIntervalMs, 2000);
      assert.equal(cfg.idlePollIntervalMs, 15000);
      assert.equal(cfg.addressPollBudget, 64);
      assert.equal(cfg.pendingFastTicks, 1);
    } finally {
      for (const k of keys) {
        if (prev[k] === undefined) delete process.env[k];
        else process.env[k] = prev[k];
      }
    }
  });
});

describe("resolveWatchScopes still sorts and filters", () => {
  it("multi mode unions open scopes with DEFAULT fallback", () => {
    const scopes = resolveWatchScopes(
      {
        pollIntervalMs: 5000,
        pendingPollIntervalMs: 2000,
        idlePollIntervalMs: 15000,
        addressPollBudget: 64,
        pendingFastTicks: 1,
        defaultAsset: "USDT",
        defaultNetwork: "tron",
        databaseUrl: null,
        multiNetwork: true,
        networkAllowList: null,
        assetAllowList: null,
        scopeTimeoutMs: 60_000,
        confirmConcurrency: 8,
        scopeConcurrency: 4,
      },
      [
        { asset: "USDT", network: "ethereum" },
        { asset: "USDC", network: "solana" },
      ],
    );
    assert.deepEqual(scopes, [
      { asset: "USDT", network: "ethereum" },
      { asset: "USDC", network: "solana" },
      { asset: "USDT", network: "tron" },
    ]);
  });
});
