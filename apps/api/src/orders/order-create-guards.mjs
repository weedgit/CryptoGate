import { findOrgById } from "../orgs/org-store.mjs";
import { collectAncestorOrgIds } from "../orgs/org-ancestry.mjs";
import { getEffectiveNetworkMaintenance } from "../platform-settings/network-maintenance-store.mjs";

/** @typedef {{ status: number, code: string, message: string }} GuardError */

/**
 * @param {string} network
 * @returns {Promise<GuardError | null>}
 */
export async function checkNetworkMaintenance(network) {
  try {
    const maint = await getEffectiveNetworkMaintenance(network);
    if (maint) {
      const until = maint.endsAt
        ? ` until ${new Date(maint.endsAt).toISOString()}`
        : "";
      return {
        status: 422,
        code: "network_maintenance",
        message: maint.message || `Network ${network} is in maintenance${until}`,
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/network_maintenance|does not exist/i.test(message)) {
      return {
        status: 500,
        code: "internal_error",
        message: "Failed to check network maintenance",
      };
    }
  }
  return null;
}

/**
 * Paused / compliance-suspended merchant (or any ancestor of a site) may not price new payments.
 * @param {{ id: string, type: string, status?: string, order_create_suspended?: boolean }} merchantOrg
 * @returns {Promise<GuardError | null>}
 */
export async function checkMerchantMayCreateOrders(merchantOrg) {
  if (merchantOrg.status === "paused") {
    return {
      status: 403,
      code: "org_paused",
      message: "Merchant account is paused; payment orders cannot be created",
    };
  }
  if (merchantOrg.order_create_suspended === true) {
    return {
      status: 403,
      code: "order_create_suspended",
      message: "Platform compliance has suspended payment order creation for this merchant",
    };
  }
  if (merchantOrg.type !== "merchant_site") return null;
  const ancestors = await collectAncestorOrgIds(merchantOrg);
  for (const ancestorId of ancestors) {
    const ancestor = await findOrgById(ancestorId);
    if (!ancestor) continue;
    if (ancestor.status === "paused" || ancestor.order_create_suspended === true) {
      return ancestor.order_create_suspended
        ? {
            status: 403,
            code: "order_create_suspended",
            message:
              "Platform compliance has suspended payment order creation for an ancestor merchant",
          }
        : {
            status: 403,
            code: "org_paused",
            message:
              "An ancestor merchant or site account is paused; payment orders cannot be created",
          };
    }
    if (ancestor.type === "merchant") break;
  }
  return null;
}
