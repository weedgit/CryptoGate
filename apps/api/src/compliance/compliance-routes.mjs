import { validateMatchingSettings } from "@paymentgate/matching";
import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { findUserMfaById } from "../auth/users.mjs";
import { verifyTotp } from "../auth/totp.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import { updateOrgStatus } from "../orgs/org-store.mjs";
import { toOrgAccount } from "../orgs/org-accounts.mjs";
import { canComplianceOverride } from "../orgs/role-policy.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import { forceSettlementAddress } from "../settlement/settlement-store.mjs";
import { toSettlementAddress } from "../settlement/settlement-rules.mjs";
import { upsertMatchingModeSettings } from "../matching-mode/matching-mode-store.mjs";
import { toMatchingModeSettings } from "../matching-mode/matching-mode-rules.mjs";
import {
  toComplianceOverride,
  validateComplianceOverrideBody,
} from "./compliance-rules.mjs";
import {
  insertComplianceOverride,
  listComplianceOverridesForOrg,
  setOrderCreateSuspended,
} from "./compliance-store.mjs";

const MERCHANT_TYPES = new Set(["merchant", "merchant_site"]);
const INVALID_MFA = "Invalid MFA code";

/**
 * GET /v1/platform/orgs/{orgId}/compliance-overrides
 */
export async function handleListComplianceOverrides(req, res, orgId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  if (!caller.platformOperator && !caller.memberships.some((m) => m.orgType === "platform")) {
    sendError(res, 403, "forbidden", "Platform staff required");
    return;
  }

  const org = await findOrgById(orgId);
  if (!org || !MERCHANT_TYPES.has(org.type)) {
    sendError(res, 404, "not_found", "Merchant org not found");
    return;
  }

  const listed = await listComplianceOverridesForOrg(orgId, { limit: 50 });
  sendJson(res, 200, {
    items: listed.rows.map(toComplianceOverride),
    softEmpty: listed.softEmpty === true,
  });
}

/**
 * POST /v1/platform/orgs/{orgId}/compliance-override — B7 (MFA + immutable audit).
 */
export async function handleApplyComplianceOverride(req, res, orgId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  if (!canComplianceOverride(caller)) {
    sendError(
      res,
      403,
      "forbidden",
      "Platform Owner or Administrator required for compliance override",
    );
    return;
  }

  const org = await findOrgById(orgId);
  if (!org || !MERCHANT_TYPES.has(org.type)) {
    sendError(res, 404, "not_found", "Merchant org not found");
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const validated = validateComplianceOverrideBody(body);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }
  const parsed = validated.parsed;

  const user = await findUserMfaById(caller.userId);
  if (!user?.mfaEnrolled || !user.mfaSecret) {
    sendError(res, 403, "mfa_required", "MFA enrollment required before override");
    return;
  }
  if (!verifyTotp(user.mfaSecret, parsed.mfaCode)) {
    sendError(res, 401, "invalid_mfa", INVALID_MFA);
    return;
  }

  /** @type {Record<string, string | number | boolean | null>} */
  const effectMeta = {
    overrideType: parsed.overrideType,
    reasonCode: parsed.reasonCode,
  };
  if (parsed.ticketId) effectMeta.ticketId = parsed.ticketId;

  /** @type {object | null} */
  let resultPayload = null;

  if (parsed.overrideType === "suspend_merchant") {
    const updated = await updateOrgStatus(orgId, "paused");
    if (!updated) {
      sendError(res, 404, "not_found", "Merchant org not found");
      return;
    }
    effectMeta.priorStatus = org.status ?? "active";
    effectMeta.status = "paused";
    resultPayload = { org: toOrgAccount(updated) };
  } else if (parsed.overrideType === "suspend_order_create") {
    const updated = await setOrderCreateSuspended(orgId, true);
    if (!updated) {
      sendError(res, 404, "not_found", "Merchant org not found");
      return;
    }
    effectMeta.orderCreateSuspended = true;
    resultPayload = { org: toOrgAccount(updated) };
  } else if (parsed.overrideType === "matching_mode") {
    const policy = validateMatchingSettings({ mode: parsed.matchingMode });
    if (!policy.ok) {
      sendError(res, 400, policy.code, policy.message);
      return;
    }
    const row = await upsertMatchingModeSettings({
      orgId,
      matchingMode: parsed.matchingMode,
    });
    effectMeta.matchingMode = parsed.matchingMode;
    resultPayload = { matchingMode: toMatchingModeSettings(row, orgId) };
  } else if (parsed.overrideType === "settlement_address") {
    const s = parsed.settlement;
    const forced = await forceSettlementAddress({
      orgId,
      asset: s.asset,
      network: s.network,
      address: s.address,
    });
    effectMeta.asset = s.asset;
    effectMeta.network = s.network;
    effectMeta.addressPreview = `${s.address.slice(0, 8)}…`;
    resultPayload = { settlement: toSettlementAddress(forced) };
  }

  let overrideRow;
  try {
    overrideRow = await insertComplianceOverride({
      orgId,
      actorUserId: caller.userId,
      overrideType: parsed.overrideType,
      reasonCode: parsed.reasonCode,
      notes: parsed.notes,
      ticketId: parsed.ticketId,
      metadata: effectMeta,
    });
  } catch (err) {
    if (err && err.code === "42P01") {
      sendError(
        res,
        503,
        "migration_required",
        "Apply migration 028_compliance_overrides before using compliance override",
      );
      return;
    }
    throw err;
  }

  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId,
    action: AUDIT_ACTIONS.complianceOverride,
    metadata: {
      ...effectMeta,
      overrideId: overrideRow.id,
      notesPreview: parsed.notes.slice(0, 120),
    },
  });

  sendJson(res, 200, {
    override: toComplianceOverride(overrideRow),
    ...(resultPayload ?? {}),
  });
}
