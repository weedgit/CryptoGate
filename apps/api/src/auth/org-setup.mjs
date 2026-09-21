import { findOrgById } from "../orgs/org-store.mjs";
import { findBillingMerchantOrg } from "../orgs/org-ancestry.mjs";
import { listSettlementAddresses } from "../settlement/settlement-store.mjs";
import { findAgentPayoutAddress } from "../commercial/agent-payout-store.mjs";

const AGENT_TYPES = new Set(["agent", "agent_sub"]);

function isContactVerified(user) {
  return Boolean(user?.emailVerified && user?.phoneVerified);
}

/**
 * Org whose profile + wallet must be complete before live actions.
 * Agents use their agent org; merchants/sites resolve to the billing merchant.
 * Platform-only memberships → null (no org setup required).
 *
 * @param {{ orgId: string, orgType: string }[]} memberships
 * @returns {Promise<{ org: object, kind: "agent" | "merchant" } | null>}
 */
export async function resolveSetupOrg(memberships) {
  const agent = memberships.find((m) => AGENT_TYPES.has(m.orgType ?? ""));
  if (agent) {
    const org = await findOrgById(agent.orgId);
    return org ? { org, kind: "agent" } : null;
  }

  const merchant = memberships.find((m) => m.orgType === "merchant");
  if (merchant) {
    const org = await findOrgById(merchant.orgId);
    return org ? { org, kind: "merchant" } : null;
  }

  const site = memberships.find((m) => m.orgType === "merchant_site");
  if (site) {
    const siteOrg = await findOrgById(site.orgId);
    const billing = await findBillingMerchantOrg(siteOrg);
    return billing ? { org: billing, kind: "merchant" } : null;
  }

  return null;
}

/**
 * @param {object} org
 */
function isProfileComplete(org) {
  const nameOk =
    typeof org?.name === "string" && org.name.trim().replace(/\s+/g, " ").length >= 2;
  const countryOk =
    typeof org?.country === "string" && org.country.trim().length > 0;
  return nameOk && countryOk;
}

/**
 * @param {"agent" | "merchant"} kind
 * @param {string} orgId
 */
async function isWalletSet(kind, orgId) {
  if (kind === "agent") {
    const payout = await findAgentPayoutAddress(orgId);
    return Boolean(payout?.address);
  }
  const rows = await listSettlementAddresses(orgId);
  return rows.some((r) => typeof r.address === "string" && r.address.trim());
}

/**
 * @param {{ orgId: string, orgType: string }[]} memberships
 * @param {{ emailVerified?: boolean, phoneVerified?: boolean } | null} user
 */
export async function loadOrgSetupStatus(memberships, user) {
  const contactVerified = isContactVerified(user);
  const resolved = await resolveSetupOrg(memberships ?? []);

  if (!resolved) {
    return {
      contactVerified,
      profileComplete: true,
      walletSet: true,
      setupReady: contactVerified,
      setupOrgId: null,
      setupOrgType: null,
    };
  }

  const profileComplete = isProfileComplete(resolved.org);
  const walletSet = await isWalletSet(resolved.kind, resolved.org.id);

  return {
    contactVerified,
    profileComplete,
    walletSet,
    setupReady: contactVerified && profileComplete && walletSet,
    setupOrgId: resolved.org.id,
    setupOrgType: resolved.org.type,
  };
}
