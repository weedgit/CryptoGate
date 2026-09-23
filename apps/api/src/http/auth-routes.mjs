import {
  authenticateUser,
  clearUserPosPin,
  findUserByEmail,
  findUserById,
  findUserMfaById,
  isUserAvatarValue,
  normalizeEmail,
  setUserPosPin,
  markEmailVerified,
  updateUserPassword,
  updateUserProfile,
  userHasPosPin,
  verifyUserPosPin,
} from "../auth/users.mjs";
import { validatePosPin } from "../auth/pos-pin-hash.mjs";
import { verifyPassword } from "../auth/password-hash.mjs";
import { sessionFromUserWithSetup } from "../auth/session-payload.mjs";
import {
  activatePendingMfa,
  clearUserMfa,
  setPendingMfaSecret,
} from "../auth/mfa.mjs";
import { generateTotpSecret, otpauthUrl, verifyTotp } from "../auth/totp.mjs";
import {
  createPasswordResetToken,
  findValidPasswordReset,
  markPasswordResetUsed,
} from "../auth/password-reset-store.mjs";
import { validatePasswordReset } from "../auth/password-policy.mjs";
import {
  createSession,
  findActiveSessionByToken,
  markSessionMfaVerified,
  revokeSessionByToken,
} from "../auth/sessions.mjs";
import { ALLOWED_SESSION_TIMEOUT_MINUTES } from "../platform-settings/org-policy-store.mjs";
import { ttlMsForUser } from "./session-ttl.mjs";
import {
  clearSessionCookie,
  getSessionToken,
  sessionCookie,
} from "./cookies.mjs";
import { requireCaller } from "./require-caller.mjs";
import { requireSession } from "./require-session.mjs";
import { readJsonBody, sendError, sendJson } from "./json.mjs";
import { listMembershipsForUser } from "../orgs/membership-store.mjs";
import { canEnrollMfa } from "../orgs/role-policy.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import { sendPasswordResetEmail } from "../mail/auth-mail.mjs";
import {
  inviteRelativePathForToken,
  passwordResetUrl,
} from "../mail/portal-links.mjs";

const GENERIC_LOGIN_ERROR = "Invalid email or password";
const INVALID_MFA = "Invalid MFA code";

function setSessionCookie(res, token, ttlMs) {
  const maxAgeSec = Math.max(60, Math.floor(ttlMs / 1000));
  res.setHeader("Set-Cookie", sessionCookie(token, { maxAgeSec }));
}

