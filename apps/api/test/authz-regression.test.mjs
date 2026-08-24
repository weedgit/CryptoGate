/**
 * M4-10 — Authorization regression suite.
 * Roles, Cashier denials, agent bars, cross-merchant isolation.
 * Keep this matrix green when changing role-policy or route guards.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canChangeMatchingModeSettings,
  canChangeSettlementSettings,
  canChangeXpubSettings,
  canCheckoutServiceBill,
  canCreatePaymentOrder,
  canEnrollMfa,
  canExportPaymentOrders,
  canIssueServiceBill,
  canManageWebhooks,
  canReadPaymentOrder,
  canViewMatchingModeSettings,
  canViewServiceBill,
  canViewSettlementSettings,
  canViewWebhooks,
  canViewXpubSettings,
  paymentOrderListScope,
  resolveApiKeyOrgId,
  resolveOrderOrgId,
  resolveWebhookOrgId,
  serviceBillListScope,
} from "../src/orgs/role-policy.mjs";

const merchantA = { id: "m-a", type: "merchant" };
const merchantB = { id: "m-b", type: "merchant" };

const ownerA = {
  orgId: "m-a",
  userId: "u-owner-a",
  role: "owner",
  orgType: "merchant",
};
const adminA = {
  orgId: "m-a",
  userId: "u-admin-a",
  role: "administrator",
  orgType: "merchant",
};
const viewerA = {
  orgId: "m-a",
  userId: "u-viewer-a",
  role: "viewer",
  orgType: "merchant",
};
const cashierA = {
  orgId: "m-a",
  userId: "u-cashier-a",
  role: "cashier",
  orgType: "merchant",
};
const ownerB = {
  orgId: "m-b",
  userId: "u-owner-b",
  role: "owner",
  orgType: "merchant",
};
const agentOwner = {
  orgId: "a1",
  userId: "u-agent",
  role: "owner",
  orgType: "agent",
};
const platformOwner = {
  orgId: "p1",
  userId: "u-plat",
  role: "owner",
  orgType: "platform",
};

const orderAByCashier = { orgId: "m-a", createdBy: "u-cashier-a" };
const orderAByOwner = { orgId: "m-a", createdBy: "u-owner-a" };
const orderB = { orgId: "m-b", createdBy: "u-owner-b" };

function caller(memberships, extras = {}) {
  return {
    userId: memberships[0]?.userId ?? "u",
    platformOperator: false,
    platformOwner: false,
    memberships,
    ...extras,
  };
}

describe("M4-10 authz regression — Cashier denials", () => {
  const c = caller([cashierA]);

  it("forbids settlement / matching / xPub / API-key surfaces and CSV export", () => {
    assert.equal(canChangeSettlementSettings(c, merchantA), false);
    assert.equal(canViewSettlementSettings(c, merchantA), false);
    assert.equal(canChangeMatchingModeSettings(c, merchantA), false);
    assert.equal(canViewMatchingModeSettings(c, merchantA), false);
    assert.equal(canChangeXpubSettings(c, merchantA), false);
    assert.equal(canViewXpubSettings(c, merchantA), false);
    assert.equal(canManageWebhooks(c, merchantA), false);
    assert.equal(canViewWebhooks(c, merchantA), false);
    assert.equal(canExportPaymentOrders(c), false);
    assert.equal(resolveWebhookOrgId(c.memberships, null, "manage").status, 403);
  });

  it("forbids service-bill list/issue/checkout/view", () => {
    assert.equal(canIssueServiceBill(c), false);
    assert.equal(serviceBillListScope(c).kind, "none");
    assert.equal(canCheckoutServiceBill(c, merchantA), false);
    assert.equal(canViewServiceBill(c, merchantA), false);
  });

  it("may create and read own payment orders only", () => {
    assert.equal(canCreatePaymentOrder(c.memberships, "m-a"), true);
    assert.equal(canReadPaymentOrder(c, orderAByCashier), true);
    assert.equal(canReadPaymentOrder(c, orderAByOwner), false);
    assert.equal(canEnrollMfa(c.memberships), false);
  });
});

describe("M4-10 authz regression — agent bars", () => {
  const a = caller([agentOwner]);

  it("cannot create or list merchant payment orders", () => {
    assert.equal(canCreatePaymentOrder(a.memberships, "m-a"), false);
    assert.equal(resolveOrderOrgId(a.memberships, null).status, 403);
    assert.equal(paymentOrderListScope(a).kind, "none");
    assert.equal(canReadPaymentOrder(a, orderAByOwner), false);
    assert.equal(canExportPaymentOrders(a), false);
  });

  it("cannot manage merchant webhooks/API keys or change settlement", () => {
    assert.equal(canManageWebhooks(a, merchantA), false);
    assert.equal(canChangeSettlementSettings(a, merchantA), false);
    assert.equal(resolveWebhookOrgId(a.memberships, null, "manage").status, 403);
    assert.equal(resolveApiKeyOrgId(a.memberships, null, "manage").status, 403);
    assert.equal(
      resolveWebhookOrgId(a.memberships, null, "manage").message.includes(
        "Agent",
      ),
      true,
    );
  });

  it("may view settlement when subtree-visible and list service bills", () => {
    assert.equal(canViewSettlementSettings(a, merchantA), true);
    assert.equal(canIssueServiceBill(a), false);
    assert.deepEqual(serviceBillListScope(a), {
      kind: "scoped",
      rootIds: ["a1"],
    });
    assert.equal(canCheckoutServiceBill(a, merchantA), false);
  });
});

describe("M4-10 authz regression — cross-merchant isolation", () => {
  it("merchant A owner cannot read merchant B orders", () => {
    const a = caller([ownerA]);
    assert.equal(canReadPaymentOrder(a, orderAByOwner), true);
    assert.equal(canReadPaymentOrder(a, orderB), false);
    assert.equal(canCreatePaymentOrder(a.memberships, "m-b"), false);
    assert.equal(
      canChangeSettlementSettings(a, merchantB),
      false,
    );
    assert.equal(canViewServiceBill(a, merchantB), false);
  });

  it("merchant B owner cannot act on merchant A settings", () => {
    const b = caller([ownerB]);
    assert.equal(canManageWebhooks(b, merchantA), false);
    assert.equal(canCheckoutServiceBill(b, merchantA), false);
    assert.equal(canReadPaymentOrder(b, orderAByCashier), false);
  });
});

describe("M4-10 authz regression — Owner / Admin / Viewer", () => {
  it("Owner and Admin may change privileged settings; Viewer may not", () => {
    assert.equal(
      canChangeSettlementSettings(caller([ownerA]), merchantA),
      true,
    );
    assert.equal(
      canChangeSettlementSettings(caller([adminA]), merchantA),
      true,
    );
    assert.equal(
      canChangeSettlementSettings(caller([viewerA]), merchantA),
      false,
    );
    assert.equal(canViewSettlementSettings(caller([viewerA]), merchantA), true);
    assert.equal(canManageWebhooks(caller([viewerA]), merchantA), false);
    assert.equal(canViewWebhooks(caller([viewerA]), merchantA), true);
  });

  it("Viewer cannot create orders; Owner/Admin/Cashier can", () => {
    assert.equal(canCreatePaymentOrder([viewerA], "m-a"), false);
    assert.equal(canCreatePaymentOrder([ownerA], "m-a"), true);
    assert.equal(canCreatePaymentOrder([adminA], "m-a"), true);
    assert.equal(canCreatePaymentOrder([cashierA], "m-a"), true);
  });

  it("Owner/Admin checkout service bills; Viewer cannot", () => {
    assert.equal(canCheckoutServiceBill(caller([ownerA]), merchantA), true);
    assert.equal(canCheckoutServiceBill(caller([viewerA]), merchantA), false);
    assert.equal(canViewServiceBill(caller([viewerA]), merchantA), true);
  });
});

describe("M4-10 authz regression — platform operator", () => {
  const p = caller([platformOwner], {
    platformOperator: true,
    platformOwner: true,
  });

  it("may issue bills, change merchant settings, and read any order", () => {
    assert.equal(canIssueServiceBill(p), true);
    assert.equal(canChangeSettlementSettings(p, merchantA), true);
    assert.equal(canManageWebhooks(p, merchantA), true);
    assert.equal(canReadPaymentOrder(p, orderB), true);
    assert.equal(paymentOrderListScope(p).kind, "all");
    assert.equal(serviceBillListScope(p).kind, "all");
  });

  it("still cannot create merchant payment orders via agent/platform membership alone", () => {
    assert.equal(canCreatePaymentOrder(p.memberships, "m-a"), false);
  });
});
