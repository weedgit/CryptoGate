import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OrderStatus } from "@paymentgate/domain";
import { isExpirablePending } from "../src/orders/order-expiry.mjs";
import { startOrderExpiryJob } from "../src/orders/order-expiry-job.mjs";

describe("order expiry rules", () => {
  it("expires only pending_payment past expires_at", () => {
    const now = Date.parse("2026-08-24T12:00:00.000Z");
    assert.equal(
      isExpirablePending(
        {
          status: OrderStatus.PendingPayment,
          expires_at: "2026-08-24T11:59:00.000Z",
        },
        now,
      ),
      true,
    );
    assert.equal(
      isExpirablePending(
        {
          status: OrderStatus.PendingPayment,
          expires_at: "2026-08-24T12:01:00.000Z",
        },
        now,
      ),
      false,
    );
    assert.equal(
      isExpirablePending(
        {
          status: OrderStatus.Verifying,
          expires_at: "2026-08-24T11:00:00.000Z",
        },
        now,
      ),
      false,
    );
    assert.equal(
      isExpirablePending(
        {
          status: OrderStatus.Expired,
          expires_at: "2026-08-24T11:00:00.000Z",
        },
        now,
      ),
      false,
    );
  });
});

describe("order expiry job", () => {
  it("can be disabled and stopped without running", async () => {
    let ran = 0;
    const job = startOrderExpiryJob({
      enabled: false,
      intervalMs: 10,
      run: async () => {
        ran += 1;
      },
    });
    job.stop();
    assert.equal(ran, 0);
  });

  it("runs once on start when enabled", async () => {
    let ran = 0;
    const job = startOrderExpiryJob({
      enabled: true,
      intervalMs: 60_000,
      run: async () => {
        ran += 1;
      },
    });
    await new Promise((r) => setTimeout(r, 20));
    job.stop();
    assert.equal(ran, 1);
  });
});
