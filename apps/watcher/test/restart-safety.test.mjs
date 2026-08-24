import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  confirmationWriteNeeded,
  matchWriteNeeded,
} from "../src/orders/restart-safety.mjs";
import {
  applyConfirmationUpdate,
  applyMatchResult,
} from "../src/orders/order-store.mjs";

describe("@cryptogate/watcher restart safety (M4-20)", () => {
  it("matchWriteNeeded skips already-applied verifying + same tx", () => {
    const d = matchWriteNeeded(
      {
        status: "verifying",
        txHash: "0xabc",
        receivedAmount: "10.00",
      },
      { status: "verifying" },
      { txHash: "0xabc", amount: "10.00" },
    );
    assert.equal(d.write, false);
    assert.equal(d.reason, "already_applied");
  });

  it("matchWriteNeeded skips terminal orders", () => {
    const d = matchWriteNeeded(
      { status: "completed", txHash: "0xabc", receivedAmount: "10" },
      { status: "verifying" },
      { txHash: "0xabc", amount: "10" },
    );
    assert.equal(d.write, false);
    assert.equal(d.reason, "terminal_order");
  });

  it("matchWriteNeeded refuses conflicting tx_hash", () => {
    const d = matchWriteNeeded(
      { status: "verifying", txHash: "0xold", receivedAmount: "10" },
      { status: "verifying" },
      { txHash: "0xnew", amount: "10" },
    );
    assert.equal(d.write, false);
    assert.equal(d.reason, "tx_hash_conflict");
  });

  it("matchWriteNeeded writes pending_payment → verifying", () => {
    const d = matchWriteNeeded(
      { status: "pending_payment", txHash: null, receivedAmount: null },
      { status: "verifying" },
      { txHash: "0xabc", amount: "10.00" },
    );
    assert.equal(d.write, true);
  });

  it("confirmationWriteNeeded skips unchanged count", () => {
    const d = confirmationWriteNeeded(
      { status: "verifying", confirmations: 5 },
      5,
      null,
    );
    assert.equal(d.write, false);
    assert.equal(d.reason, "already_current");
  });

  it("confirmationWriteNeeded never decreases confirmations", () => {
    const d = confirmationWriteNeeded(
      { status: "verifying", confirmations: 10 },
      3,
      null,
    );
    assert.equal(d.write, false);
    assert.equal(d.reason, "already_current");
  });

  it("confirmationWriteNeeded writes when count increases", () => {
    const d = confirmationWriteNeeded(
      { status: "verifying", confirmations: 3 },
      7,
      null,
    );
    assert.equal(d.write, true);
    assert.equal(d.reason, "confirmations_increased");
  });

  it("confirmationWriteNeeded writes status advance", () => {
    const d = confirmationWriteNeeded(
      { status: "verifying", confirmations: 19 },
      19,
      "completed",
    );
    assert.equal(d.write, true);
    assert.equal(d.reason, "status_advance");
  });

  it("applyMatchResult no-ops when already applied (fake db)", async () => {
    const queries = [];
    const db = {
      async query(sql, params) {
        queries.push({ sql, params });
        if (/SELECT id, status, tx_hash/i.test(sql)) {
          return {
            rows: [
              {
                id: "11111111-1111-1111-1111-111111111111",
                status: "verifying",
                tx_hash: "0xabc",
                received_amount: "10.00",
              },
            ],
          };
        }
        throw new Error(`unexpected query: ${sql}`);
      },
    };

    const out = await applyMatchResult(db, {
      result: {
        orderId: "11111111-1111-1111-1111-111111111111",
        status: "verifying",
      },
      transfer: { txHash: "0xabc", amount: "10.00", network: "tron" },
    });

    assert.equal(out.updated, 0);
    assert.equal(out.alreadyApplied, true);
    assert.equal(queries.length, 1);
  });

  it("applyConfirmationUpdate no-ops when already current (fake db)", async () => {
    const queries = [];
    const db = {
      async query(sql, params) {
        queries.push({ sql, params });
        if (/SELECT id, status, confirmations/i.test(sql)) {
          return {
            rows: [
              {
                id: "11111111-1111-1111-1111-111111111111",
                status: "verifying",
                confirmations: 5,
              },
            ],
          };
        }
        throw new Error(`unexpected query: ${sql}`);
      },
    };

    const out = await applyConfirmationUpdate(db, {
      orderId: "11111111-1111-1111-1111-111111111111",
      confirmations: 5,
      nextStatus: null,
    });

    assert.equal(out.updated, 0);
    assert.equal(out.alreadyCurrent, true);
    assert.equal(queries.length, 1);
  });
});
