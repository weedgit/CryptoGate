import { authenticateUser, findUserById } from "../auth/users.mjs";
import { sessionFromUser } from "../auth/session-payload.mjs";
import {
  createSession,
  DEFAULT_SESSION_TTL_MS,
  extendSessionByToken,
  findActiveSessionByToken,
  revokeSessionByToken,
} from "../auth/sessions.mjs";
import {
  clearSessionCookie,
  getSessionToken,
  sessionCookie,
} from "./cookies.mjs";
import { readJsonBody, sendError, sendJson } from "./json.mjs";

const GENERIC_LOGIN_ERROR = "Invalid email or password";

function cookieMaxAgeSec() {
  return Math.floor(DEFAULT_SESSION_TTL_MS / 1000);
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

  const created = await createSession({ userId: user.id });
  res.setHeader("Set-Cookie", sessionCookie(created.token, { maxAgeSec: cookieMaxAgeSec() }));
  sendJson(res, 200, {
    session: sessionFromUser(user),
    mfaRequired: false,
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
  const token = getSessionToken(req.headers.cookie);
  if (!token) {
    sendError(res, 401, "unauthenticated", "Not authenticated");
    return;
  }

  const row = await findActiveSessionByToken(token);
  if (!row) {
    sendError(res, 401, "unauthenticated", "Not authenticated");
    return;
  }

  const user = await findUserById(row.userId);
  if (!user) {
    sendError(res, 401, "unauthenticated", "Not authenticated");
    return;
  }

  await extendSessionByToken(token);
  res.setHeader(
    "Set-Cookie",
    sessionCookie(token, { maxAgeSec: cookieMaxAgeSec() }),
  );
  sendJson(res, 200, sessionFromUser(user));
}
