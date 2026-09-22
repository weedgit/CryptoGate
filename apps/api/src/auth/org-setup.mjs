import { findOrgById } from "../orgs/org-store.mjs";
import { findBillingMerchantOrg } from "../orgs/org-ancestry.mjs";
import { listSettlementAddresses } from "../settlement/settlement-store.mjs";
import { findAgentPayoutAddress } from "../commercial/agent-payout-store.mjs";

const AGENT_TYPES = new Set(["agent", "agent_sub"]);

function isContactVerified(user) {
  return Boolean(user?.emailVerified && user?.phoneVerified);
}

function hasNamePart(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Person fields required for activity gate (first + last + timezone).
 * @param {{ firstName?: string | null, lastName?: string | null, timezone?: string | null, displayName?: string | null }} user
 */
export function isPersonProfileComplete(user) {
  const first = hasNamePart(user?.firstName);
  const last = hasNamePart(user?.lastName);
  // Legacy: displayName alone is not enough once first/last columns exist,
  // but allow displayName split fallback when first/last empty after migration.
  const legacyOk =
    !first &&
    !last &&
    hasNamePart(user?.displayName) &&
    String(user.displayName).trim().includes(" ");
  const namesOk = (first && last) || legacyOk;
  const tzOk =
    typeof user?.timezone === "string" && user.timezone.trim().length > 0;
  return namesOk && tzOk;
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
 * Org registration fields for the gate.
 * Agent: billing email required (may equal owner email later).
 * Merchant: country + billing email.
 * @param {object} org
 * @param {"agent" | "merchant"} kind
 */
function isOrgProfileComplete(org, kind) {
  const nameOk =
    typeof org?.name === "string" &&
    org.name.trim().replace(/\s+/g, " ").length >= 2;
  const billingOk =
    typeof org?.billing_email === "string" &&
    org.billing_email.trim().includes("@");
  if (kind === "merchant") {
    const countryOk =
      typeof org?.country === "string" && org.country.trim().length > 0;
    return nameOk && countryOk && billingOk;
  }
  // Agent: country optional; billing email required for gate.
  return nameOk && billingOk;
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
 * @param {{
 *   emailVerified?: boolean,
 *   phoneVerified?: boolean,
 *   firstName?: string | null,
 *   lastName?: string | null,
 *   displayName?: string | null,
 *   timezone?: string | null,
 * } | null} user
 */
export async function loadOrgSetupStatus(memberships, user) {
  const contactVerified = isContactVerified(user);
  const personComplete = isPersonProfileComplete(user ?? {});
  const resolved = await resolveSetupOrg(memberships ?? []);

  if (!resolved) {
    return {
      contactVerified,
      personComplete,
      profileComplete: true,
      walletSet: true,
      setupReady: contactVerified && personComplete,
      setupOrgId: null,
      setupOrgType: null,
      missing: [
        ...(!contactVerified ? ["email and phone verification"] : []),
        ...(!personComplete ? ["first name, last name, timezone"] : []),
      ],
    };
  }

  const profileComplete = isOrgProfileComplete(resolved.org, resolved.kind);
  const walletSet = await isWalletSet(resolved.kind, resolved.org.id);
  /** @type {string[]} */
  const missing = [];
  if (!contactVerified) missing.push("email and phone verification");
  if (!personComplete) missing.push("first name, last name, timezone");
  if (!profileComplete) {
    if (resolved.kind === "merchant") {
      missing.push("country and billing email");
    } else {
      missing.push("billing email");
    }
  }
  if (!walletSet) {
    missing.push(
      resolved.kind === "agent" ? "payout wallet address" : "settlement wallet",
    );
  }

  return {
    contactVerified,
    personComplete,
    profileComplete,
    walletSet,
    setupReady:
      contactVerified && personComplete && profileComplete && walletSet,
    setupOrgId: resolved.org.id,
    setupOrgType: resolved.org.type,
    missing,
  };
}
