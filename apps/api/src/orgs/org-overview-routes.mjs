import { sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { toAuditLogEntry } from "../audit/audit-list-rules.mjs";
import { listAuditLog } from "../audit/audit-list-store.mjs";
import { toAgentPayoutAddress } from "../commercial/agent-payout-rules.mjs";
import { findAgentPayoutAddress } from "../commercial/agent-payout-store.mjs";
import { toAgentCommissionSettings } from "../commercial/agent-commission-rules.mjs";
import { ensureAgentCommission } from "../commercial/agent-commission-store.mjs";
import { toMerchantCommercialSettings } from "../commercial/merchant-commercial-rules.mjs";
import { findMerchantCommercial } from "../commercial/merchant-commercial-store.mjs";
import { findFeeTierBand } from "../platform-settings/fee-tier-store.mjs";
import {
  expandPaymentOrderReadFilter,
  orgIdInPaymentOrderFilter,
} from "../orders/order-list-scope.mjs";
import { listPaymentOrders, toPaymentOrder } from "../orders/order-store.mjs";
import { isVisibleOrg, listVisibleOrgs, roleOnOrg } from "./org-access.mjs";
import { canListOrgUsers } from "./membership-rules.mjs";
import { listMembershipsForOrg } from "./membership-store.mjs";
import { listOrgsInSubtree } from "./org-scope.mjs";
import { findOrgById } from "./org-store.mjs";
import {
  canReadAgentCommission,
  canReadAgentPayout,
  canReadMerchantCommercial,
  auditListScope,
  isMerchantOrgType,
  paymentOrderListScope,
} from "./role-policy.mjs";

const OVERVIEW_AUDIT_LIMIT = 8;
const OVERVIEW_ORDERS_LIMIT = 200;

/**
 * GET /v1/orgs/{orgId}/overview — team, audit, orders, and type-specific fields in one round trip.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} orgId
 */
export async function handleGetOrgOverview(req, res, orgId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const org = await findOrgById(orgId);
  const visible = await listVisibleOrgs(caller.platformOperator, caller.memberships);
  if (!org || !isVisibleOrg(visible, orgId)) {
    sendError(res, 404, "not_found", "Org not found");
    return;
  }

  const memberRole = roleOnOrg(caller.memberships, orgId);
  /** @type {Awaited<ReturnType<typeof listMembershipsForOrg>>} */
  let team = [];
  if (canListOrgUsers(memberRole, caller.platformOperator)) {
    team = await listMembershipsForOrg(orgId);
  }

  const auditScope = auditListScope(caller);
  /** @type {Awaited<ReturnType<typeof listAuditLog>>} */
  let auditRows = [];
  if (auditScope.kind !== "none") {
    /** @type {string[] | undefined} */
    let auditOrgIds;
    if (auditScope.kind === "scoped") {
      const subtree = await listOrgsInSubtree(auditScope.rootIds);
      auditOrgIds = subtree.map((r) => r.id);
      if (!auditOrgIds.includes(orgId)) {
        auditOrgIds = [];
      }
    }
    if (auditScope.kind === "all" || (auditOrgIds && auditOrgIds.length > 0)) {
      auditRows = await listAuditLog({
        kind: auditScope.kind === "all" ? "all" : "filter",
        orgIds: auditOrgIds,
        orgId,
        limit: OVERVIEW_AUDIT_LIMIT,
      });
    }
  }

  /** @type {Awaited<ReturnType<typeof listPaymentOrders>>} */
  let orderRows = [];
  /** @type {object | null} */
  let commercial = null;
  /** @type {object | null} */
  let payout = null;
  /** @type {object | null} */
  let commission = null;

  const orderScope = paymentOrderListScope(caller);

  if (isMerchantOrgType(org.type)) {
    if (canReadMerchantCommercial(caller, org)) {
      const commercialRow = await findMerchantCommercial(orgId);
      if (commercialRow) {
        const bandRow = await findFeeTierBand(commercialRow.tier);
        if (bandRow) {
          commercial = toMerchantCommercialSettings(commercialRow, bandRow);
        }
      }
    }
    if (orderScope.kind !== "none") {
      const filter = await expandPaymentOrderReadFilter(orderScope);
      if (orgIdInPaymentOrderFilter(filter, orgId)) {
        orderRows = await listPaymentOrders({
          kind: filter.kind === "all" ? "all" : "filter",
          treeOrgIds: filter.kind === "filter" ? filter.treeOrgIds : [],
          cashierOrgIds: filter.kind === "filter" ? filter.cashierOrgIds : [],
          createdBy: filter.kind === "filter" ? filter.createdBy : null,
          orgId,
          limit: OVERVIEW_ORDERS_LIMIT,
        });
      }
    }
  } else if (org.type === "agent" || org.type === "agent_sub") {
    if (canReadAgentPayout(caller, org)) {
      const payoutRow = await findAgentPayoutAddress(orgId);
      payout = payoutRow ? toAgentPayoutAddress(payoutRow) : null;
    }
    if (canReadAgentCommission(caller, org)) {
      try {
        const commissionRow = await ensureAgentCommission(orgId);
        commission = toAgentCommissionSettings(commissionRow);
      } catch {
        commission = null;
      }
    }
    if (orderScope.kind !== "none") {
      const subtree = await listOrgsInSubtree([orgId]);
      const merchantOrgIds = subtree
        .filter((row) => isMerchantOrgType(row.type))
        .map((row) => row.id);
      if (merchantOrgIds.length > 0) {
        const filter = await expandPaymentOrderReadFilter(orderScope);
        const allowedIds =
          filter.kind === "all"
            ? merchantOrgIds
            : merchantOrgIds.filter((id) => orgIdInPaymentOrderFilter(filter, id));
        if (allowedIds.length > 0) {
          orderRows = await listPaymentOrders({
            kind: "filter",
            treeOrgIds: allowedIds,
            limit: OVERVIEW_ORDERS_LIMIT,
          });
        }
      }
    }
  }

  sendJson(res, 200, {
    team,
    audit: auditRows.map(toAuditLogEntry),
    orders: orderRows.map(toPaymentOrder),
    commercial,
    payout,
    commission,
  });
}
