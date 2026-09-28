import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  addMonthsYmd,
  formatDocumentDateTime,
  getViewerTimeZone,
  setViewerTimeZone,
  zoneAbbrev,
  zonedEndOfDay,
  zonedStartOfDay,
  zonedYmd,
} from "../src/shared/dateTime.ts";
import { periodWindow, buildDayKeys } from "../src/shared/dashboardPeriod.ts";
import { periodToRange } from "../src/shared/invoiceListModel.ts";
import { timeZonePrompt, mismatchPairKey } from "../src/auth/timeZonePrompt.ts";
import {
  businessTimezoneField,
  effectiveBusinessTimezone,
} from "../src/shared/businessTimezone.ts";
import { receiptRows } from "../src/merchant/cashier/cashierLogic.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

describe("viewer time zone", () => {
  it("computes day bounds in a zone, including DST and half-hour offsets", () => {
    assert.equal(zonedStartOfDay("2026-09-28", "Asia/Seoul").toISOString(), "2026-09-27T15:00:00.000Z");
    assert.equal(zonedEndOfDay("2026-09-28", "Asia/Seoul").toISOString(), "2026-09-28T14:59:59.999Z");
    assert.equal(zonedStartOfDay("2026-03-08", "America/New_York").toISOString(), "2026-03-08T05:00:00.000Z");
    assert.equal(zonedEndOfDay("2026-03-08", "America/New_York").toISOString(), "2026-03-09T03:59:59.999Z");
    assert.equal(zonedStartOfDay("2026-09-28", "Asia/Kolkata").toISOString(), "2026-09-27T18:30:00.000Z");
    assert.equal(zonedYmd(new Date("2026-09-28T16:00:00Z"), "Asia/Seoul"), "2026-09-29");
    assert.equal(addMonthsYmd("2026-05-31", -3), "2026-02-28");
    assert.equal(zoneAbbrev("UTC"), "UTC");
  });

  it("ignores an unconfirmed profile zone (the UTC default)", () => {
    setViewerTimeZone("Asia/Seoul", true);
    assert.equal(getViewerTimeZone(), "Asia/Seoul");
    setViewerTimeZone("UTC", false);
    assert.notEqual(getViewerTimeZone(), "Asia/Seoul");
    assert.equal(getViewerTimeZone(), Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  });

  it("dashboard periods and order filters follow the viewer zone", () => {
    setViewerTimeZone("Pacific/Kiritimati", true);
    const today = zonedYmd();
    const mtd = periodWindow("mtd");
    assert.equal(mtd.from.toISOString(), zonedStartOfDay(`${today.slice(0, 8)}01`).toISOString());
    assert.equal(zonedYmd(mtd.to), today);
    assert.deepEqual(buildDayKeys(periodWindow("today").from, periodWindow("today").to), [today]);
    const custom = periodToRange("custom", "2026-09-01", "2026-09-30");
    assert.equal(custom.createdFrom, "2026-08-31T10:00:00.000Z");
    assert.equal(custom.createdTo, "2026-09-30T09:59:59.999Z");
    const utc = periodToRange("custom", "2026-09-01", "2026-09-30", true);
    assert.equal(utc.createdFrom, "2026-09-01T00:00:00.000Z");
    setViewerTimeZone(null);
  });

  it("asks unconfirmed users to confirm, and hints once per mismatched pair", () => {
    assert.deepEqual(
      timeZonePrompt({ profileTimeZone: "UTC", confirmed: false, deviceTimeZone: "Asia/Seoul" }),
      { kind: "confirm", detected: "Asia/Seoul" },
    );
    assert.equal(
      timeZonePrompt({ profileTimeZone: "Asia/Seoul", confirmed: true, deviceTimeZone: "Asia/Tokyo" }),
      null,
      "same UTC offset is not a mismatch",
    );
    const hint = timeZonePrompt({
      profileTimeZone: "Asia/Seoul",
      confirmed: true,
      deviceTimeZone: "Europe/London",
    });
    assert.equal(hint?.kind, "mismatch");
    assert.equal(
      timeZonePrompt({
        profileTimeZone: "Asia/Seoul",
        confirmed: true,
        deviceTimeZone: "Europe/London",
        dismissedPair: mismatchPairKey("Europe/London", "Asia/Seoul"),
      }),
      null,
    );
  });

  it("sites inherit the merchant business zone for customer documents", () => {
    const merchant = { id: "m", type: "merchant", name: "Kevin Co", parentId: "a", businessTimezone: "Asia/Seoul" };
    const site = { id: "s", type: "merchant_site", name: "Store", parentId: "m", businessTimezone: null };
    assert.equal(effectiveBusinessTimezone(site, [merchant, site]), "Asia/Seoul");
    assert.match(businessTimezoneField(site, [merchant])?.inheritLabel ?? "", /Same as Kevin Co · Asia\/Seoul/);
    assert.equal(businessTimezoneField({ ...merchant, type: "agent" }, []), null);
    assert.match(formatDocumentDateTime("2026-09-28T05:00:00Z", "Asia/Seoul"), /2:00\s?PM GMT\+9$/);
    const rows = receiptRows({
      merchantName: "Kevin Co",
      orderNumber: "1",
      paidAt: "2026-09-28T05:00:00Z",
      invoiceAmount: "10",
      invoiceCurrency: "USD",
      cryptoAmount: "10",
      asset: "USDT",
      networkLabel: "TRON",
      txHash: null,
      reference: null,
      timeZone: "Asia/Seoul",
    });
    assert.match(rows.find((r) => r.label === "Paid")?.value ?? "", /GMT\+9$/);
  });

  it("wires the zone into shells, dashboards, lists and exports", () => {
    assert.match(read("src/auth/usePortalBoot.ts"), /setViewerTimeZone\(session\?\.timezone, session\?\.timezoneConfirmed === true\)/);
    for (const shell of ["agent/AgentShell.tsx", "platform/PlatformShell.tsx", "merchant/MerchantShell.tsx", "merchant/cashier/CashierShell.tsx"]) {
      assert.doesNotMatch(read(`src/${shell}`), /setViewerTimeZone/, shell);
    }
    assert.match(read("src/auth/SidebarProfileMenu.tsx"), /<TimeZonePromptCard/);
    assert.match(read("src/platform/ui/DashHero.tsx"), /pg-dash__period-zone/);
    assert.match(read("src/shared/invoiceList/InvoiceFiltersPanel.tsx"), /From \(\{zoneTag\}\)/);
    assert.match(read("src/merchant/api.ts"), /q\.set\("tz", getViewerTimeZone\(\)\)/);
    assert.match(read("src/shared/auditServer.ts"), /tz: getViewerTimeZone\(\)/);
    assert.match(read("src/shared/dashboardApi.ts"), /return getViewerTimeZone\(\);/);
  });
});
