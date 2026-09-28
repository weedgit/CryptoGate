import { sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { toAuditLogEntry } from "../audit/audit-list-rules.mjs";
import { enrichAuditLogRows } from "../audit/audit-enrich.mjs";
import { listAuditLog } from "../audit/audit-list-store.mjs";
import { toAgentPayoutAddress } from "../commercial/agent-payout-rules.mjs";
import { findAgentPayoutAddress } from "../commercial/agent-payout-store.mjs";
import { toAgentCommissionSettings } from "../commercial/agent-commission-rules.mjs";
import { ensureAgentCommissionFromSchedule } from "../commercial/agent-commission-routes.mjs";
import { toMerchantCommercialSettings } from "../commercial/merchant-commercial-rules.mjs";
import { findMerchantCommercial } from "../commercial/merchant-commercial-store.mjs";
import { findFeeTierBand } from "../platform-settings/fee-tier-store.mjs";
import {
  expandPaymentOrderReadFilter,
  orgIdInPaymentOrderFilter,
} from "../orders/order-list-scope.mjs";
import {
  merchantPeriodStart,
  overviewOrderMetrics,
  platformFeeMonthToDate,
  utcMonthStart,
} from "./org-overview-metrics.mjs";
import { isVisibleOrg, listVisibleOrgs } from "./org-access.mjs";
import { canListOrgUsers, isPlatformStaff } from "./membership-rules.mjs";
import { listMembershipsForOrg } from "./membership-store.mjs";
import { listOrgsInSubtree } from "./org-scope.mjs";
import { findUserById } from "../auth/users.mjs";
import { findOrgById } from "./org-store.mjs";
import {
  canManagePlatform,
  canReadAgentCommission,
  canReadAgentPayout,
  canReadMerchantCommercial,
  effectiveRoleOnOrg,
  auditListScope,
  isMerchantOrgType,
  paymentOrderListScope,
} from "./role-policy.mjs";

const OVERVIEW_AUDIT_LIMIT = 8;

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

  const memberRole = await effectiveRoleOnOrg(caller, org);
  const platformStaff =
    caller.platformOperator === true || isPlatformStaff(caller.memberships);
  /** @type {Awaited<ReturnType<typeof listMembershipsForOrg>>} */
  let team = [];
  if (canListOrgUsers(memberRole, caller.platformOperator) || platformStaff) {
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
      auditRows = await enrichAuditLogRows(
        await listAuditLog({
          kind: auditScope.kind === "all" ? "all" : "filter",
          orgIds: auditOrgIds,
          orgId,
          limit: OVERVIEW_AUDIT_LIMIT,
        }),
      );
    }
  }

  /**
   * Period-to-date totals (server aggregates — never a capped row list).
   * @type {{ periodStart: string, ordersMtd: number, settledVolumeMtdUsd: number, openOrders: number, platformFeeMtdUsd: number | null } | null}
   */
  let metrics = null;
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
        const since = merchantPeriodStart(org.created_at ?? org.createdAt);
        const m = await overviewOrderMetrics(
          filter.kind === "all"
            ? { kind: "all" }
            : {
                kind: "filter",
                treeOrgIds: filter.treeOrgIds,
                cashierOrgIds: filter.cashierOrgIds,
                createdBy: filter.createdBy,
              },
          { orgId, since },
        );
        metrics = {
          periodStart: since.toISOString(),
          ordersMtd: m.orders,
          settledVolumeMtdUsd: m.settledVolumeUsd,
          openOrders: m.open,
          platformFeeMtdUsd: null,
        };
      }
    }
  } else if (org.type === "agent") {
    if (canReadAgentPayout(caller, org)) {
      const payoutRow = await findAgentPayoutAddress(orgId);
      payout = payoutRow ? toAgentPayoutAddress(payoutRow) : null;
    }
    if (canReadAgentCommission(caller, org)) {
      try {
        const commissionRow = await ensureAgentCommissionFromSchedule(orgId);
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
        const since = utcMonthStart();
        const [m, fee] = await Promise.all([
          allowedIds.length > 0
            ? overviewOrderMetrics({ kind: "filter", treeOrgIds: allowedIds }, { since })
            : { orders: 0, settledVolumeUsd: 0, open: 0 },
          platformFeeMonthToDate(allowedIds),
        ]);
        metrics = {
          periodStart: since.toISOString(),
          ordersMtd: m.orders,
          settledVolumeMtdUsd: m.settledVolumeUsd,
          openOrders: m.open,
          platformFeeMtdUsd: fee,
        };
      }
    }
  }

  /** @type {object | null} */
  let primaryOwnerContact = null;
  if ((canManagePlatform(caller) || platformStaff) && team.length > 0) {
    const ownerRow =
      team.find((m) => m.role === "owner") ?? team[0];
    const user = await findUserById(ownerRow.userId);
    if (user) {
      primaryOwnerContact = {
        userId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        timezone: user.timezone,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        avatarUrl: user.avatarUrl ?? null,
        mfaEnrolled: user.mfaEnrolled === true,
      };
    }
  }

  sendJson(res, 200, {
    team,
    audit: auditRows.map(toAuditLogEntry),
    metrics,
    commercial,
    payout,
    commission,
    primaryOwnerContact,
  });
}
