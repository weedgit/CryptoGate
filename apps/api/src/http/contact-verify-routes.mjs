import {
  findUserByEmail,
  findUserById,
  markEmailVerified,
  markPhoneVerified,
  normalizeEmail,
  setUserEmail,
  setUserPhone,
} from "../auth/users.mjs";
import {
  consumeContactOtp,
  echoOtpInHttp,
  issueContactOtp,
  normalizePhone,
  revokeContactOtp,
} from "../auth/contact-otp-store.mjs";
import { sessionFromUserWithSetup } from "../auth/session-payload.mjs";
import { sendEmailChangeNotice, sendEmailOtp } from "../mail/auth-mail.mjs";
import { sendPhoneChangeNotice, sendSms } from "../sms/sms-send.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import { listMembershipsForUser } from "../orgs/membership-store.mjs";
import { requireCaller } from "./require-caller.mjs";
import { readJsonBody, sendError, sendJson } from "./json.mjs";

async function sessionJson(user) {
  const memberships = await listMembershipsForUser(user.id);
  return sessionFromUserWithSetup(user, memberships);
}

function otpEcho(issued) {
  if (!echoOtpInHttp() || !issued.code) return {};
  return { devCode: issued.code };
}

/**
 * Outside dev echo, an undelivered code is useless to the user: retire it and
 * report the failure instead of claiming it was sent.
 * @returns {Promise<boolean>} true when the error response was sent
 */
async function rejectUndelivered(res, userId, channel, sent) {
  if (sent?.delivered || echoOtpInHttp()) return false;
  await revokeContactOtp(userId, channel);
  await insertAuditEvent({
    actorUserId: userId,
    action:
      channel === "email"
        ? AUDIT_ACTIONS.contactEmailOtpSend
        : AUDIT_ACTIONS.contactPhoneOtpSend,
    metadata: { delivered: false, transport: sent?.mode ?? "unknown" },
  });
  sendError(
    res,
    503,
    "otp_delivery_failed",
    channel === "email"
      ? "We couldn't send the email code. Try again in a minute or contact support."
      : "We couldn't send the SMS code. Check the number or try again in a minute.",
  );
  return true;
}

async function afterContactVerified(userId) {
  try {
    const { maybeCreateActivationAfterUserSetup } = await import(
      "../service-bills/activation.mjs"
    );
    await maybeCreateActivationAfterUserSetup(userId);
  } catch {
    /* activation is best-effort */
  }
}

/** Best-effort notify; never blocks the contact change. */
async function notifyOldEmail(to, phase, newEmail) {
  if (!to) return;
  try {
    await sendEmailChangeNotice({ to, phase, newEmail });
  } catch {
    /* ignore */
  }
}

/** Best-effort notify; never blocks the contact change. */
async function notifyOldPhone(to, phase, newPhone) {
  if (!to) return;
  try {
    await sendPhoneChangeNotice({ to, phase, newPhone });
  } catch {
    /* ignore */
  }
}

/**
 * POST /v1/auth/contact/email/send
 *
 * Body optional `{ email }`. OTP always goes to the **destination** address.
 * Current login email stays active until verify succeeds (Cognito-style pending).
 * On pending change, previous verified email gets a notify-only alert.
 */
export async function handleSendEmailOtp(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    /* empty body is fine for re-send to current email */
  }

  const user = await findUserById(caller.userId);
  if (!user) {
    sendError(res, 401, "unauthenticated", "Not authenticated");
    return;
  }

  const requested =
    typeof body?.email === "string" && body.email.trim()
      ? normalizeEmail(body.email)
      : null;
  const destination = requested ?? normalizeEmail(user.email);

  if (!destination || !destination.includes("@") || destination.length > 254) {
    sendError(res, 400, "invalid_email", "Enter a valid email address");
    return;
  }

  const currentEmail = normalizeEmail(user.email);
  const isChange = destination !== currentEmail;

  if (user.emailVerified && !isChange) {
    sendJson(res, 200, {
      status: "already_verified",
      session: await sessionJson(user),
    });
    return;
  }

  if (isChange) {
    const taken = await findUserByEmail(destination);
    if (taken && taken.id !== user.id) {
      sendError(res, 409, "email_taken", "This email is already registered");
      return;
    }
  }

  const issued = await issueContactOtp(user.id, "email", destination);
  if (issued.resentTooSoon) {
    res.setHeader("Retry-After", String(issued.retryAfterSec ?? 45));
    sendError(
      res,
      429,
      "otp_cooldown",
      "Wait before requesting another email code",
    );
    return;
  }

  const sent = await sendEmailOtp({ to: destination, code: issued.code });
  if (await rejectUndelivered(res, user.id, "email", sent)) return;
  if (isChange && user.emailVerified && currentEmail) {
    await notifyOldEmail(currentEmail, "requested");
  }
  await insertAuditEvent({
    actorUserId: user.id,
    action: AUDIT_ACTIONS.contactEmailOtpSend,
    metadata: {
      email: destination,
      pendingChange: isChange,
      notifiedOld: Boolean(isChange && user.emailVerified && currentEmail),
    },
  });
  sendJson(res, 200, {
    status: "sent",
    email: destination,
    pendingChange: isChange,
    expiresAt: issued.expiresAt.toISOString(),
    session: await sessionJson(user),
    ...otpEcho(issued),
  });
}

/**
 * POST /v1/auth/contact/email/verify
 * Applies pending email (if any) then marks verified.
 * On swap, previous email gets a notify-only completion alert.
 */
