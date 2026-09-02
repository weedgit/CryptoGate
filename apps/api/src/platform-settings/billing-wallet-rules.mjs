import { looksLikeSpendKey } from "../security/spend-material.mjs";
import { isTronReceiveAddress } from "@paymentgate/domain";

/**
 * @param {unknown} body
 * @returns {{
 *   ok: true,
 *   sellerName: string,
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
      if (looksLikeSpendKey(raw)) {
        return {
          ok: false,
          status: 400,
          code: "invalid_request",
          message:
            "payTo must be a public receive address — private keys and mnemonics are rejected",
        };
      }
      if (!isTronReceiveAddress(raw)) {
        return {
          ok: false,
          status: 400,
          code: "invalid_request",
          message: "payTo must be a Tron (TRC-20) USDT receive address",
        };
      }
      payTo = raw;
    }
  }

  return { ok: true, sellerName, payTo };
}
