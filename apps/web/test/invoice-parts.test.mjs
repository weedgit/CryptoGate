import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

describe("invoice faces share the platform fee layout", () => {
  it("both faces compose the shared invoice parts", () => {
    for (const file of [
      "src/billing/ServiceBillInvoiceFace.tsx",
      "src/commercial/CommissionInvoiceFace.tsx",
    ]) {
      const src = read(file);
      for (const part of [
        "InvoicePaper",
        "InvoiceBrandHead",
        "InvoicePartyFacts",
        "InvoiceLines",
        "InvoiceTotals",
        "InvoicePayCard",
        "InvoiceReceipt",
        "InvoiceZonedDate",
      ]) {
        assert.match(src, new RegExp(`<${part}\\b`), `${file} uses ${part}`);
      }
    }
  });

  it("commission invoice names the agent as payee and explains the total", () => {
    const face = read("src/commercial/CommissionInvoiceFace.tsx");
    assert.match(face, /title="Payee"/);
    assert.doesNotMatch(face, /Bill to/);
    assert.match(face, /label: "Issue date"/);
    assert.match(face, /label: "Currency"/);
    assert.match(face, /columns=\{\["Description", "Fee base", "Rate", "Amount"\]\}/);
    assert.match(face, /line\.subscriptionAmount[\s\S]*line\.volumeFeeAmount/);
    assert.match(face, /\(1:1\)/);
    assert.doesNotMatch(face, /FundAmount/);
  });

  it("payment order invoice uses the parts and the bill detail layout", () => {
    const face = read("src/billing/PaymentOrderInvoiceFace.tsx");
    for (const part of [
      "InvoicePaper",
      "InvoiceBrandHead",
      "InvoicePartyFacts",
      "InvoiceLines",
      "InvoiceTotals",
      "InvoicePayCard",
      "InvoiceReceipt",
      "InvoiceClosed",
    ]) {
      assert.match(face, new RegExp(`<${part}\\b`), `payment order face uses ${part}`);
    }
    assert.match(face, /title="Bill to"/);
    assert.match(face, /maximumFractionDigits|invoiceCryptoPlain/);
    const page = read("src/merchant/OrderDetailPage.tsx");
    assert.match(page, /plat-bill-detail__split plat-bill-detail__split--invoice/);
    assert.match(page, /plat-bill-detail__side/);
    assert.doesNotMatch(page, /createPortal|platform-topbar-center/);
    const head = read("src/merchant/orderDetail/OrderDetailHeader.tsx");
    assert.match(head, /plat-bill-detail__head/);
    assert.match(head, /<InvoicePrintButton/);
    assert.match(read("src/merchant/orderDetail/OrderTimelineCard.tsx"), /<StateTimelineCard/);
  });

  it("issue dates carry the viewer time zone", () => {
    const parts = read("src/billing/invoiceParts.tsx");
    assert.match(parts, /\$\{invoiceShortDate\(iso, tz\)\} \(\$\{zoneAbbrev\(tz, at\)\}\)/);
  });
});
