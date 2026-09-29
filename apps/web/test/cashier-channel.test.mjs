import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  orderChannelFilterLabel,
  orderChannelLabel,
  parseOrderChannelFilter,
} from "../src/shared/orderChannel.ts";
import { channelRows } from "../src/merchant/dashboard/channelRows.ts";
import { receiptRows, receiptText } from "../src/merchant/cashier/cashierLogic.ts";
import { CASHIER_IDLE_TIMEOUT_MS, idleRemainingMs } from "../src/merchant/cashier/cashierIdle.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

describe("order channel", () => {
  it("labels channels and parses list filters", () => {
    assert.equal(orderChannelLabel("pos"), "POS");
    assert.equal(orderChannelLabel("web"), "Web");
    assert.equal(orderChannelLabel("api"), "API");
    assert.equal(orderChannelLabel(null), "Unknown");
    assert.equal(orderChannelFilterLabel(""), "All channels");
    assert.equal(parseOrderChannelFilter("POS"), "pos");
    assert.equal(parseOrderChannelFilter("unknown"), "unknown");
    assert.equal(parseOrderChannelFilter("kiosk"), "");
    assert.equal(parseOrderChannelFilter(null), "");
  });

  it("builds dashboard rows in a fixed order with shares", () => {
    const rows = channelRows([
      { channel: "web", count: 1, volumeUsd: 10 },
      { channel: null, count: 1, volumeUsd: 5 },
      { channel: "pos", count: 2, volumeUsd: 30 },
    ]);
    assert.deepEqual(
      rows.map((r) => [r.key, r.count, r.sharePct]),
      [
        ["pos", 2, 50],
        ["web", 1, 25],
        ["unknown", 1, 25],
      ],
    );
    assert.deepEqual(channelRows([{ channel: null, count: 4, volumeUsd: 1 }]), []);
    assert.deepEqual(channelRows(undefined), []);
  });

  it("sends the web channel header and shows channel in list, detail, and shift", () => {
    assert.match(read("src/merchant/api.ts"), /"X-PaymentGate-Client": "web"/);
    assert.match(read("src/shared/invoiceList/InvoiceRow.tsx"), /<OrderChannelTag via=\{order\.createdVia\}/);
    assert.match(read("src/merchant/orderDetail/OrderDetailTopbar.tsx"), /<OrderChannelTag via=\{order\.createdVia\}/);
    assert.match(read("src/merchant/cashier/ShiftPage.tsx"), /<OrderChannelTag via=\{o\.createdVia\}/);
    assert.match(read("src/shared/invoiceList/useInvoiceListData.ts"), /createdVia: channelFilter \|\| undefined/);
  });
});

describe("cashier web policy", () => {
  it("hides Charge and shows My shift with a note when POS-only", () => {
    const home = read("src/merchant/cashier/CashierHomePage.tsx");
    assert.match(home, /<ShiftPage session=\{session\} notice=\{POS_ONLY_NOTE\} \/>/);
    assert.match(read("src/merchant/cashier/cashierPosPolicy.ts"), /Charging is done in the POS app/);
    const shell = read("src/merchant/cashier/CashierShell.tsx");
    assert.match(shell, /webOrdersAllowed === false \? POS_ONLY_TABS : TABS/);
    const pad = read("src/merchant/cashier/PayPadPage.tsx");
    assert.match(pad, /cashier_web_orders_disabled/);
    assert.match(read("src/merchant/SettlementPage.tsx"), /<CashierChannelCard/);
  });
});

describe("cashier idle sign-out and receipt", () => {
  it("signs out after 15 minutes and holds while a payment is open", () => {
    assert.equal(CASHIER_IDLE_TIMEOUT_MS, 15 * 60_000);
    assert.equal(idleRemainingMs(0, CASHIER_IDLE_TIMEOUT_MS + 1), 0);
    assert.equal(idleRemainingMs(1_000, 61_000, 120_000), 60_000);
    assert.match(read("src/merchant/cashier/CashierShell.tsx"), /useIdleSignOut\(\{ enabled: !backTo, onTimeout: onSignOut \}\)/);
    assert.match(read("src/merchant/cashier/LivePaymentPage.tsx"), /live \? holdCashierIdle\(\) : undefined/);
  });

  it("builds receipt rows and share text", () => {
    const input = {
      merchantName: "Kevin Cafe",
      orderNumber: "1042",
      paidAt: "2026-09-28T10:00:00Z",
      invoiceAmount: "12.50",
      invoiceCurrency: "EUR",
      cryptoAmount: "13.61",
      asset: "USDT",
      networkLabel: "TRON",
      txHash: "0xabc",
      reference: "  table 4 ",
    };
    const labels = receiptRows(input).map((r) => r.label);
    assert.deepEqual(labels, ["Order", "Paid", "Amount", "Paid with", "Reference", "Transaction"]);
    const text = receiptText(input);
    assert.match(text, /^Kevin Cafe — receipt/);
    assert.match(text, /Amount: 12\.50 EUR/);
    assert.match(text, /Reference: table 4\n/);
    assert.deepEqual(
      receiptRows({ ...input, paidAt: null, invoiceAmount: null, txHash: null, reference: null }).map((r) => r.label),
      ["Order", "Paid with"],
    );
    const live = read("src/merchant/cashier/LivePaymentPage.tsx");
    assert.match(live, /Print receipt/);
    assert.match(live, /className="cashier-receipt"/);
  });
});
