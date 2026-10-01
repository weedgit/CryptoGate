/** Order sub-paths that share the `/v1/orders/{id}` shape but are not orders. */
const NON_ORDER_SEGMENTS = new Set(["summary", "exports"]);

/**
 * @param {string} path
 * @param {string} [suffix]
 */
function orderIdPath(path, suffix = "") {
  const match = path.match(new RegExp(`^/v1/orders/([^/]+)${suffix}$`));
  return Boolean(match && !NON_ORDER_SEGMENTS.has(match[1]));
}

/**
 * The only routes a PIN (terminal) session may call. Everything else is
 * `403 pos_session_scope`, Owners included.
 * @param {string} method
 * @param {string} path
 * @param {string | null} terminalOrgId
 */
export function isPosSessionPathAllowed(method, path, terminalOrgId) {
  const verb = (method || "GET").toUpperCase();
  if (verb === "GET") {
    if (path === "/v1/auth/session") return true;
    if (path === "/v1/orders") return true;
    if (orderIdPath(path) || orderIdPath(path, "/payment")) return true;
    if (path === "/v1/pos/terminal") return true;
    if (path === "/v1/network-maintenance") return true;
    if (path === "/v1/events") return true;
    if (terminalOrgId && path === `/v1/orgs/${terminalOrgId}/pos-settings`) return true;
    return false;
  }
  if (verb === "POST") {
    if (path === "/v1/auth/logout") return true;
    if (path === "/v1/orders") return true;
    if (orderIdPath(path, "/cancel")) return true;
    return path === "/v1/pos/unlock" || path === "/v1/pos/lock" || path === "/v1/pos/unbind";
  }
  return false;
}
