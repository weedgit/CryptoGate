import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canBootstrapPlatform,
  canChangeSettlementSettings,
  canCreateOrgUnderParent,
  canCreatePaymentOrder,
  canEnrollMfa,
  resolveOrderOrgId,
  canReadPaymentOrder,
  canCancelPaymentOrder,
  canResolvePaymentAnomaly,
  canExportPaymentOrders,
  paymentOrderListScope,
  canViewSettlementSettings,
  canChangeMatchingModeSettings,
  canViewMatchingModeSettings,
  canRequestSiteOverride,
  canDecideSiteOverride,
  canDeleteMerchantSite,
  canManageDirectChildOrg,
  canUpdateMerchantCommercial,
} from "../src/orgs/role-policy.mjs";

const merchantCashier = {
  orgId: "m1",
  userId: "u1",
  role: "cashier",
  orgType: "merchant",
};

const merchantOwner = {
  orgId: "m1",
  userId: "u2",
  role: "owner",
  orgType: "merchant",
};

const merchantViewer = {
  orgId: "m1",
  userId: "u3",
  role: "viewer",
  orgType: "merchant",
};

const agentOwner = {
  orgId: "a1",
  userId: "u4",
  role: "owner",
  orgType: "agent",
};

const platformOwner = {
  orgId: "p1",
  userId: "u5",
  role: "owner",
  orgType: "platform",
};