async function sessionPayload(user, memberships) {
  const memberRows =
    memberships ?? (await listMembershipsForUser(user.id));
  return sessionFromUserWithSetup(
    {
      id: user.id,
      email: user.email,
      mustChangePassword: user.mustChangePassword === true,
      mfaEnrolled: user.mfaEnrolled === true,
      mfaEnrollmentPending: user.mfaEnrollmentPending === true,
      displayName: user.displayName ?? null,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      avatarUrl: user.avatarUrl ?? null,
      locale: user.locale ?? "en",
      timezone: user.timezone ?? "UTC",
      mfaEnforcement: user.mfaEnforcement === true,
      sessionTimeoutMinutes: user.sessionTimeoutMinutes,
      emailVerified: user.emailVerified === true,
      phone: user.phone ?? null,
      phoneVerified: user.phoneVerified === true,
    },
    memberRows,
  );
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleLogin(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    sendError(res, 400, "invalid_request", "Email and password are required");
    return;
  }

  const user = await authenticateUser(email, password);
  if (!user) {
    sendError(res, 401, "invalid_credentials", GENERIC_LOGIN_ERROR);
    return;
  }

  const profile = await findUserById(user.id);
  const ttlMs = ttlMsForUser(profile ?? user);
  const created = await createSession({
    userId: user.id,
    ttlMs,
    mfaVerified: !user.mfaEnrolled,
  });
  await insertAuditEvent({
    actorUserId: user.id,
    action: AUDIT_ACTIONS.login,
  });
  setSessionCookie(res, created.token, ttlMs);
  sendJson(res, 200, {
    session: await sessionPayload(profile ?? user),
    mfaRequired: user.mfaEnrolled,
  });
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleLogout(req, res) {
  const token = getSessionToken(req.headers.cookie);
  if (token) {
    const session = await findActiveSessionByToken(token);
    await revokeSessionByToken(token);
    if (session) {
      await insertAuditEvent({
        actorUserId: session.userId,
        action: AUDIT_ACTIONS.logout,
      });
    }
  }
  res.setHeader("Set-Cookie", clearSessionCookie());
  res.writeHead(204);
  res.end();
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleGetSession(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const user = await findUserById(caller.userId);
  if (!user) {
    sendError(res, 401, "unauthenticated", "Not authenticated");
    return;
  }

  sendJson(res, 200, await sessionPayload(user, caller.memberships));
}

/**
 * Start TOTP enrollment. Owner/Administrator only.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleMfaEnroll(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  if (!canEnrollMfa(caller.memberships)) {
    sendError(res, 403, "forbidden", "Only Owner or Administrator may enroll MFA");
    return;
  }

  const user = await findUserMfaById(caller.userId);
  if (!user) {
    sendError(res, 401, "unauthenticated", "Not authenticated");
    return;
  }
  if (user.mfaEnrolled) {
    sendError(res, 400, "mfa_already_enrolled", "MFA is already enabled");
    return;
  }

  if (user.mfaPendingSecret) {
    sendJson(res, 200, {
      secret: user.mfaPendingSecret,
      otpauthUrl: otpauthUrl(user.email, user.mfaPendingSecret),
      resumed: true,
    });
    return;
  }

  const secret = generateTotpSecret();
  await setPendingMfaSecret(user.id, secret);
  await insertAuditEvent({
    actorUserId: user.id,
    action: AUDIT_ACTIONS.mfaEnroll,
  });
  sendJson(res, 200, {
    secret,
    otpauthUrl: otpauthUrl(user.email, secret),
    resumed: false,
  });
}

/**
 * Replace authenticator — clears enrolled/pending MFA after password check.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleMfaReset(req, res) {
  const auth = await requireSession(req, res);
  if (!auth) return;

  if (!canEnrollMfa(auth.memberships)) {
    sendError(res, 403, "forbidden", "Only Owner or Administrator may reset MFA");
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const currentPassword =
    typeof body?.currentPassword === "string" ? body.currentPassword : "";
  if (!currentPassword) {
    sendError(res, 400, "invalid_request", "currentPassword is required");
    return;
  }

  const profile = await findUserById(auth.userId);
  if (!profile) {
    sendError(res, 401, "unauthorized", "Not authenticated");
    return;
  }
  const user = await findUserByEmail(profile.email);
  if (!user) {
    sendError(res, 401, "unauthorized", "Not authenticated");
    return;
  }
  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) {
    sendError(res, 401, "invalid_credentials", "Current password is incorrect");
    return;
  }

  await clearUserMfa(user.id);
  await insertAuditEvent({
    actorUserId: user.id,
    action: AUDIT_ACTIONS.mfaReset,
  });
  sendJson(res, 200, await sessionPayload({ id: user.id, email: user.email }));
}

/**
 * Confirm enroll or login step-up.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleMfaVerify(req, res) {
  const auth = await requireSession(req, res);
  if (!auth) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const code = typeof body?.code === "string" ? body.code : "";
  if (code.length < 6 || code.length > 8) {
    sendError(res, 401, "invalid_mfa", INVALID_MFA);
    return;
  }

  const user = await findUserMfaById(auth.userId);
  if (!user) {
    sendError(res, 401, "unauthenticated", "Not authenticated");
    return;
  }

  if (user.mfaPendingSecret) {
    if (!verifyTotp(user.mfaPendingSecret, code)) {
      sendError(res, 401, "invalid_mfa", INVALID_MFA);
      return;
    }
    await activatePendingMfa(user.id);
    await markSessionMfaVerified(auth.token);
    await insertAuditEvent({
      actorUserId: user.id,
      action: AUDIT_ACTIONS.mfaVerifyEnroll,
    });
    sendJson(res, 200, await sessionPayload(user));
    return;
  }

  if (user.mfaSecret) {
    if (!verifyTotp(user.mfaSecret, code)) {
      sendError(res, 401, "invalid_mfa", INVALID_MFA);
      return;
    }
    await markSessionMfaVerified(auth.token);
    await insertAuditEvent({
      actorUserId: user.id,
      action: AUDIT_ACTIONS.mfaVerifyLogin,
    });
    sendJson(res, 200, await sessionPayload(user));
    return;
  }

  sendError(res, 400, "mfa_not_started", "MFA enrollment has not been started");
}

/**
 * A2 — always 204; same response whether or not the email exists.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleForgotPassword(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  if (!email || !email.includes("@")) {
    sendError(res, 400, "invalid_request", "Valid email is required");
    return;
  }

  const user = await findUserByEmail(email);
  if (user) {
    const rawToken = await createPasswordResetToken(user.id);
    await insertAuditEvent({
      actorUserId: user.id,
      action: AUDIT_ACTIONS.passwordResetRequest,
    });
    const resetUrl = passwordResetUrl(rawToken);
    await sendPasswordResetEmail({ to: user.email, resetUrl });
    if (process.env.PASSWORD_RESET_EXPOSE_LINK === "true") {
      sendJson(res, 200, {
        resetPath: inviteRelativePathForToken(rawToken),
        resetUrl,
      });
      return;
    }
  }

  res.writeHead(204);
  res.end();
}

const PROFILE_LOCALES = new Set([
  "en",
  "zh-CN",
  "zh-TW",
  "ja",
  "ko",
  "vi",
  "th",
]);

function isValidIanaTimezone(tz) {
  if (typeof tz !== "string" || !tz.trim()) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * A10 — update display name, language, timezone, MFA preference, session TTL.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handlePatchProfile(req, res) {
  const auth = await requireSession(req, res);
  if (!auth) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  /** @type {{
   *   firstName?: string | null,
   *   lastName?: string | null,
   *   displayName?: string | null,
   *   avatarUrl?: string | null,
   *   locale?: string,
   *   timezone?: string,
   *   mfaEnforcement?: boolean,
   *   sessionTimeoutMinutes?: number,
   * }} */
  const patch = {};
  if (body?.firstName !== undefined) {
    if (body.firstName !== null && typeof body.firstName !== "string") {
      sendError(res, 400, "invalid_request", "firstName must be a string or null");
      return;
    }
    patch.firstName = body.firstName;
  }
  if (body?.lastName !== undefined) {
    if (body.lastName !== null && typeof body.lastName !== "string") {
      sendError(res, 400, "invalid_request", "lastName must be a string or null");
      return;
    }
    patch.lastName = body.lastName;
  }
  if (body?.displayName !== undefined) {
    if (body.displayName !== null && typeof body.displayName !== "string") {
      sendError(res, 400, "invalid_request", "displayName must be a string or null");
      return;
    }
    patch.displayName = body.displayName;
  }
  if (body?.avatarUrl !== undefined) {
    if (body.avatarUrl !== null && typeof body.avatarUrl !== "string") {
      sendError(res, 400, "invalid_request", "avatarUrl must be a string or null");
      return;
    }
    if (body.avatarUrl !== null && !isUserAvatarValue(body.avatarUrl)) {
      sendError(
        res,
        400,
        "invalid_request",
        "avatarUrl must be a small PNG/JPEG/WebP/GIF image",
      );
      return;
    }
    patch.avatarUrl = body.avatarUrl;
  }
  if (body?.locale !== undefined) {
    if (typeof body.locale !== "string" || !PROFILE_LOCALES.has(body.locale)) {
      sendError(
        res,
        400,
        "invalid_request",
        `locale must be one of ${[...PROFILE_LOCALES].join(", ")}`,
      );
      return;
    }
    patch.locale = body.locale;
  }
  if (body?.timezone !== undefined) {
    if (typeof body.timezone !== "string" || !isValidIanaTimezone(body.timezone)) {
      sendError(res, 400, "invalid_request", "timezone must be a valid IANA timezone");
      return;
    }
    patch.timezone = body.timezone;
  }
  if (body?.mfaEnforcement !== undefined) {
    if (typeof body.mfaEnforcement !== "boolean") {
      sendError(res, 400, "invalid_request", "mfaEnforcement must be a boolean");
      return;
    }
    patch.mfaEnforcement = body.mfaEnforcement;
  }
  if (body?.sessionTimeoutMinutes !== undefined) {
    const mins = Number(body.sessionTimeoutMinutes);
    if (!ALLOWED_SESSION_TIMEOUT_MINUTES.includes(mins)) {
      sendError(
        res,
        400,
        "invalid_request",
        `sessionTimeoutMinutes must be one of ${ALLOWED_SESSION_TIMEOUT_MINUTES.join(", ")}`,
      );
      return;
    }
    patch.sessionTimeoutMinutes = mins;
  }
  if (Object.keys(patch).length === 0) {
    sendError(res, 400, "invalid_request", "No profile fields to update");
    return;
  }

  let updated;
  try {
    updated = await updateUserProfile(auth.userId, patch);
  } catch (err) {
    if (err && err.code === "avatar_invalid") {
      sendError(res, 400, "invalid_request", err.message);
      return;
    }
    throw err;
  }
  if (!updated) {
    sendError(res, 401, "unauthorized", "Not authenticated");
    return;
  }
  await insertAuditEvent({
    actorUserId: auth.userId,
    action: AUDIT_ACTIONS.profileUpdate,
    metadata: {
      displayName: updated.displayName,
      hasAvatar: Boolean(updated.avatarUrl),
      locale: updated.locale,
      timezone: updated.timezone,
      mfaEnforcement: updated.mfaEnforcement,
      sessionTimeoutMinutes: updated.sessionTimeoutMinutes,
    },
  });
  try {
    const { maybeCreateActivationAfterUserSetup } = await import(
      "../service-bills/activation.mjs"
    );
    await maybeCreateActivationAfterUserSetup(auth.userId);
  } catch {
    /* best-effort */
  }
  sendJson(res, 200, await sessionPayload(updated));
}

/**
 * Logged-in password change (also clears must_change_password).
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleChangePassword(req, res) {
  const auth = await requireSession(req, res);
  if (!auth) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const currentPassword =
    typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
  if (!currentPassword || !newPassword) {
    sendError(res, 400, "invalid_request", "currentPassword and newPassword are required");
    return;
  }

  const policy = validatePasswordReset(newPassword);
  if (!policy.ok) {
    sendError(res, 400, policy.code, policy.message);
    return;
  }

  const profile = await findUserById(auth.userId);
  if (!profile) {
    sendError(res, 401, "unauthorized", "Not authenticated");
    return;
  }
  const user = await findUserByEmail(profile.email);
  if (!user) {
    sendError(res, 401, "unauthorized", "Not authenticated");
    return;
  }
  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) {
    sendError(res, 401, "invalid_credentials", "Current password is incorrect");
    return;
  }

  await updateUserPassword(user.id, newPassword);
  await insertAuditEvent({
    actorUserId: user.id,
    action: AUDIT_ACTIONS.passwordResetComplete,
  });
  const next = await findUserById(user.id);
  sendJson(res, 200, await sessionPayload(next ?? { id: user.id, email: user.email }));
}

/**
 * A3 — reset password with a one-time token.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleResetPassword(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!token || !password) {
    sendError(res, 400, "invalid_request", "Token and password are required");
    return;
  }

  const policy = validatePasswordReset(password);
  if (!policy.ok) {
    sendError(res, 400, policy.code, policy.message);
    return;
  }

  const match = await findValidPasswordReset(token);
  if (!match) {
    sendError(res, 410, "token_expired", "This reset link has expired or is invalid");
    return;
  }

  await updateUserPassword(match.userId, password);
  await markPasswordResetUsed(token);
  await markEmailVerified(match.userId);
  await insertAuditEvent({
    actorUserId: match.userId,
    action: AUDIT_ACTIONS.passwordResetComplete,
  });
  res.writeHead(204);
  res.end();
}

/**
 * GET /v1/auth/pos-pin — whether the signed-in user has a dashboard POS PIN.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleGetPosPinStatus(req, res) {
  const auth = await requireSession(req, res);
  if (!auth) return;
  const configured = await userHasPosPin(auth.userId);
  sendJson(res, 200, { configured });
}

/**
 * PUT /v1/auth/pos-pin — set/replace POS unlock PIN (web dashboard).
 * Body: { pin, currentPin? }
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handlePutPosPin(req, res) {
  const auth = await requireSession(req, res);
  if (!auth) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const pin = typeof body?.pin === "string" ? body.pin.trim() : "";
  const currentPin =
    typeof body?.currentPin === "string" ? body.currentPin.trim() : "";
  const check = validatePosPin(pin);
  if (!check.ok) {
    sendError(res, 400, check.code, check.message);
    return;
  }

  const has = await userHasPosPin(auth.userId);
  if (has) {
    if (!currentPin) {
      sendError(
        res,
        400,
        "current_pin_required",
        "currentPin is required to replace an existing POS PIN",
      );
      return;
    }
    const okCurrent = await verifyUserPosPin(auth.userId, currentPin);
    if (!okCurrent) {
      sendError(res, 401, "invalid_pos_pin", "Current POS PIN is incorrect");
      return;
    }
  }

  await setUserPosPin(auth.userId, pin);
  await insertAuditEvent({
    actorUserId: auth.userId,
    action: AUDIT_ACTIONS.posPinSet,
  });
  sendJson(res, 200, { configured: true });
}

/**
 * DELETE /v1/auth/pos-pin — clear dashboard POS PIN.
 * Body: { currentPin }
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleDeletePosPin(req, res) {
  const auth = await requireSession(req, res);
  if (!auth) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }
  const currentPin =
    typeof body?.currentPin === "string" ? body.currentPin.trim() : "";
  if (!currentPin) {
    sendError(res, 400, "invalid_request", "currentPin is required");
    return;
  }
  const has = await userHasPosPin(auth.userId);
  if (!has) {
    sendJson(res, 200, { configured: false });
    return;
  }
  const ok = await verifyUserPosPin(auth.userId, currentPin);
  if (!ok) {
    sendError(res, 401, "invalid_pos_pin", "Current POS PIN is incorrect");
    return;
  }
  await clearUserPosPin(auth.userId);
  await insertAuditEvent({
    actorUserId: auth.userId,
    action: AUDIT_ACTIONS.posPinClear,
  });
  sendJson(res, 200, { configured: false });
}

/**
 * POST /v1/auth/pos-pin/verify — unlock POS while session cookie is valid.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleVerifyPosPin(req, res) {
  const auth = await requireSession(req, res);
  if (!auth) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }
  const pin = typeof body?.pin === "string" ? body.pin.trim() : "";
  const check = validatePosPin(pin);
  if (!check.ok) {
    sendError(res, 400, check.code, check.message);
    return;
  }
  const has = await userHasPosPin(auth.userId);
  if (!has) {
    sendError(
      res,
      404,
      "pos_pin_not_configured",
      "Set a POS PIN on the web dashboard first",
    );
    return;
  }
  const ok = await verifyUserPosPin(auth.userId, pin);
  if (!ok) {
    sendError(res, 401, "invalid_pos_pin", "Incorrect PIN. Try again.");
    return;
  }
  await insertAuditEvent({
    actorUserId: auth.userId,
    action: AUDIT_ACTIONS.posPinVerify,
  });
  sendJson(res, 200, { ok: true });
}
