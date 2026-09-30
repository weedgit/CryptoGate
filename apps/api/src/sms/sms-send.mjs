/**
 * Outbound SMS. Stub by default; Twilio when SMS_TRANSPORT=twilio.
 *
 * SMS_TRANSPORT=twilio
 * TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
 * TWILIO_VERIFY_SERVICE_SID — verification codes via Twilio Verify (Twilio sends and checks the code)
 * TWILIO_FROM — optional sender number for plain SMS (phone-change notices)
 */

function twilioCredentials() {
  if (process.env.SMS_TRANSPORT !== "twilio") return null;
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) return null;
  return { sid, token, auth: Buffer.from(`${sid}:${token}`).toString("base64") };
}

function isTwilioConfigured() {
  return Boolean(twilioCredentials() && process.env.TWILIO_FROM?.trim());
}

function verifyServiceSid() {
  return twilioCredentials() ? process.env.TWILIO_VERIFY_SERVICE_SID?.trim() || null : null;
}

/** Phone codes are generated and checked by Twilio Verify instead of by us. */
export function usesTwilioVerify() {
  return Boolean(verifyServiceSid());
}

/**
 * @param {string} path e.g. "Verifications"
 * @param {Record<string, string>} params
 */
async function postVerify(path, params) {
  const creds = twilioCredentials();
  const service = verifyServiceSid();
  const url = `https://verify.twilio.com/v2/Services/${encodeURIComponent(service)}/${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds.auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON error body */
  }
  return { ok: res.ok, status: res.status, json };
}

/**
 * Ask Twilio Verify to text a code to `to`.
 * @param {string} to E.164
 * @returns {Promise<{ delivered: boolean, mode: "twilio_verify" }>}
 */
export async function startPhoneVerification(to) {
  try {
    const r = await postVerify("Verifications", { To: to, Channel: "sms" });
    if (!r.ok) {
      console.error(
        `[sms:verify] start failed to=${to} status=${r.status} code=${r.json?.code ?? ""} ${r.json?.message ?? ""}`,
      );
      return { delivered: false, mode: "twilio_verify" };
    }
    console.info(`[sms:verify] sent to=${to}`);
    return { delivered: true, mode: "twilio_verify" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[sms:verify] start failed to=${to}: ${msg}`);
    return { delivered: false, mode: "twilio_verify" };
  }
}

/**
 * Check a code with Twilio Verify. Throws when Twilio cannot be reached, so a
 * network failure is not counted as a wrong code.
 * @param {string} to E.164
 * @param {string} code
 * @returns {Promise<boolean>} true when approved
 */
export async function checkPhoneVerification(to, code) {
  const r = await postVerify("VerificationCheck", { To: to, Code: code });
  if (r.ok) return r.json?.status === "approved";
  // 404: no pending verification for this number (expired, approved, or too many checks).
  if (r.status === 404) return false;
  const err = new Error(`Twilio Verify check failed (${r.status}) ${r.json?.message ?? ""}`);
  err.code = "sms_verify_unavailable";
  throw err;
}

/**
 * Notify-only alert to the previous verified phone (no OTP). Best-effort.
 * @param {{
 *   to: string,
 *   phase: "requested" | "completed",
 *   newPhone?: string,
 * }} input
 */
export async function sendPhoneChangeNotice(input) {
  const phase = input.phase === "completed" ? "completed" : "requested";
  const text =
    phase === "completed"
      ? `PaymentGate: your phone was changed${input.newPhone ? ` to ${input.newPhone}` : ""}. If this was not you, contact support.`
      : "PaymentGate: a phone change was requested. A code was sent to the new number. Your current number stays active until confirmed. If this was not you, contact support.";
  return sendSms({ to: input.to, text });
}

/**
 * @param {{ to: string, text: string }} message
 * @returns {Promise<{ delivered: boolean, mode: "stub" | "twilio" }>}
 */
export async function sendSms(message) {
  const to = typeof message?.to === "string" ? message.to : "";
  const text = typeof message?.text === "string" ? message.text : "";

  if (!isTwilioConfigured()) {
    console.info(`[sms:stub] to=${to} text=${text}`);
    return { delivered: false, mode: "stub" };
  }

  const { sid, auth } = twilioCredentials();
  const from = process.env.TWILIO_FROM.trim();
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
  const body = new URLSearchParams({ To: to, From: from, Body: text });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[sms:twilio] send failed to=${to} status=${res.status} ${errText}`);
      return { delivered: false, mode: "twilio" };
    }
    console.info(`[sms:twilio] to=${to}`);
    return { delivered: true, mode: "twilio" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[sms:twilio] send failed to=${to}: ${msg}`);
    return { delivered: false, mode: "twilio" };
  }
}