describe("role policy", () => {
  it("allows MFA enroll for Owner and Administrator only", () => {
    assert.equal(canEnrollMfa([merchantOwner]), true);
    assert.equal(
      canEnrollMfa([{ ...merchantOwner, role: "administrator" }]),
      true,
    );
    assert.equal(canEnrollMfa([merchantCashier]), false);
    assert.equal(canEnrollMfa([merchantViewer]), false);
    assert.equal(canEnrollMfa([merchantCashier, merchantOwner]), true);
  });

  it("lets Owner/Admin create child orgs; Cashier and Viewer cannot", () => {
    assert.equal(
      canCreateOrgUnderParent({ platformOperator: false }, "owner"),
      true,
    );
    assert.equal(
      canCreateOrgUnderParent({ platformOperator: false }, "administrator"),
      true,
    );
    assert.equal(
      canCreateOrgUnderParent({ platformOperator: false }, "cashier"),
      false,
    );
    assert.equal(
      canCreateOrgUnderParent({ platformOperator: false }, "viewer"),
      false,
    );
    assert.equal(
      canCreateOrgUnderParent({ platformOperator: true }, "cashier"),
      true,
    );
  });

  it("blocks cashiers from bootstrapping the platform org", () => {
    assert.equal(canBootstrapPlatform({ memberships: [] }), true);
    assert.equal(canBootstrapPlatform({ memberships: [merchantOwner] }), true);
    assert.equal(canBootstrapPlatform({ memberships: [merchantCashier] }), false);
    assert.equal(canBootstrapPlatform({ memberships: [merchantViewer] }), false);
  });

  it("forbids agent accounts from creating merchant payment orders", () => {
    assert.equal(canCreatePaymentOrder([merchantCashier], "m1"), true);
    assert.equal(canCreatePaymentOrder([merchantOwner], "m1"), true);
    assert.equal(canCreatePaymentOrder([merchantViewer], "m1"), false);
    assert.equal(canCreatePaymentOrder([agentOwner], "m1"), false);
    assert.equal(canCreatePaymentOrder([agentOwner], "a1"), false);
    assert.equal(canCreatePaymentOrder([platformOwner], "m1"), false);
  });

  it("resolves a single merchant membership or requires orgId", () => {
    assert.deepEqual(resolveOrderOrgId([merchantCashier], null), {
      ok: true,
      orgId: "m1",
    });
    assert.equal(resolveOrderOrgId([agentOwner], null).status, 403);
    assert.equal(
      resolveOrderOrgId(
        [
          merchantCashier,
          { ...merchantOwner, orgId: "m2", orgType: "merchant_site" },
        ],
        null,
      ).code,
      "org_required",
    );
    assert.deepEqual(
      resolveOrderOrgId(
        [
          merchantCashier,
          { ...merchantOwner, orgId: "m2", orgType: "merchant_site" },
        ],
        "m2",
      ),
      { ok: true, orgId: "m2" },
    );
  });

  it("forbids Cashier and agent users from changing settlement settings", () => {
    const merchant = { id: "m1", type: "merchant" };
    assert.equal(
      canChangeSettlementSettings(
        { platformOwner: false, memberships: [merchantOwner] },
        merchant,
      ),
      true,
    );
    assert.equal(
      canChangeSettlementSettings(
        { platformOwner: false, memberships: [merchantCashier] },
        merchant,
      ),
      false,
    );
    assert.equal(
      canChangeSettlementSettings(
        { platformOwner: false, memberships: [agentOwner] },
        merchant,
      ),
      false,
    );
    assert.equal(
      canChangeSettlementSettings(
        { platformOwner: true, memberships: [platformOwner] },
        merchant,
      ),
      true,
    );
  });

  it("lets agent users view settlement but not Cashiers", () => {
    const merchant = { id: "m1", type: "merchant" };
    assert.equal(
      canViewSettlementSettings(
        { platformOperator: false, memberships: [merchantViewer] },
        merchant,
      ),
      true,
    );
    assert.equal(
      canViewSettlementSettings(
        { platformOperator: false, memberships: [agentOwner] },
        merchant,
      ),
      true,
    );
    assert.equal(
      canViewSettlementSettings(
        { platformOperator: false, memberships: [merchantCashier] },
        merchant,
      ),
      false,
    );
    assert.equal(
      canViewSettlementSettings(
        { platformOperator: false, memberships: [merchantCashier] },
        { id: "site-1", type: "merchant_site" },
      ),
      false,
    );
  });

  it("uses the same role bar for matching mode as settlement", () => {
    const merchant = { id: "m1", type: "merchant" };
    assert.equal(
      canChangeMatchingModeSettings(
        { platformOwner: false, memberships: [merchantOwner] },
        merchant,
      ),
      true,
    );
    assert.equal(
      canChangeMatchingModeSettings(
        { platformOwner: false, memberships: [merchantCashier] },
        merchant,
      ),
      false,
    );
    assert.equal(
      canViewMatchingModeSettings(
        { platformOperator: false, memberships: [agentOwner] },
        merchant,
      ),
      true,
    );
    assert.equal(
      canViewMatchingModeSettings(
        { platformOperator: false, memberships: [merchantCashier] },
        merchant,
      ),
      false,
    );
  });

  it("scopes payment-order reads to the merchant org (Cashier own only)", () => {
    const order = { orgId: "m1", createdBy: "u1" };
    assert.equal(
      canReadPaymentOrder(
        { userId: "u2", platformOperator: false, memberships: [merchantOwner] },
        order,
      ),
      true,
    );
    assert.equal(
      canReadPaymentOrder(
        { userId: "u3", platformOperator: false, memberships: [merchantViewer] },
        order,
      ),
      true,
    );
    assert.equal(
      canReadPaymentOrder(
        { userId: "u1", platformOperator: false, memberships: [merchantCashier] },
        order,
      ),
      true,
    );
    assert.equal(
      canReadPaymentOrder(
        { userId: "other", platformOperator: false, memberships: [merchantCashier] },
        order,
      ),
      false,
    );
    assert.equal(
      canReadPaymentOrder(
        { userId: "u4", platformOperator: false, memberships: [agentOwner] },
        order,
      ),
      false,
    );
    assert.equal(
      canReadPaymentOrder(
        {
          userId: "u2",
          platformOperator: false,
          memberships: [{ ...merchantOwner, orgId: "m2" }],
        },
        order,
      ),
      false,
    );
    assert.equal(
      canReadPaymentOrder(
        { userId: "u5", platformOperator: true, memberships: [platformOwner] },
        order,
      ),
      true,
    );
  });

  it("scopes order list to merchant tree; cashiers cannot export", () => {
    assert.deepEqual(
      paymentOrderListScope({
        userId: "u5",
        platformOperator: true,
        memberships: [platformOwner],
      }),
      { kind: "all" },
    );
    assert.deepEqual(
      paymentOrderListScope({
        userId: "u4",
        platformOperator: false,
        memberships: [agentOwner],
      }),
      {
        kind: "scoped",
        treeRoots: ["a1"],
        cashierOrgIds: [],
        userId: "u4",
      },
    );
    assert.deepEqual(
      paymentOrderListScope({
        userId: "u2",
        platformOperator: false,
        memberships: [merchantOwner],
      }),
      {
        kind: "scoped",
        treeRoots: ["m1"],
        cashierOrgIds: [],
        userId: "u2",
      },
    );
    assert.deepEqual(
      paymentOrderListScope({
        userId: "u1",
        platformOperator: false,
        memberships: [merchantCashier],
      }),
      {
        kind: "scoped",
        treeRoots: [],
        cashierOrgIds: ["m1"],
        userId: "u1",
      },
    );
    assert.equal(
      canExportPaymentOrders({
        platformOperator: false,
        memberships: [merchantOwner],
      }),
      true,
    );
    assert.equal(
      canExportPaymentOrders({
        platformOperator: false,
        memberships: [merchantViewer],
      }),
      true,
    );
    assert.equal(
      canExportPaymentOrders({
        platformOperator: false,
        memberships: [merchantCashier],
      }),
      false,
    );
    assert.equal(
      canExportPaymentOrders({
        platformOperator: false,
        memberships: [agentOwner],
      }),
      true,
    );
  });

  it("requires parent merchant Owner to decide site overrides", () => {
    const site = { id: "s1", type: "merchant_site", parent_id: "m1" };
    const siteOwner = {
      orgId: "s1",
      role: "owner",
      orgType: "merchant_site",
    };
    assert.equal(
      canRequestSiteOverride({ memberships: [siteOwner] }, site),
      true,
    );
    assert.equal(
      canRequestSiteOverride({ memberships: [merchantCashier] }, site),
      false,
    );
    assert.equal(
      canDecideSiteOverride({ memberships: [merchantOwner] }, site),
      true,
    );
    assert.equal(
      canDecideSiteOverride({ memberships: [siteOwner] }, site),
      false,
    );
    assert.equal(
      canDecideSiteOverride(
        {
          memberships: [{ orgId: "m1", role: "administrator", orgType: "merchant" }],
        },
        site,
      ),
      false,
    );
  });

  it("allows parent merchant Owner/Admin to delete empty merchant sites", () => {
    const site = { id: "s1", type: "merchant_site", parent_id: "m1" };
    const platformOp = { platformOperator: true, memberships: [] };
    assert.equal(canDeleteMerchantSite(platformOp, site), true);
    assert.equal(
      canDeleteMerchantSite({ platformOperator: false, memberships: [merchantOwner] }, site),
      true,
    );
    assert.equal(
      canDeleteMerchantSite(
        {
          platformOperator: false,
          memberships: [{ orgId: "m1", role: "administrator", orgType: "merchant" }],
        },
        site,
      ),
      true,
    );
    assert.equal(
      canDeleteMerchantSite({ platformOperator: false, memberships: [merchantViewer] }, site),
      false,
    );
    assert.equal(
      canDeleteMerchantSite({ platformOperator: false, memberships: [merchantCashier] }, site),
      false,
    );
    assert.equal(
      canDeleteMerchantSite(platformOp, { id: "m1", type: "merchant", parent_id: "a1" }),
      false,
    );
  });

  it("resolves payment anomalies for O/A any and Cashier own only", () => {
    const anomalyOwn = {
      orgId: "m1",
      createdBy: "u1",
      status: "payment_anomaly",
    };
    const anomalyOther = {
      orgId: "m1",
      createdBy: "u9",
      status: "payment_anomaly",
    };
    const pending = {
      orgId: "m1",
      createdBy: "u1",
      status: "pending_payment",
    };
    const ownerCaller = {
      userId: "u2",
      platformOperator: false,
      memberships: [merchantOwner],
    };
    const cashierCaller = {
      userId: "u1",
      platformOperator: false,
      memberships: [merchantCashier],
    };
    const viewerCaller = {
      userId: "u3",
      platformOperator: false,
      memberships: [merchantViewer],
    };
    assert.equal(canResolvePaymentAnomaly(ownerCaller, anomalyOwn), true);
    assert.equal(canResolvePaymentAnomaly(ownerCaller, anomalyOther), true);
    assert.equal(canResolvePaymentAnomaly(cashierCaller, anomalyOwn), true);
    assert.equal(canResolvePaymentAnomaly(cashierCaller, anomalyOther), false);
    assert.equal(canResolvePaymentAnomaly(viewerCaller, anomalyOwn), false);
    assert.equal(canResolvePaymentAnomaly(ownerCaller, pending), false);
    assert.equal(canCancelPaymentOrder(ownerCaller, pending), true);
    assert.equal(canCancelPaymentOrder(ownerCaller, anomalyOwn), false);
  });

  it("allows agent channel O/A to manage direct children only", () => {
    const agentAdmin = {
      orgId: "a1",
      role: "administrator",
      orgType: "agent",
    };
    const subAgentOwner = {
      orgId: "s1",
      role: "owner",
      orgType: "agent_sub",
    };
    const caller = { platformOperator: false, memberships: [agentAdmin] };
    const subCaller = { platformOperator: false, memberships: [subAgentOwner] };

    assert.equal(
      canManageDirectChildOrg(caller, {
        type: "merchant",
        parentId: "a1",
      }),
      true,
    );
    assert.equal(
      canManageDirectChildOrg(
        caller,
        {
          type: "merchant",
          parentId: "a1",
        },
        ["a1"],
      ),
      true,
    );
    assert.equal(
      canManageDirectChildOrg(caller, {
        type: "agent_sub",
        parentId: "a1",
      }),
      true,
    );
    assert.equal(
      canManageDirectChildOrg(caller, {
        type: "merchant",
        parentId: "s1",
      }),
      false,
    );
    assert.equal(
      canManageDirectChildOrg(
        caller,
        {
          type: "merchant",
          parentId: "s1",
        },
        ["s1", "a1"],
      ),
      false,
    );
    assert.equal(
      canManageDirectChildOrg(caller, {
        type: "merchant_site",
        parentId: "m1",
      }),
      false,
    );
    assert.equal(
      canManageDirectChildOrg(subCaller, {
        type: "merchant",
        parentId: "s1",
      }),
      true,
    );
    const dualCaller = {
      platformOperator: false,
      memberships: [agentAdmin, subAgentOwner],
    };
    assert.equal(
      canManageDirectChildOrg(
        dualCaller,
        { type: "merchant", parentId: "s1" },
        ["s1", "a1"],
      ),
      false,
    );
    assert.equal(
      canUpdateMerchantCommercial(caller, {
        id: "m1",
        type: "merchant",
        parentId: "a1",
      }),
      true,
    );
    assert.equal(
      canUpdateMerchantCommercial(
        caller,
        {
          id: "m1",
          type: "merchant",
          parentId: "a1",
        },
        ["a1"],
      ),
      true,
    );
    assert.equal(
      canUpdateMerchantCommercial(caller, {
        id: "m2",
        type: "merchant",
        parentId: "s1",
      }),
      false,
    );
    assert.equal(
      canUpdateMerchantCommercial(
        dualCaller,
        { id: "m2", type: "merchant", parentId: "s1" },
        ["s1", "a1"],
      ),
      false,
    );
  });
});
