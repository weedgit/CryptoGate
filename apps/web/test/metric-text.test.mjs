import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatMetricText, parseMetricText } from "../src/shared/metricText.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (p) => readFileSync(join(root, "src", p), "utf8");

describe("animated KPI figures", () => {
  it("keeps prefix, suffix, decimals and grouping while counting", () => {
    const money = parseMetricText("$12,345.60");
    assert.equal(money.value, 12345.6);
    assert.equal(formatMetricText(money, 0), "$0.00");
    assert.equal(formatMetricText(money, 1234.5), "$1,234.50");

    const code = parseMetricText("840.00 USD");
    assert.equal(formatMetricText(code, 12), "12.00 USD");

    const count = parseMetricText("1,204");
    assert.equal(formatMetricText(count, 999.6), "1,000");
  });

  it("leaves words and placeholders alone", () => {
    assert.equal(parseMetricText("—"), null);
    assert.equal(parseMetricText("Enterprise"), null);
    assert.equal(parseMetricText("…"), null);
  });

  it("animates every KPI card family", () => {
    assert.match(src("platform/ui/DashKpiCard.tsx"), /animateCardValue\(value\)/);
    assert.match(src("platform/ServiceBillsListPage.tsx"), /animateCardValue\(value\)/);
    assert.match(src("merchant/ServiceBillsListPage.tsx"), /animateCardValue\(value\)/);
    for (const p of [
      "platform/SiteDetailCard.tsx",
      "platform/MerchantDetailCard.tsx",
      "platform/AgentDetailCard.tsx",
      "agent/MerchantDetailCard.tsx",
    ]) {
      assert.match(src(p), /b3-card__value[^"]*">\s*<FundAmount animate/, p);
    }
  });
});
