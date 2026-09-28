import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatCryptoAmount,
  formatFundRate,
  invoiceConversion,
  invoiceFundRate,
} from "../src/shared/invoiceListModel.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

describe("invoice list — crypto amount with calculation and evidence", () => {
  it("formats crypto amounts with trimmed zeros and grouping", () => {
    assert.equal(formatCryptoAmount("10.000000"), "10.00");
    assert.equal(formatCryptoAmount("0.00123400"), "0.001234");
    assert.equal(formatCryptoAmount("12345.5"), "12,345.50");
    assert.equal(formatCryptoAmount("7"), "7.00");
    assert.equal(formatCryptoAmount(""), "—");
  });

  it("formats the fund rate in USD per asset unit", () => {
    assert.equal(formatFundRate("1"), "$1.00");
    assert.equal(formatFundRate("64250.123456"), "$64,250.1235");
    assert.equal(formatFundRate("0.2345678901"), "$0.234568");
    assert.equal(formatFundRate(null), null);
  });

  it("falls back to the effective rate when no rate was stored", () => {
    assert.equal(
      invoiceFundRate({ invoiceAmountUsd: "10.00", payableAmount: { amount: "10.000000" } }),
      "$1.00",
    );
    assert.equal(invoiceFundRate({ payableAmount: { amount: "5" } }), null);
  });

  it("explains a stored quote with source, market rate and lock time", () => {
    const c = invoiceConversion({
      asset: "ETH",
      pricingRate: "3100",
      marketRate: "3150",
      pricingMode: "market",
      rateSource: "binance",
      invoiceAmountUsd: "31.00",
      payableAmount: { amount: "0.01000000", currency: "ETH" },
    });
    assert.equal(c.cryptoLabel, "0.01");
    assert.equal(c.formula, "$31.00 ÷ $3,100.00");
    assert.equal(c.evidence.kind, "quote");
    assert.equal(c.evidence.label, "Quote · binance");
    assert.equal(c.evidence.detail[0], "$31.00 ÷ $3,100.00 per ETH = 0.01 ETH");
    assert.ok(c.evidence.detail.includes("Source: binance"));
    assert.ok(c.evidence.detail.includes("Market rate $3,150.00 at quote time"));
  });

  it("labels pegged and stablecoin orders, and marks derived rates", () => {
    const pegged = invoiceConversion({
      asset: "USDT",
      pricingRate: "1",
      pricingMode: "pegged_1to1",
      rateSource: "peg",
      invoiceAmountUsd: "10.00",
      payableAmount: { amount: "10.000000", currency: "USDT" },
    });
    assert.deepEqual([pegged.evidence.kind, pegged.evidence.label], ["peg", "Pegged 1:1"]);

    const legacyStable = invoiceConversion({
      asset: "USDC",
      invoiceAmountUsd: "25.00",
      payableAmount: { amount: "25.000000", currency: "USDC" },
    });
    assert.deepEqual([legacyStable.evidence.kind, legacyStable.evidence.label], ["peg", "Stablecoin 1:1"]);

    const derived = invoiceConversion({
      asset: "TRX",
      invoiceAmountUsd: "12.00",
      payableAmount: { amount: "50.000000", currency: "TRX" },
    });
    assert.deepEqual([derived.evidence.kind, derived.evidence.label], ["derived", "From invoice amount"]);
    assert.ok(derived.evidence.detail.includes("No rate quote stored for this order"));
  });

  it("short evidence meta per kind", () => {
    const base = { invoiceAmountUsd: "10.00", payableAmount: { amount: "10.000000", currency: "USDT" } };
    assert.equal(invoiceConversion({ asset: "USDT", ...base }).evidence.meta, "No quote stored");
    assert.equal(
      invoiceConversion({ asset: "TRX", invoiceAmountUsd: "12", payableAmount: { amount: "50" } }).evidence.meta,
      "USD ÷ crypto amount",
    );
    assert.equal(invoiceConversion({ asset: "USDT", ...base }).rateLabel, "$1.00");
  });

  it("Crypto amount, then Rate & evidence column; icons in Asset & Network", () => {
    const table = read("src/shared/invoiceList/InvoiceTable.tsx");
    const cols = ["Amount (USD)", "Crypto amount", "Rate &amp; evidence", "Asset &amp; Network"].map((l) =>
      table.indexOf(l),
    );
    assert.ok(cols.every((i, n) => i > 0 && (n === 0 || i > cols[n - 1])), `order ${cols}`);
    const row = read("src/shared/invoiceList/InvoiceRow.tsx");
    assert.match(row, /const conversion = invoiceConversion\(order\)/);
    const rateCell = row.split('className="invoice-list__rate"')[1].split("</td>")[0];
    assert.match(rateCell, /conversion\.rateLabel/);
    assert.match(rateCell, /<EvidenceChip evidence=\{conversion\.evidence\} \/>/);
    assert.match(rateCell, /conversion\.evidence\.meta/);
    assert.match(row, /<AssetIcon asset=\{order\.asset\} \/>/);
    assert.match(row, /<NetworkIcon network=\{order\.network\} \/>/);
    const chip = read("src/shared/invoiceList/EvidenceChip.tsx");
    assert.match(chip, /createPortal\(/);
  });
});
