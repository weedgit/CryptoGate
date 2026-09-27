import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  periodToDateInputs,
  periodToRange,
} from "../src/shared/invoiceListModel.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("@paymentgate/web invoice list filters", () => {
  it("always renders From and To (not Custom-only)", () => {
    const page = readFileSync(
      join(root, "src/shared/InvoiceListPage.tsx"),
      "utf8",
    );
    assert.match(page, /aria-label="From date"/);
    assert.match(page, /aria-label="To date"/);
    assert.match(page, /invoice-list__date-wrap/);
    // Must not gate the date fields on period === "custom"
    assert.doesNotMatch(
      page,
      /period\s*===\s*["']custom["']\s*\?[\s\S]{0,200}From/,
    );
  });

  it("named periods fill From/To date inputs", () => {
    const today = periodToDateInputs("today");
    assert.ok(today.from);
    assert.ok(today.to);
    assert.equal(today.from, today.to);

    const week = periodToDateInputs("7d");
    assert.ok(week.from);
    assert.ok(week.to);
    assert.ok(week.from <= week.to);

    assert.deepEqual(periodToDateInputs("all"), { from: "", to: "" });
    assert.deepEqual(periodToDateInputs("custom"), { from: "", to: "" });
  });

  it("custom period uses From/To for range", () => {
    const range = periodToRange("custom", "2026-09-01", "2026-09-30");
    assert.ok(range.createdFrom);
    assert.ok(range.createdTo);
    assert.ok(new Date(range.createdFrom).getTime() < new Date(range.createdTo).getTime());
  });
});
