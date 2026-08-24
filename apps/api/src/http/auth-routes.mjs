import { authenticateUser, findUserById, findUserMfaById } from "../auth/users.mjs";
import { sessionFromUser } from "../auth/session-payload.mjs";
import { activatePendingMfa, setPendingMfaSecret } from "../auth/mfa.mjs";
import { generateTotpSecret, otpauthUrl, verifyTotp } from "../auth/totp.mjs";
import {
  createSession,
  DEFAULT_SESSION_TTL_MS,
  extendSessionByToken,
  markSessionMfaVerified,
  revokeSessionByToken,
} from "../auth/sessions.mjs";
import {
  clearSessionCookie,
  getSessionToken,
  sessionCookie,
} from "./cookies.mjs";
import { requireSession } from "./require-session.mjs";
import { readJsonBody, sendError, sendJson } from "./json.mjs";
import { listMembershipsForUser } from "../orgs/membership-store.mjs";

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
  return sessionFromUser(user, memberships);
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
    await revokeSessionByToken(token);
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
  const auth = await requireSession(req, res);
  if (!auth) return;

  const user = await findUserById(auth.userId);
  if (!user) {
    sendError(res, 401, "unauthenticated", "Not authenticated");
    return;
  }

  await extendSessionByToken(auth.token);
  setSessionCookie(res, auth.token);
  sendJson(res, 200, await sessionPayload(user));
}

/**
 * Start TOTP enrollment. Owner/Admin-only gating is M1-16.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleMfaEnroll(req, res) {
  const auth = await requireSession(req, res);
  if (!auth) return;

  const user = await findUserMfaById(auth.userId);
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
    sendJson(res, 200, await sessionPayload(user));
    return;
  }

  if (user.mfaSecret) {
    if (!verifyTotp(user.mfaSecret, code)) {
      sendError(res, 401, "invalid_mfa", INVALID_MFA);
      return;
    }
    await markSessionMfaVerified(auth.token);
    sendJson(res, 200, await sessionPayload(user));
    return;
  }

  sendError(res, 400, "mfa_not_started", "MFA enrollment has not been started");
}
