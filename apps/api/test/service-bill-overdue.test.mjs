import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ServiceBillStatus } from "@cryptogate/domain";
import { startServiceBillOverdueJob } from "../src/service-bills/service-bill-overdue-job.mjs";

describe("service bill overdue job", () => {
  it("runs mark overdue on start and on interval", async () => {
    let calls = 0;
    const job = startServiceBillOverdueJob({
      intervalMs: 20,
      run: async () => {
        calls += 1;
      },
    });
    await new Promise((r) => setTimeout(r, 45));
    job.stop();
    assert.ok(calls >= 2);
  });

  it("respects SERVICE_BILL_OVERDUE_ENABLED=0", () => {
    const prev = process.env.SERVICE_BILL_OVERDUE_ENABLED;
    process.env.SERVICE_BILL_OVERDUE_ENABLED = "0";
    let calls = 0;
    const job = startServiceBillOverdueJob({
      run: async () => {
        calls += 1;
      },
    });
    assert.equal(calls, 0);
    job.stop();
    if (prev === undefined) delete process.env.SERVICE_BILL_OVERDUE_ENABLED;
    else process.env.SERVICE_BILL_OVERDUE_ENABLED = prev;
  });
});

describe("service bill overdue status", () => {
  it("uses domain enum values for issued → overdue", () => {
    assert.equal(ServiceBillStatus.Issued, "issued");
    assert.equal(ServiceBillStatus.Overdue, "overdue");
  });
});
