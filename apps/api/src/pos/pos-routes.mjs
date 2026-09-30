import { findUserById, findUserIdByPosPin } from "../auth/users.mjs";
import {
  createSession,
  findActiveSessionByToken,
  revokeSessionByToken,
  revokeTerminalSessions,
} from "../auth/sessions.mjs";
import { liveActionBlock } from "../auth/contact-verification.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import { clearSessionCookie, getSessionToken, sessionCookie } from "../http/cookies.mjs";
import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { requireSession } from "../http/require-session.mjs";
import { sessionPayload } from "../http/auth-routes.mjs";
import { NotificationEventType } from "@paymentgate/domain";
import { notifyMerchantOrg } from "../notifications/notify.mjs";
import { findMembership, listMembershipsForUser } from "../orgs/membership-store.mjs";
import { listVisibleOrgs, isVisibleOrg } from "../orgs/org-access.mjs";
import { findOrgById, resolveBusinessTimezone } from "../orgs/org-store.mjs";
import { effectiveRoleOnOrg, mustEnrollMfa } from "../orgs/role-policy.mjs";
import { clientIp, rateLimitDecision } from "../rate-limit/rate-limit-rules.mjs";
import {
  countRecentFailedUnlocks,
  findTerminalByToken,
  findTerminalInOrg,
  insertTerminal,
  listTerminalsForOrg,
  recordUnlockFailure,
  resetUnlockFailures,
  revokeTerminal,
  touchTerminal,
} from "./pos-terminal-store.mjs";

export const POS_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const BIND_ROLES = new Set(["owner", "administrator"]);
const UNLOCK_ROLES = new Set(["owner", "administrator", "cashier"]);
const MERCHANT_ORG_TYPES = new Set(["merchant", "merchant_site"]);
export const ORG_FAILED_UNLOCK_ALERT = 20;
const BIND_WINDOW_MS = 60 * 60 * 1000;
const BIND_LIMIT_PER_USER = 10;
const BIND_LIMIT_PER_IP = 20;

/** @type {Map<string, number[]>} */
const bindBuckets = new Map();

export function resetPosBindLimits() {
  bindBuckets.clear();
}

/**
 * @param {string[]} keys
 * @param {number[]} limits
 * @returns {number | null} retry-after seconds when a bucket is full
 */
function consumeBindLimits(keys, limits) {
  const now = Date.now();
  /** @type {number[][]} */
  const next = [];
  for (let i = 0; i < keys.length; i += 1) {
    const decision = rateLimitDecision(bindBuckets.get(keys[i]) ?? [], now, BIND_WINDOW_MS, limits[i]);
    if (!decision.ok) return decision.retryAfter;
    next.push(decision.next);
  }
  keys.forEach((key, i) => bindBuckets.set(key, next[i]));
  return null;
}

/**
 * @param {import("node:http").IncomingMessage} req
 */
function requestIp(req) {
  return clientIp(req.headers, req.socket?.remoteAddress);
}

/**
 * @param {import("node:http").IncomingMessage} req
 */
function terminalTokenFromRequest(req) {
  const raw = req.headers.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const match = typeof value === "string" ? value.match(/^Terminal\s+(\S+)\s*$/i) : null;
  return match ? match[1] : null;
}

/**
 * `Authorization: Terminal <token>`. Unknown or revoked → 401 terminal_revoked (the APK wipes itself).
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function requireTerminal(req, res) {
  const token = terminalTokenFromRequest(req);
  if (!token) {
    sendError(res, 401, "terminal_required", "Authorization: Terminal <token> is required");
    return null;
  }
  const terminal = await findTerminalByToken(token);
  if (!terminal || terminal.status !== "active") {
    sendError(res, 401, "terminal_revoked", "This POS terminal is no longer bound");
    return null;
  }
  return terminal;
}

/**
 * @param {Awaited<ReturnType<typeof findTerminalByToken>>} terminal
 */
async function terminalOrgPayload(terminal) {
  return {
    org: { id: terminal.orgId, type: terminal.orgType, name: terminal.orgName },
    businessTimezone: (await resolveBusinessTimezone(terminal.orgId).catch(() => null)) ?? null,
  };
}

