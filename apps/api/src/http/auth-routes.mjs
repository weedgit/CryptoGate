import {
  authenticateUser,
  findUserByEmail,
  findUserById,
  findUserMfaById,
  normalizeEmail,
  updateUserPassword,
} from "../auth/users.mjs";
import { verifyPassword } from "../auth/password-hash.mjs";
import { sessionFromUser } from "../auth/session-payload.mjs";
import { activatePendingMfa, setPendingMfaSecret } from "../auth/mfa.mjs";
import { generateTotpSecret, otpauthUrl, verifyTotp } from "../auth/totp.mjs";
import {
  createPasswordResetToken,
  findValidPasswordReset,
  markPasswordResetUsed,
} from "../auth/password-reset-store.mjs";
import { validatePasswordReset } from "../auth/password-policy.mjs";
import {
  createSession,
  DEFAULT_SESSION_TTL_MS,
  extendSessionByToken,
  findActiveSessionByToken,
  markSessionMfaVerified,
  revokeSessionByToken,
} from "../auth/sessions.mjs";
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
import { passwordResetUrl } from "../mail/portal-links.mjs";

const GENERIC_LOGIN_ERROR = "Invalid email or password";
const INVALID_MFA = "Invalid MFA code";

function cookieMaxAgeSec() {
  return Math.floor(DEFAULT_SESSION_TTL_MS / 1000);
}

function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", sessionCookie(token, { maxAgeSec: cookieMaxAgeSec() }));
}

async function sessionPayload(user) {
  const memberships = await listMembershipsForUser(user.id);
  const full = await findUserById(user.id);
  return sessionFromUser(
    {
      id: user.id,
      email: user.email,
      mustChangePassword:
        user.mustChangePassword === true || full?.mustChangePassword === true,
      mfaEnrolled: user.mfaEnrolled === true || full?.mfaEnrolled === true,
    },
    memberships,
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

  const created = await createSession({
    userId: user.id,
    mfaVerified: !user.mfaEnrolled,
  });
  await insertAuditEvent({
    actorUserId: user.id,
    action: AUDIT_ACTIONS.login,
  });
  setSessionCookie(res, created.token);
  sendJson(res, 200, {
    session: await sessionPayload(user),
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

  await extendSessionByToken(caller.token);
  setSessionCookie(res, caller.token);
  sendJson(res, 200, sessionFromUser(user, caller.memberships));
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

  const secret = generateTotpSecret();
  await setPendingMfaSecret(user.id, secret);
  await insertAuditEvent({
    actorUserId: user.id,
    action: AUDIT_ACTIONS.mfaEnroll,
  });
  sendJson(res, 200, {
    secret,
    otpauthUrl: otpauthUrl(user.email, secret),
  });
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
        resetPath: `/merchant/reset-password?token=${encodeURIComponent(rawToken)}`,
        resetUrl,
      });
      return;
    }
  }

  res.writeHead(204);
  res.end();
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
  sendJson(res, 200, await sessionPayload({ id: user.id, email: user.email }));
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
  await insertAuditEvent({
    actorUserId: match.userId,
    action: AUDIT_ACTIONS.passwordResetComplete,
  });
  res.writeHead(204);
  res.end();
}
