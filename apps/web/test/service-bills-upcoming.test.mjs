import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

describe("service bills — upcoming", () => {
  it("client calls the upcoming endpoint with the review scope", () => {
    const api = read("src/shared/serviceBillsServer.ts");
    assert.match(api, /"\/service-bills\/upcoming"/);
    assert.match(api, /export async function listUpcomingServiceBills/);
    assert.match(api, /invalidateServerJson\("\/service-bills"\)/);
  });

  it("status rail has an Upcoming view that swaps the table", () => {
    const page = read("src/platform/ServiceBillsListPage.tsx");
    assert.match(page, /Forecast/);
    assert.match(page, /onClick=\{\(\) => setView\("upcoming"\)\}/);
    assert.match(page, /statusFilter=\{view === "bills" \? statusFilter : null\}/);
    assert.match(page, /<UpcomingBillsTable/);
    assert.match(page, /set\("view", view === "upcoming" \? "upcoming" : null\)/);
    assert.match(page, /listUpcomingServiceBills\(upcomingParams\)/);
  });

  it("agent period pills use MTD instead of 1m, and open on MTD", () => {
    const page = read("src/platform/ServiceBillsListPage.tsx");
    const agentOpts = page.split("const AGENT_PERIOD_OPTIONS")[1].split("];")[0];
    assert.match(agentOpts, /\{ id: "mtd", label: "MTD" \}/);
    assert.doesNotMatch(agentOpts, /"1m"/);
    assert.match(page, /const defaultPeriod: PeriodId = isAgentPortal \? "mtd" : "1m"/);
    assert.match(page, /id === "mtd"\) \{\s*from = new Date\(Date\.UTC\(now\.getUTCFullYear\(\), now\.getUTCMonth\(\), 1\)\)/);
    const api = read("src/shared/serviceBillsServer.ts");
    assert.match(api, /const mode = portal === "agent" \? "mtd" : "1m"/);
  });

  it("upcoming table labels estimates, missed dates and waivers", () => {
    const table = read("src/platform/ui/UpcomingBillsTable.tsx");
    for (const label of ["Estimated amount", "Volume so far", "Bill date", "Overdue to issue", "Will be waived", "Upcoming"]) {
      assert.ok(table.includes(label), label);
    }
    assert.match(table, /<th title="Estimates on volume so far/);
    assert.doesNotMatch(table, /plat-bills__upcoming-note/);
  });
});