/**
 * @param {unknown} value
 */
function shortText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 80) : null;
}

/**
 * POST /v1/pos/terminals — an Owner/Admin binds this POS to their own org. The login
 * session that made the call ends here; the APK keeps only the terminal token.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleBindTerminal(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (caller.apiKeyScopes || caller.terminalId) {
    sendError(res, 403, "forbidden", "Sign in with an Owner or Administrator account to set up a POS");
    return;
  }

  const membership = caller.memberships.find(
    (m) => MERCHANT_ORG_TYPES.has(m.orgType) && BIND_ROLES.has(m.role) && m.status !== "paused",
  );
  if (!membership) {
    sendError(
      res,
      403,
      "forbidden",
      "Only an Owner or Administrator of a merchant or site can set up a POS",
    );
    return;
  }
  const user = await findUserById(caller.userId);
  if (mustEnrollMfa([membership]) && !user?.mfaEnrolled) {
    sendError(
      res,
      403,
      "mfa_enrollment_required",
      "Set up an authenticator in the web portal before binding a POS",
    );
    return;
  }

  const ip = requestIp(req);
  const retryAfter = consumeBindLimits(
    [`user:${caller.userId}`, `ip:${ip}`],
    [BIND_LIMIT_PER_USER, BIND_LIMIT_PER_IP],
  );
  if (retryAfter != null) {
    res.setHeader("Retry-After", String(retryAfter));
    sendError(res, 429, "rate_limited", "Too many POS set-up attempts. Try again later.");
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const org = await findOrgById(membership.orgId);
  if (!org) {
    sendError(res, 404, "not_found", "Org not found");
    return;
  }

  const created = await insertTerminal({
    orgId: org.id,
    boundBy: caller.userId,
    deviceModel: shortText(body?.deviceModel),
    appVersion: shortText(body?.appVersion),
    ip,
  });
  await revokeSessionByToken(caller.token);
  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId: org.id,
    action: AUDIT_ACTIONS.posTerminalBound,
    metadata: {
      terminalId: created.terminalId,
      role: membership.role,
      deviceModel: shortText(body?.deviceModel),
      appVersion: shortText(body?.appVersion),
      ip,
    },
  });

  res.setHeader("Set-Cookie", clearSessionCookie());
  sendJson(res, 201, {
    terminalToken: created.token,
    terminal: { id: created.terminalId },
    org: { id: org.id, type: org.type, name: org.name },
    businessTimezone: (await resolveBusinessTimezone(org.id).catch(() => null)) ?? null,
  });
}

/**
 * GET /v1/pos/terminal — terminal + org for the PIN pad. Also a heartbeat.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleGetTerminal(req, res) {
  const terminal = await requireTerminal(req, res);
  if (!terminal) return;
  await touchTerminal(terminal.id, requestIp(req));
  sendJson(res, 200, {
    terminal: {
      id: terminal.id,
      status: terminal.status,
      deviceModel: terminal.deviceModel,
      appVersion: terminal.appVersion,
      createdAt: terminal.createdAt,
    },
    ...(await terminalOrgPayload(terminal)),
  });
}

/**
 * Org-wide wrong-PIN watch: alert once when the last hour reaches the threshold.
 * Never locks the org out.
 * @param {Awaited<ReturnType<typeof findTerminalByToken>>} terminal
 */
async function watchOrgFailedUnlocks(terminal) {
  const count = await countRecentFailedUnlocks(terminal.orgId);
  if (count !== ORG_FAILED_UNLOCK_ALERT) return;
  await insertAuditEvent({
    orgId: terminal.orgId,
    action: AUDIT_ACTIONS.posUnlockAlert,
    metadata: { terminalId: terminal.id, failedLastHour: count },
  });
  notifyMerchantOrg(terminal.orgId, NotificationEventType.PaymentAnomaly, {
    subject: `Many wrong POS PINs — ${terminal.orgName ?? "your POS"}`,
    lines: [
      `${count} wrong PINs were entered on the POS terminals of ${terminal.orgName ?? "your org"} in the last hour.`,
      "If this wasn't your staff, revoke the terminal from the web portal and generate new PINs.",
    ],
    path: "team",
  });
}

