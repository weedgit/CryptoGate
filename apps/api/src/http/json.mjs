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

/**
 * Exact request bytes (HMAC hashes this, not a trimmed JSON view).
 * @param {import("node:http").IncomingMessage & { rawBody?: Buffer }} req
 * @returns {Promise<Buffer>}
 */
export async function readRawBody(req) {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
  const chunks = [];
  for await (const chunk of req) {
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
  return JSON.parse(raw);
}
