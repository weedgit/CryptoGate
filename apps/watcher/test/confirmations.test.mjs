import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  nextConfirmationStatus,
  processConfirmationBatch,
} from "../src/confirm/advance.mjs";

describe("@paymentgate/watcher confirmations (M3-42)", () => {
  it("awaits when confirmations below required", () => {
    const d = nextConfirmationStatus({
      status: "verifying",
      confirmations: 3,
      requiredConfirmations: 19,
    });
    assert.equal(d.nextStatus, null);
    assert.equal(d.reason, "awaiting_confirmations");
  });

  it("completes verifying when confirmations met (Phase 1 one-step)", () => {
    const d = nextConfirmationStatus({
      status: "verifying",
      confirmations: 19,
      requiredConfirmations: 19,
    });
    assert.equal(d.nextStatus, "completed");
    assert.equal(d.reason, "confirmations_met");
  });

  it("completes confirmed when confirmations met", () => {
    const d = nextConfirmationStatus({
      status: "confirmed",
      confirmations: 20,
      requiredConfirmations: 19,
    });
    assert.equal(d.nextStatus, "completed");
  });

  it("ignores pending_payment", () => {
    const d = nextConfirmationStatus({
      status: "pending_payment",
      confirmations: 99,
      requiredConfirmations: 1,
    });
    assert.equal(d.nextStatus, null);
  });

  it("processConfirmationBatch applies completed when stub confirms enough", async () => {
    const applied = [];
    const outcomes = await processConfirmationBatch({
      orders: [
        {
          orderId: "o1",
          status: "verifying",
          txHash: "0x1",
          confirmations: 0,
          requiredConfirmations: 2,
          network: "tron",
        },
      ],
      getConfirmations: async () => 5,
      apply: async (args) => {
        applied.push(args);
        return { updated: 1 };
      },
    });
    assert.equal(applied[0].nextStatus, "completed");
    assert.equal(applied[0].confirmations, 5);
    assert.equal(outcomes[0].updated, 1);
  });

  it("skips orders without tx_hash", async () => {
    const outcomes = await processConfirmationBatch({
      orders: [
        {
          orderId: "o2",
          status: "verifying",
          txHash: null,
          confirmations: 0,
          requiredConfirmations: 1,
          network: "tron",
        },
      ],
      getConfirmations: async () => 99,
      apply: async () => ({ updated: 0 }),
    });
    assert.equal(outcomes[0].skipped, true);
  });

  it("confirms several orders in input order under concurrency", async () => {
    const seen = [];
    const outcomes = await processConfirmationBatch({
      concurrency: 4,
      orders: [
        {
          orderId: "a",
          status: "verifying",
          txHash: "0xa",
          confirmations: 0,
          requiredConfirmations: 1,
          network: "tron",
        },
        {
          orderId: "b",
          status: "verifying",
          txHash: "0xb",
          confirmations: 0,
          requiredConfirmations: 1,
          network: "tron",
        },
      ],
      getConfirmations: async ({ txHash }) => {
        seen.push(txHash);
        return 19;
      },
      apply: async (args) => ({ updated: 1, ...args }),
    });
    assert.deepEqual(
      outcomes.map((o) => o.orderId),
      ["a", "b"],
    );
    assert.equal(outcomes[0].nextStatus, "completed");
    assert.equal(outcomes[1].nextStatus, "completed");
    assert.equal(seen.length, 2);
  });
});
