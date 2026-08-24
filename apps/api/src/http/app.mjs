import { getHealthPayload } from "../health-payload.mjs";
import {
  handleGetSession,
  handleLogin,
  handleLogout,
  handleMfaEnroll,
  handleMfaVerify,
} from "./auth-routes.mjs";
import { handleCreateOrg, handleGetOrg, handleListOrgs } from "../orgs/org-routes.mjs";
import { sendError, sendJson } from "./json.mjs";

/**
 * HTTP router for apps/api. Auth paths match OpenAPI servers.url `/v1`.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleRequest(req, res) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname;
  const method = req.method ?? "GET";

  if (method === "GET" && path === "/health") {
    const payload = await getHealthPayload({ checkDb: true });
    const code = payload.status === "ok" ? 200 : 503;
    sendJson(res, code, payload);
    return;
  }

  if (method === "GET" && path === "/") {
    sendJson(res, 200, { service: "cryptogate-api", health: "/health" });
    return;
  }

  if (method === "POST" && path === "/v1/auth/login") {
    await handleLogin(req, res);
    return;
  }

  if (method === "POST" && path === "/v1/auth/logout") {
    await handleLogout(req, res);
    return;
  }

  if (method === "GET" && path === "/v1/auth/session") {
    await handleGetSession(req, res);
    return;
  }

  if (method === "POST" && path === "/v1/auth/mfa/enroll") {
    await handleMfaEnroll(req, res);
    return;
  }

  if (method === "POST" && path === "/v1/auth/mfa/verify") {
    await handleMfaVerify(req, res);
    return;
  }

  if (method === "GET" && path === "/v1/orgs") {
    await handleListOrgs(req, res);
    return;
  }

  if (method === "POST" && path === "/v1/orgs") {
    await handleCreateOrg(req, res);
    return;
  }

  const orgMatch = path.match(/^\/v1\/orgs\/([^/]+)$/);
  if (method === "GET" && orgMatch) {
    await handleGetOrg(req, res, decodeURIComponent(orgMatch[1]));
    return;
  }

  sendError(res, 404, "not_found", "Not found");
}