export async function handleVerifyEmailOtp(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }
  const code = typeof body?.code === "string" ? body.code : "";
  const result = await consumeContactOtp(caller.userId, "email", code);
  if (result.status === "ok") {
    const destination = normalizeEmail(result.destination);
    if (!destination || !destination.includes("@")) {
      sendError(res, 400, "otp_invalid", "Invalid verification code");
      return;
    }
    let user = await findUserById(caller.userId);
    if (!user) {
      sendError(res, 401, "unauthenticated", "Not authenticated");
      return;
    }
    const previousEmail = normalizeEmail(user.email);
    const swapped = destination !== previousEmail;
    if (swapped) {
      try {
        await setUserEmail(user.id, destination);
      } catch (err) {
        if (err && err.code === "email_taken") {
          sendError(res, 409, "email_taken", err.message);
          return;
        }
        if (err && err.code === "email_invalid") {
          sendError(res, 400, "invalid_email", err.message);
          return;
        }
        throw err;
      }
    }
    await markEmailVerified(caller.userId);
    if (swapped && previousEmail) {
      await notifyOldEmail(previousEmail, "completed", destination);
    }
    await insertAuditEvent({
      actorUserId: caller.userId,
      action: AUDIT_ACTIONS.contactEmailVerified,
      metadata: {
        email: destination,
        swapped,
        notifiedOld: Boolean(swapped && previousEmail),
      },
    });
    user = await findUserById(caller.userId);
    await afterContactVerified(caller.userId);
    sendJson(res, 200, await sessionJson(user));
    return;
  }
  if (result.status === "locked") {
    sendError(res, 429, "otp_locked", "Too many attempts. Request a new code.");
    return;
  }
  if (result.status === "expired") {
    sendError(res, 410, "otp_expired", "This code has expired. Request a new one.");
    return;
  }
  sendError(res, 400, "otp_invalid", "Invalid verification code");
}

/**
 * POST /v1/auth/contact/phone/send
 * OTP to the **new** number; current verified phone stays until verify.
 * On pending change, previous verified phone gets a notify-only alert.
 */
export async function handleSendPhoneOtp(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const user = await findUserById(caller.userId);
  if (!user) {
    sendError(res, 401, "unauthenticated", "Not authenticated");
    return;
  }

  const destination =
    normalizePhone(body?.phone) ?? (user.phone && normalizePhone(user.phone));
  if (!destination) {
    sendError(
      res,
      400,
      "invalid_phone",
      "Enter a mobile number in international format, for example +6591234567",
    );
    return;
  }

  const current = user.phone && normalizePhone(user.phone);
  const isChange = Boolean(current && destination !== current);

  if (user.phoneVerified && current && destination === current) {
    sendJson(res, 200, {
      status: "already_verified",
      session: await sessionJson(user),
    });
    return;
  }

  const issued = await issueContactOtp(user.id, "phone", destination);
  if (issued.resentTooSoon) {
    res.setHeader("Retry-After", String(issued.retryAfterSec ?? 45));
    sendError(res, 429, "otp_cooldown", "Wait before requesting another SMS code");
    return;
  }
  if (issued.destinationLimited) {
    res.setHeader("Retry-After", String(issued.retryAfterSec ?? 3600));
    sendError(
      res,
      429,
      "otp_destination_limit",
      "Too many codes were sent to this number. Try again later.",
    );
    return;
  }

  const sent = await sendSms({
    to: destination,
    text: `PaymentGate code: ${issued.code}. It expires in 10 minutes.`,
  });
  if (await rejectUndelivered(res, user.id, "phone", sent)) return;
  if (isChange && user.phoneVerified && current) {
    await notifyOldPhone(current, "requested");
  }
  await insertAuditEvent({
    actorUserId: user.id,
    action: AUDIT_ACTIONS.contactPhoneOtpSend,
    metadata: {
      phone: destination,
      pendingChange: isChange,
      notifiedOld: Boolean(isChange && user.phoneVerified && current),
    },
  });
  sendJson(res, 200, {
    status: "sent",
    phone: destination,
    pendingChange: isChange,
    expiresAt: issued.expiresAt.toISOString(),
    session: await sessionJson(user),
    ...otpEcho(issued),
  });
}

/**
 * POST /v1/auth/contact/phone/verify
 * Applies pending phone then marks verified.
 * On swap, previous phone gets a notify-only completion alert.
 */
export async function handleVerifyPhoneOtp(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }
  const code = typeof body?.code === "string" ? body.code : "";
  const result = await consumeContactOtp(caller.userId, "phone", code);
  if (result.status === "ok") {
    const destination = normalizePhone(result.destination);
    if (!destination) {
      sendError(res, 400, "otp_invalid", "Invalid verification code");
      return;
    }
    let user = await findUserById(caller.userId);
    if (!user) {
      sendError(res, 401, "unauthenticated", "Not authenticated");
      return;
    }
    const current = user.phone && normalizePhone(user.phone);
    const swapped = Boolean(current && destination !== current);
    if (destination !== current) {
      await setUserPhone(user.id, destination);
    }
    await markPhoneVerified(caller.userId);
    if (swapped && current) {
      await notifyOldPhone(current, "completed", destination);
    }
    await insertAuditEvent({
      actorUserId: caller.userId,
      action: AUDIT_ACTIONS.contactPhoneVerified,
      metadata: {
        phone: destination,
        swapped,
        notifiedOld: Boolean(swapped && current),
      },
    });
    user = await findUserById(caller.userId);
    await afterContactVerified(caller.userId);
    sendJson(res, 200, await sessionJson(user));
    return;
  }
  if (result.status === "locked") {
    sendError(res, 429, "otp_locked", "Too many attempts. Request a new code.");
    return;
  }
  if (result.status === "expired") {
    sendError(res, 410, "otp_expired", "This code has expired. Request a new one.");
    return;
  }
  sendError(res, 400, "otp_invalid", "Invalid verification code");
}