/**
 * POST /v1/pos/unlock — PIN only. The server finds the person inside the terminal's org.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleUnlock(req, res) {
  const terminal = await requireTerminal(req, res);
  if (!terminal) return;
  const ip = requestIp(req);

  if (terminal.lockedUntil && terminal.lockedUntil.getTime() > Date.now()) {
    const retryAfterSeconds = Math.max(1, Math.ceil((terminal.lockedUntil.getTime() - Date.now()) / 1000));
    res.setHeader("Retry-After", String(retryAfterSeconds));
    sendError(res, 423, "pos_unlock_locked", "Too many wrong PINs. Try again shortly.", {
      retryAfterSeconds,
    });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }
  const pin = typeof body?.pin === "string" ? body.pin.trim() : "";

  const userId = pin ? await findUserIdByPosPin(terminal.orgId, pin) : null;
  const membership = userId ? await findMembership(terminal.orgId, userId) : null;
  if (!userId || !membership || !UNLOCK_ROLES.has(membership.role)) {
    const { lockedUntil } = await recordUnlockFailure(terminal.id);
    await insertAuditEvent({
      actorUserId: userId ?? null,
      orgId: terminal.orgId,
      action: AUDIT_ACTIONS.posUnlockFailed,
      metadata: { terminalId: terminal.id, ip },
    });
    await watchOrgFailedUnlocks(terminal);
    if (lockedUntil && lockedUntil.getTime() > Date.now()) {
      const retryAfterSeconds = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      sendError(res, 423, "pos_unlock_locked", "Too many wrong PINs. Try again shortly.", {
        retryAfterSeconds,
      });
      return;
    }
    sendError(res, 401, "invalid_pos_pin", "Incorrect PIN. Try again.");
    return;
  }

  await resetUnlockFailures(terminal.id);
  await revokeTerminalSessions(terminal.id);
  const created = await createSession({
    userId,
    ttlMs: POS_SESSION_TTL_MS,
    mfaVerified: true,
    terminalId: terminal.id,
  });
  await touchTerminal(terminal.id, ip);
  await insertAuditEvent({
    actorUserId: userId,
    orgId: terminal.orgId,
    action: AUDIT_ACTIONS.posUnlockSuccess,
    metadata: { terminalId: terminal.id, role: membership.role, ip },
  });

  const user = await findUserById(userId);
  const memberships = (await listMembershipsForUser(userId)).filter(
    (m) => m.orgId === terminal.orgId,
  );
  const block = await liveActionBlock({ userId, memberships }, "POST", "/v1/orders");
  res.setHeader(
    "Set-Cookie",
    sessionCookie(created.token, { maxAgeSec: Math.floor(POS_SESSION_TTL_MS / 1000) }),
  );
  sendJson(res, 200, {
    session: await sessionPayload(user, memberships),
    operator: {
      firstName: user?.firstName ?? null,
      lastName: user?.lastName ?? null,
      role: membership.role,
    },
    liveActionsUnlocked: block === null,
    ...(block ? { liveActionsBlockedReason: block.code } : {}),
    expiresAt: created.expiresAt.toISOString(),
    ...(await terminalOrgPayload(terminal)),
  });
}

/**
 * POST /v1/pos/lock — end the PIN session; the terminal stays bound.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleLock(req, res) {
  const terminal = await requireTerminal(req, res);
  if (!terminal) return;
  const token = getSessionToken(req.headers.cookie);
  const session = token ? await findActiveSessionByToken(token) : null;
  if (token && session?.terminalId === terminal.id) {
    await revokeSessionByToken(token);
    await insertAuditEvent({
      actorUserId: session.userId,
      orgId: terminal.orgId,
      action: AUDIT_ACTIONS.posLock,
      metadata: { terminalId: terminal.id },
    });
  }
  res.setHeader("Set-Cookie", clearSessionCookie());
  res.writeHead(204);
  res.end();
}

/**
 * POST /v1/pos/unbind — an Owner/Admin unlocked by PIN on this terminal revokes it.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleUnbind(req, res) {
  const terminal = await requireTerminal(req, res);
  if (!terminal) return;
  const session = await requireSession(req, res);
  if (!session) return;
  if (session.terminalId !== terminal.id) {
    sendError(res, 403, "forbidden", "Unlock this POS with an Owner or Administrator PIN first");
    return;
  }
  const membership = await findMembership(terminal.orgId, session.userId);
  if (!membership || !BIND_ROLES.has(membership.role)) {
    sendError(res, 403, "forbidden", "Only an Owner or Administrator can unbind this POS");
    return;
  }
  await revokeTerminal(terminal.id, { revokedBy: session.userId, reason: "unbind" });
  await revokeTerminalSessions(terminal.id);
  await insertAuditEvent({
    actorUserId: session.userId,
    orgId: terminal.orgId,
    action: AUDIT_ACTIONS.posTerminalUnbound,
    metadata: { terminalId: terminal.id, role: membership.role },
  });
  res.setHeader("Set-Cookie", clearSessionCookie());
  res.writeHead(204);
  res.end();
}

/**
 * Web: Owner/Admin of the org (a merchant manager for its sites) or platform staff.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} orgId
 */
