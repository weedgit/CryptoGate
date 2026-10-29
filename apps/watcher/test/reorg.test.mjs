import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateConfirmationObservation,
  processConfirmationBatch,
  REORG_CONFIRMATION_DROP_MIN,
} from "../src/confirm/advance.mjs";

describe("@paymentgate/watcher reorg handling (M4-21)", () => {
  it("flags missing tx after confirmations seen", () => {
    const d = evaluateConfirmationObservation(
      {
        status: "verifying",
        confirmations: 5,
        requiredConfirmations: 19,
      },
      { confirmations: 0, presence: "missing" },
    );
    assert.equal(d.nextStatus, "payment_anomaly");
    assert.equal(d.reason, "tx_missing_reorg");
    assert.equal(d.reorg, true);
  });

  it("waits when missing and never confirmed yet", () => {
    const d = evaluateConfirmationObservation(
      {
        status: "verifying",
        confirmations: 0,
        requiredConfirmations: 19,
      },
      { confirmations: 0, presence: "missing" },
    );
    assert.equal(d.skipWrite, true);
    assert.equal(d.reason, "tx_not_indexed_yet");
  });

  it("skips write on rpc unknown", () => {
    const d = evaluateConfirmationObservation(
      {
        status: "verifying",
        confirmations: 10,
        requiredConfirmations: 19,
      },
      { confirmations: 0, presence: "unknown" },
    );
    assert.equal(d.skipWrite, true);
    assert.equal(d.reason, "rpc_unknown");
  });

  it("flags sharp confirmation drop", () => {
    const d = evaluateConfirmationObservation(
      {
        status: "verifying",
        confirmations: 12,
        requiredConfirmations: 19,
      },
      {
        confirmations: 12 - REORG_CONFIRMATION_DROP_MIN,
        presence: "confirmed",
      },
    );
    assert.equal(d.nextStatus, "payment_anomaly");
    assert.equal(d.reason, "confirmations_dropped_reorg");
  });

  it("processConfirmationBatch applies reorg anomaly after repeated missing answers (M7)", async () => {
    const { resetMissingStreaks } = await import("../src/confirm/advance.mjs");
    resetMissingStreaks();
    const applied = [];
    const run = () => processConfirmationBatch({
      orders: [
        {
          orderId: "o1",
          status: "verifying",
          txHash: "0xdead",
          confirmations: 8,
          requiredConfirmations: 19,
          network: "tron",
        },
      ],
      getConfirmationState: async () => ({
        confirmations: 0,
        presence: "missing",
      }),
      apply: async (args) => {
        applied.push(args);
        return { updated: 1 };
      },
    });
    await run();
    await run();
    assert.equal(applied.length, 0, "one or two empty answers are not a reorg");
    const outcomes = await run();
    assert.equal(applied[0].nextStatus, "payment_anomaly");
    assert.equal(applied[0].reorg, true);
    assert.equal(applied[0].anomalyReason, "tx_missing_reorg");
    assert.equal(outcomes[0].reorg, true);
  });

  it("a single empty receipt does not flip a paid order (M7)", () => {
    const d = evaluateConfirmationObservation(
      { status: "verifying", confirmations: 8, requiredConfirmations: 19 },
      { confirmations: 0, presence: "missing", missingCount: 1 },
    );
    assert.equal(d.skipWrite, true);
    assert.equal(d.reason, "tx_missing_recheck");
  });

  it("a tx never mined for 30 minutes becomes a dropped anomaly (M7)", () => {
    const waiting = evaluateConfirmationObservation(
      { status: "verifying", confirmations: 0, requiredConfirmations: 19 },
      { confirmations: 0, presence: "missing", missingCount: 5, missingForMs: 5 * 60 * 1000 },
    );
    assert.equal(waiting.skipWrite, true);
    const dropped = evaluateConfirmationObservation(
      { status: "verifying", confirmations: 0, requiredConfirmations: 19 },
      { confirmations: 0, presence: "missing", missingCount: 60, missingForMs: 31 * 60 * 1000 },
    );
    assert.equal(dropped.nextStatus, "payment_anomaly");
    assert.equal(dropped.reason, "tx_dropped");
  });

  it("flags a failed tx as anomaly even before any confirmation (C1)", () => {
    const d = evaluateConfirmationObservation(
      { status: "verifying", confirmations: 0, requiredConfirmations: 19 },
      { confirmations: 0, presence: "failed", failureReason: "tx_not_token_transfer" },
    );
    assert.equal(d.nextStatus, "payment_anomaly");
    assert.equal(d.reason, "tx_not_token_transfer");
    assert.equal(d.skipWrite, false);
  });

  it("processConfirmationBatch passes receive address and failure reason", async () => {
    const applied = [];
    const seen = [];
    await processConfirmationBatch({
      orders: [
        {
          orderId: "o1",
          status: "verifying",
          txHash: "0xdead",
          confirmations: 0,
          requiredConfirmations: 19,
          network: "tron",
          receiveAddress: "TPayee",
        },
      ],
      getConfirmationState: async (args) => {
        seen.push(args);
        return { confirmations: 0, presence: "failed", failureReason: "tx_failed" };
      },
      apply: async (args) => {
        applied.push(args);
        return { updated: 1 };
      },
    });
    assert.equal(seen[0].toAddress, "TPayee");
    assert.equal(applied[0].nextStatus, "payment_anomaly");
    assert.equal(applied[0].anomalyReason, "tx_failed");
  });
});
