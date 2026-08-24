import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("@cryptogate/web merchant M2-60", () => {
  it("has create-order route and matching labels", () => {
    const labels = readFileSync(
      join(root, "src/merchant/matchingLabels.ts"),
      "utf8",
    );
    assert.match(labels, /Standard/);
    assert.match(labels, /Amount fingerprint/);
    assert.match(labels, /Smart address/);
    const page = readFileSync(
      join(root, "src/merchant/CreateOrderPage.tsx"),
      "utf8",
    );
    assert.match(page, /GENERATE INVOICE/);
    assert.match(page, /createOrder/);
    assert.doesNotMatch(page, /Mark paid/i);
  });

  it("ignores pink animation sticky from Figma", () => {
    const app = readFileSync(join(root, "src/merchant/MerchantApp.tsx"), "utf8");
    assert.doesNotMatch(app, /Input focus glow/);
    assert.doesNotMatch(app, /ff5a6a.*sparkles/i);
  });
});

describe("@cryptogate/web merchant M2-61/62/63 settlement", () => {
  it("wires settlement route and org APIs", () => {
    const app = readFileSync(join(root, "src/merchant/MerchantApp.tsx"), "utf8");
    assert.match(app, /\/merchant\/settings\/settlement/);
    assert.match(app, /SettlementPage/);
    const page = readFileSync(
      join(root, "src/merchant/SettlementPage.tsx"),
      "utf8",
    );
    assert.match(page, /new orders only/i);
    assert.match(page, /putMatchingMode/);
    assert.match(page, /putSettlement/);
    assert.match(page, /putXpub/);
    assert.match(page, /listHdPool/);
    assert.match(page, /mfaCode|MFA/);
    assert.doesNotMatch(page, /private key|mnemonic/i);
  });

  it("exposes product matching labels on mode cards", () => {
    const labels = readFileSync(
      join(root, "src/merchant/matchingLabels.ts"),
      "utf8",
    );
    assert.match(labels, /MATCHING_MODE_CARDS/);
    assert.match(labels, /Memo tag/);
  });
});

describe("@cryptogate/web merchant D1-D3 orders shell", () => {
  it("wires dashboard, list, and detail routes", () => {
    const app = readFileSync(join(root, "src/merchant/MerchantApp.tsx"), "utf8");
    assert.match(app, /\/merchant\/orders/);
    assert.match(app, /DashboardPage/);
    assert.match(app, /OrdersListPage/);
    assert.match(app, /OrderDetailPage/);
    assert.match(app, /Navigate to="\/merchant"/);
  });

  it("lists and exports orders via API helpers", () => {
    const api = readFileSync(join(root, "src/merchant/api.ts"), "utf8");
    assert.match(api, /listOrders/);
    assert.match(api, /getOrder/);
    assert.match(api, /getOnChain/);
    assert.match(api, /ordersCsvUrl/);
  });

  it("uses canonical status labels and never Mark paid", () => {
    const status = readFileSync(
      join(root, "src/merchant/orderStatus.ts"),
      "utf8",
    );
    assert.match(status, /Pending Payment/);
    assert.match(status, /Payment Anomaly/);
    assert.doesNotMatch(status, /:\s*"Paid"/);
    const detail = readFileSync(
      join(root, "src/merchant/OrderDetailPage.tsx"),
      "utf8",
    );
    assert.doesNotMatch(detail, /<button[^>]*>[^<]*Mark paid/i);
    assert.match(detail, /anomaly-panel/);
  });
});