async function loadTerminalAdmin(req, res, orgId) {
  const caller = await requireCaller(req, res);
  if (!caller) return null;
  const org = await findOrgById(orgId);
  const visible = org ? await listVisibleOrgs(caller.platformOperator, caller.memberships) : [];
  if (!org || (!caller.platformOperator && !isVisibleOrg(visible, orgId))) {
    sendError(res, 404, "not_found", "Org not found");
    return null;
  }
  if (!MERCHANT_ORG_TYPES.has(org.type)) {
    sendError(res, 400, "invalid_request", "POS terminals belong to merchant or site orgs");
    return null;
  }
  const role = await effectiveRoleOnOrg(caller, org);
  if (!caller.platformOperator && !BIND_ROLES.has(role ?? "")) {
    sendError(res, 403, "forbidden", "Only an Owner or Administrator can manage POS terminals");
    return null;
  }
  return { caller, org };
}

/**
 * @param {Awaited<ReturnType<typeof findTerminalInOrg>>} terminal
 */
function terminalListItem(terminal) {
  return {
    id: terminal.id,
    status: terminal.status,
    deviceModel: terminal.deviceModel,
    appVersion: terminal.appVersion,
    lastSeenAt: terminal.lastSeenAt,
    createdAt: terminal.createdAt,
    boundBy: terminal.boundBy,
    revokedAt: terminal.revokedAt,
    revokeReason: terminal.revokeReason,
  };
}

/**
 * GET /v1/orgs/{orgId}/pos-terminals
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} orgId
 */
export async function handleListOrgTerminals(req, res, orgId) {
  const loaded = await loadTerminalAdmin(req, res, orgId);
  if (!loaded) return;
  const rows = await listTerminalsForOrg(orgId);
  sendJson(res, 200, { items: rows.map(terminalListItem) });
}

/**
 * POST /v1/orgs/{orgId}/pos-terminals/{id}/revoke — e.g. a lost device.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} orgId
 * @param {string} terminalId
 */
export async function handleRevokeOrgTerminal(req, res, orgId, terminalId) {
  const loaded = await loadTerminalAdmin(req, res, orgId);
  if (!loaded) return;
  let body = null;
  try {
    body = await readJsonBody(req);
  } catch {
    body = null;
  }
  const terminal = await findTerminalInOrg(orgId, terminalId);
  if (!terminal) {
    sendError(res, 404, "not_found", "POS terminal not found");
    return;
  }
  const reason = shortText(body?.reason) ?? "revoked from web";
  const changed = await revokeTerminal(terminal.id, {
    revokedBy: loaded.caller.userId,
    reason,
  });
  await revokeTerminalSessions(terminal.id);
  if (changed) {
    await insertAuditEvent({
      actorUserId: loaded.caller.userId,
      orgId,
      action: AUDIT_ACTIONS.posTerminalRevoked,
      metadata: { terminalId: terminal.id, reason },
    });
  }
  const updated = await findTerminalInOrg(orgId, terminalId);
  sendJson(res, 200, terminalListItem(updated ?? terminal));
}
