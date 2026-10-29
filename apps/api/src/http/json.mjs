/**
 * @param {import("node:http").ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
export function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  // Use statusCode + setHeader so CORS headers applied earlier stay intact.
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(payload);
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 * @param {{ maxAgeSec?: number, private?: boolean }} [cache]
 */
export function sendJsonCached(res, status, body, cache = {}) {
  const maxAge = cache.maxAgeSec ?? 15;
  const scope = cache.private === false ? "public" : "private";
  res.setHeader("Cache-Control", `${scope}, max-age=${maxAge}`);
  sendJson(res, status, body);
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {number} status
 * @param {string} code
 * @param {string} message
 */
export function sendError(res, status, code, message, details) {
  /** @type {{ code: string, message: string, details?: unknown }} */
  const body = { code, message };
  if (details !== undefined) body.details = details;
  sendJson(res, status, body);
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {number} status
 * @param {string} filename
 * @param {string} body
 */
export function sendCsv(res, status, filename, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.end(body);
}

/** Largest request body the API reads. */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

/**
 * Exact request bytes (HMAC hashes this, not a trimmed JSON view).
 * @param {import("node:http").IncomingMessage & { rawBody?: Buffer }} req
 * @returns {Promise<Buffer>}
 */
export async function readRawBody(req) {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    // Same ceiling as nginx (client_max_body_size 2m) for direct connections.
    if (size > MAX_BODY_BYTES) {
      throw Object.assign(new Error("Request body too large"), { code: "body_too_large" });
    }
    chunks.push(chunk);
  }
  req.rawBody = Buffer.concat(chunks);
  return req.rawBody;
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @returns {Promise<unknown>}
 */
export async function readJsonBody(req) {
  const raw = (await readRawBody(req)).toString("utf8").trim();
  if (raw === "") return {};
  // A cross-site <form> can only send text/plain, urlencoded or multipart bodies; requiring
  // JSON takes those CSRF vectors off every mutation (review D8).
  const type = String(req.headers?.["content-type"] ?? "").toLowerCase();
  if (!/^application\/([a-z0-9.+-]*\+)?json\b/.test(type)) {
    throw new SyntaxError("Request body must be application/json");
  }
  return JSON.parse(raw);
}
