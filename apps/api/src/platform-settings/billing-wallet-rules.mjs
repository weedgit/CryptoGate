const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param {unknown} body
 * @returns {{
 *   ok: true,
 *   sellerName: string,
 *   sellerEmail: string | null,
 *   payTo: string | null,
 * } | {
 *   ok: false,
 *   status: number,
 *   code: string,
 *   message: string,
 * }}
 */
export function validateUpdateBillingWalletBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Request body must be a JSON object",
    };
  }

  const sellerName =
    typeof body.sellerName === "string" ? body.sellerName.trim() : "";
  if (!sellerName || sellerName.length > 200) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "sellerName is required (max 200 characters)",
    };
  }

  let sellerEmail = null;
  if (body.sellerEmail !== undefined && body.sellerEmail !== null) {
    if (typeof body.sellerEmail !== "string") {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: "sellerEmail must be a string or null",
      };
    }
    const email = body.sellerEmail.trim();
    if (email) {
      if (email.length > 254 || !EMAIL_RE.test(email)) {
        return {
          ok: false,
          status: 400,
          code: "invalid_request",
          message: "sellerEmail must be a valid email",
        };
      }
      sellerEmail = email;
    }
  }

  let payTo = null;
  if (body.payTo !== undefined && body.payTo !== null) {
    if (typeof body.payTo !== "string") {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: "payTo must be a string or null",
      };
    }
    const raw = body.payTo.trim();
    if (raw) {
      if (raw.length > 500) {
        return {
          ok: false,
          status: 400,
          code: "invalid_request",
          message: "payTo must be at most 500 characters",
        };
      }
      payTo = raw;
    }
  }

  return { ok: true, sellerName, sellerEmail, payTo };
}