describe("@cryptogate/web merchant D17 cashier shell", () => {
  it("limits nav and guards owner-only routes for cashiers", () => {
    const shell = readFileSync(join(root, "src/merchant/MerchantShell.tsx"), "utf8");
    assert.match(shell, /CASHIER PORTAL/);
    assert.match(shell, /CASHIER TERMINAL/);
    assert.match(shell, /CASHIER_NAV/);
    assert.match(shell, /My Orders/);
    assert.match(shell, /Create Order/);
    assert.doesNotMatch(shell, /CASHIER_NAV[\s\S]*Service Bills/);

    const app = readFileSync(join(root, "src/merchant/MerchantApp.tsx"), "utf8");
    assert.match(app, /RequireOwnerPortal/);
    assert.match(app, /CashierForbiddenPage/);
    assert.match(app, /showCashierBanner/);

    const org = readFileSync(join(root, "src/merchant/org.ts"), "utf8");
    assert.match(org, /sessionIsCashierOnly/);
  });

  it("shows restricted banner without Figma pink sticky", () => {
    const banner = readFileSync(
      join(root, "src/merchant/CashierRestrictedBanner.tsx"),
      "utf8",
    );
    assert.match(banner, /Cashier/);
    assert.match(banner, /strictly restricted/);
    assert.doesNotMatch(banner, /sparkles|fade-in 400ms/i);
  });
});

describe("@cryptogate/web merchant D5-D6 service bills", () => {
  it("wires service bill list and detail routes", () => {
    const app = readFileSync(join(root, "src/merchant/MerchantApp.tsx"), "utf8");
    assert.match(app, /ServiceBillsListPage/);
    assert.match(app, /ServiceBillDetailPage/);
    assert.match(app, /\/merchant\/service-bills/);
  });

  it("uses separate service bill API and status labels", () => {
    const api = readFileSync(join(root, "src/merchant/api.ts"), "utf8");
    assert.match(api, /listServiceBills/);
    assert.match(api, /getServiceBillCheckout/);
    const labels = readFileSync(
      join(root, "src/merchant/serviceBillStatus.ts"),
      "utf8",
    );
    assert.match(labels, /overdue/);
    assert.doesNotMatch(labels, /pending_payment/);
    const list = readFileSync(
      join(root, "src/merchant/ServiceBillsListPage.tsx"),
      "utf8",
    );
    assert.match(list, /Customer payments go to your wallet[\s\S]*separately/);
    assert.match(list, /listServiceBills/);
    assert.doesNotMatch(list, /createOrder|listOrders/);
  });
});

describe("@cryptogate/web merchant D14 integrations", () => {
  it("wires integrations route and API helpers", () => {
    const app = readFileSync(join(root, "src/merchant/MerchantApp.tsx"), "utf8");
    assert.match(app, /IntegrationsPage/);
    assert.match(app, /\/merchant\/settings\/integrations/);
    const api = readFileSync(join(root, "src/merchant/api.ts"), "utf8");
    assert.match(api, /listApiKeys/);
    assert.match(api, /registerWebhook/);
    assert.match(api, /testWebhook/);
    assert.match(api, /listWebhookDeliveries/);
  });

  it("shows secrets once and blocks cashiers via owner portal", () => {
    const page = readFileSync(join(root, "src/merchant/IntegrationsPage.tsx"), "utf8");
    assert.match(page, /shown once/i);
    assert.match(page, /SecretOncePanel/);
    assert.match(page, /Cashiers cannot view/);
    const shell = readFileSync(join(root, "src/merchant/MerchantShell.tsx"), "utf8");
    assert.match(shell, /Integrations/);
  });
});

describe("@cryptogate/web merchant D10 reports", () => {
  it("wires reports route and CSV export helper", () => {
    const app = readFileSync(join(root, "src/merchant/MerchantApp.tsx"), "utf8");
    assert.match(app, /ReportsPage/);
    assert.match(app, /\/merchant\/reports/);
    const api = readFileSync(join(root, "src/merchant/api.ts"), "utf8");
    assert.match(api, /ordersCsvUrl\(opts\?/);
  });

  it("shows volume breakdown and separate from service bills", () => {
    const page = readFileSync(join(root, "src/merchant/ReportsPage.tsx"), "utf8");
    assert.match(page, /Completed volume|COMPLETED VOLUME/i);
    assert.match(page, /separate from service bills/i);
    assert.match(page, /matching_mode/);
    assert.match(page, /ordersCsvUrl/);
    assert.doesNotMatch(page, /Mark paid/i);
    assert.doesNotMatch(page, /listServiceBills/);
  });
});
