/**
 * Outbound SMS. Stub by default; Twilio when SMS_TRANSPORT=twilio.
 *
 * SMS_TRANSPORT=twilio
 * TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
 */

function isTwilioConfigured() {
  if (process.env.SMS_TRANSPORT !== "twilio") return false;
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_FROM?.trim(),
  );
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

  const sid = process.env.TWILIO_ACCOUNT_SID.trim();
  const token = process.env.TWILIO_AUTH_TOKEN.trim();
  const from = process.env.TWILIO_FROM.trim();
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
  const body = new URLSearchParams({ To: to, From: from, Body: text });
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");

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
