import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  sumCommissionDashboardKpis,
  commissionMonthKeys,
} from "../src/commercial/commissionDashboardKpis.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("@paymentgate/web dashboard commission KPIs", () => {
  it("sums issued vs paid/settled within month keys only", () => {
    const keys = new Set(["2026-08", "2026-09"]);
    const result = sumCommissionDashboardKpis(
      [
        {
          periodKey: "2026-09",
          commissionAmount: 10.555,
          payoutStatus: "issued",
        },
        {
          periodKey: "2026-09",
          commissionAmount: 20,
          payoutStatus: "paid",
        },
        {
          periodKey: "2026-08",
          commissionAmount: 5,
          payoutStatus: "settled",
        },
        {
          periodKey: "2026-07",
          commissionAmount: 99,
          payoutStatus: "issued",
        },
      ],
      keys,
    );
    assert.equal(result.commissionOwed, 10.56);
    assert.equal(result.commissionPaid, 25);
  });

  it("commissionMonthKeys spans inclusive months", () => {
    const keys = commissionMonthKeys(
      new Date(2026, 7, 15),
      new Date(2026, 9, 2),
    );
    assert.deepEqual([...keys], ["2026-08", "2026-09", "2026-10"]);
  });

  it("dashboard loads KPIs via status-scoped full walk helper", () => {
    const page = readFileSync(
      join(root, "src/platform/DashboardPage.tsx"),
      "utf8",
    );
    assert.match(page, /fetchPlatformCommissionDashboardKpis/);
    assert.doesNotMatch(
      page,
      /listCommissionPayouts\(\{\s*payer: "platform",\s*limit: 500/,
    );
    const agent = readFileSync(
      join(root, "src/agent/DashboardPage.tsx"),
      "utf8",
    );
    assert.match(agent, /fetchAgentCommissionDashboardKpis/);
    assert.doesNotMatch(agent, /commissionHistoryFromBills/);
    assert.match(agent, /needCommissions/);
    const client = readFileSync(
      join(root, "src/commercial/commissionPayoutRecords.ts"),
      "utf8",
    );
    assert.match(client, /listAllCommissionPayouts/);
    assert.match(client, /fetchAgentCommissionDashboardKpis/);
    assert.match(client, /status: "issued"/);
    assert.match(client, /status: \["paid", "settled"\]/);
    const billsList = readFileSync(
      join(root, "src/agent/agentServiceBillsList.ts"),
      "utf8",
    );
    assert.match(billsList, /limit: SERVICE_BILLS_LIST_LIMIT/);
    assert.match(
      readFileSync(join(root, "src/agent/api.ts"), "utf8"),
      /SERVICE_BILLS_LIST_LIMIT = 5000/,
    );
  });
});
