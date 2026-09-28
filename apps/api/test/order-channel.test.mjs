import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cashierWebOrderBlocked,
  resolveOrderChannel,
} from "../src/orders/order-rules.mjs";
import { parseListOrdersQuery } from "../src/orders/order-list-query.mjs";
import { ORDER_CSV_HEADERS, paymentOrderCsvFields } from "../src/orders/order-csv.mjs";
import { toPosSettings, validatePosSettingsBody } from "../src/pos-settings/pos-settings-routes.mjs";

describe("order channel", () => {
  it("API keys are always api; sessions declare web or pos", () => {
    assert.equal(resolveOrderChannel({ apiKey: true, clientHeader: "web" }), "api");
    assert.equal(resolveOrderChannel({ apiKey: false, clientHeader: "POS" }), "pos");
    assert.equal(resolveOrderChannel({ apiKey: false, clientHeader: [" web "] }), "web");
    assert.equal(resolveOrderChannel({ apiKey: false, clientHeader: "api" }), null);
    assert.equal(resolveOrderChannel({ apiKey: false, clientHeader: undefined }), null);
  });

  it("blocks only cashier web orders when the merchant disabled them", () => {
    const base = { role: "cashier", channel: "web", cashierWebOrders: false };
    assert.equal(cashierWebOrderBlocked(base), true);
    assert.equal(cashierWebOrderBlocked({ ...base, cashierWebOrders: true }), false);
    assert.equal(cashierWebOrderBlocked({ ...base, channel: "pos" }), false);
    assert.equal(cashierWebOrderBlocked({ ...base, channel: null }), false);
    assert.equal(cashierWebOrderBlocked({ ...base, role: "administrator" }), false);
  });

  it("filters the list by channel, including unknown", () => {
    const ok = parseListOrdersQuery(new URLSearchParams("createdVia=POS"), undefined);
    assert.equal(ok.ok, true);
    assert.equal(ok.createdVia, "pos");
    assert.equal(parseListOrdersQuery(new URLSearchParams("createdVia=unknown")).createdVia, "unknown");
    assert.equal(parseListOrdersQuery(new URLSearchParams("createdVia=kiosk")).ok, false);
    assert.equal(parseListOrdersQuery(new URLSearchParams("")).createdVia, null);
  });

  it("exports the channel in CSV", () => {
    assert.equal(ORDER_CSV_HEADERS.at(-1), "created_via");
    const fields = paymentOrderCsvFields({ id: "x", created_via: "pos" });
    assert.equal(fields.at(-2), "pos");
    assert.equal(paymentOrderCsvFields({ id: "x" }).at(-2), "");
  });

  it("POS settings default to allowing cashier web orders", () => {
    assert.equal(toPosSettings(null, "org-1").cashierWebOrders, true);
    assert.equal(
      toPosSettings({ org_id: "m", cashier_web_orders: false }, "site-1", {
        source: "inherit",
        orgId: "m",
        parentOrgId: "m",
      }).cashierWebOrders,
      false,
    );
    assert.equal(validatePosSettingsBody({ cashierWebOrders: "no" }).ok, false);
    assert.equal(validatePosSettingsBody({ cashierWebOrders: false }).ok, true);
  });
});
