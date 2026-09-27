import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ORDER_DELETE_DAYS, OrderStatus } from "@paymentgate/domain";
import {
  clampOrderDeleteDays,
  PURGEABLE_ORDER_STATUSES,
} from "../src/retention/order-retention-purge.mjs";
import { startOrderRetentionPurgeJob } from "../src/retention/order-retention-purge-job.mjs";
import {
  clampAuditHotRetentionDays,
  DEFAULT_AUDIT_HOT_RETENTION_DAYS,
} from "../src/retention/audit-archive.mjs";
import { startAuditArchiveJob } from "../src/retention/audit-archive-job.mjs";

describe("order retention purge rules", () => {
  it("defaults and clamps delete days", () => {
    assert.equal(DEFAULT_ORDER_DELETE_DAYS, 90);
    assert.equal(clampOrderDeleteDays(Number.NaN), 90);
    assert.equal(clampOrderDeleteDays(3), 7);
    assert.equal(clampOrderDeleteDays(9000), 3650);
    assert.equal(clampOrderDeleteDays(180.9), 180);
  });

  it("only terminal statuses are purgeable", () => {
    assert.ok(PURGEABLE_ORDER_STATUSES.includes(OrderStatus.Completed));
    assert.ok(PURGEABLE_ORDER_STATUSES.includes(OrderStatus.Expired));
    assert.ok(PURGEABLE_ORDER_STATUSES.includes(OrderStatus.Failed));
    assert.ok(PURGEABLE_ORDER_STATUSES.includes(OrderStatus.Cancelled));
    assert.equal(
      PURGEABLE_ORDER_STATUSES.includes(OrderStatus.PendingPayment),
      false,
    );
    assert.equal(
      PURGEABLE_ORDER_STATUSES.includes(OrderStatus.PaymentAnomaly),
      false,
    );
    assert.equal(
      PURGEABLE_ORDER_STATUSES.includes(OrderStatus.Verifying),
      false,
    );
  });
});

describe("order retention purge job", () => {
  it("can be disabled without running", async () => {
    let ran = 0;
    const job = startOrderRetentionPurgeJob({
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
    const job = startOrderRetentionPurgeJob({
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

describe("audit archive rules", () => {
  it("defaults and clamps hot retention days", () => {
    assert.equal(DEFAULT_AUDIT_HOT_RETENTION_DAYS, 180);
    assert.equal(clampAuditHotRetentionDays(Number.NaN), 180);
    assert.equal(clampAuditHotRetentionDays(7), 30);
    assert.equal(clampAuditHotRetentionDays(9000), 3650);
    assert.equal(clampAuditHotRetentionDays(90.2), 90);
  });
});

describe("audit archive job", () => {
  it("can be disabled without running", async () => {
    let ran = 0;
    const job = startAuditArchiveJob({
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
    const job = startAuditArchiveJob({
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
