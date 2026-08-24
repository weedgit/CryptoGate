import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateConfirmationObservation,
  processConfirmationBatch,
  REORG_CONFIRMATION_DROP_MIN,
} from "../src/confirm/advance.mjs";

describe("@cryptogate/watcher reorg handling (M4-21)", () => {
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

  it("processConfirmationBatch applies reorg anomaly", async () => {
    const applied = [];
    const outcomes = await processConfirmationBatch({
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
    assert.equal(applied[0].nextStatus, "payment_anomaly");
    assert.equal(applied[0].reorg, true);
    assert.equal(outcomes[0].reorg, true);
  });
});
