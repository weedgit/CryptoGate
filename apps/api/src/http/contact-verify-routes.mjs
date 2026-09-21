import { findUserById, markEmailVerified, markPhoneVerified, setUserPhone } from "../auth/users.mjs";
import {
  consumeContactOtp,
  echoOtpInHttp,
  issueContactOtp,
  normalizePhone,
} from "../auth/contact-otp-store.mjs";
import { sessionFromUserWithSetup } from "../auth/session-payload.mjs";
import { sendEmailOtp } from "../mail/auth-mail.mjs";
import { sendSms } from "../sms/sms-send.mjs";
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
 * POST /v1/auth/contact/email/send
 */
export async function handleSendEmailOtp(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const user = await findUserById(caller.userId);
  if (!user) {
    sendError(res, 401, "unauthenticated", "Not authenticated");
    return;
  }
  if (user.emailVerified) {
    sendJson(res, 200, { status: "already_verified", session: await sessionJson(user) });
    return;
  }

  const issued = await issueContactOtp(user.id, "email", user.email);
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

  await sendEmailOtp({ to: user.email, code: issued.code });
  await insertAuditEvent({
    actorUserId: user.id,
    action: AUDIT_ACTIONS.contactEmailOtpSend,
  });
  sendJson(res, 200, {
    status: "sent",
    expiresAt: issued.expiresAt.toISOString(),
    ...otpEcho(issued),
  });
}

/**
 * POST /v1/auth/contact/email/verify
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
  if (result === "ok") {
    await markEmailVerified(caller.userId);
    await insertAuditEvent({
      actorUserId: caller.userId,
      action: AUDIT_ACTIONS.contactEmailVerified,
    });
    const user = await findUserById(caller.userId);
    sendJson(res, 200, await sessionJson(user));
    return;
  }
  if (result === "locked") {
    sendError(res, 429, "otp_locked", "Too many attempts. Request a new code.");
    return;
  }
  if (result === "expired") {
    sendError(res, 410, "otp_expired", "This code has expired. Request a new one.");
    return;
  }
  sendError(res, 400, "otp_invalid", "Invalid verification code");
}

/**
 * POST /v1/auth/contact/phone/send
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

  const phone = normalizePhone(body?.phone) ?? (user.phone && normalizePhone(user.phone));
  if (!phone) {
    sendError(
      res,
      400,
      "invalid_phone",
      "Enter a mobile number in international format, for example +6591234567",
    );
    return;
  }

  if (user.phoneVerified && user.phone === phone) {
    sendJson(res, 200, { status: "already_verified", session: await sessionJson(user) });
    return;
  }

  try {
    await setUserPhone(user.id, phone);
  } catch (err) {
    if (err && err.code === "phone_taken") {
      sendError(res, 409, "phone_taken", err.message);
      return;
    }
    throw err;
  }

  const issued = await issueContactOtp(user.id, "phone", phone);
  if (issued.resentTooSoon) {
    res.setHeader("Retry-After", String(issued.retryAfterSec ?? 45));
    sendError(res, 429, "otp_cooldown", "Wait before requesting another SMS code");
    return;
  }

  await sendSms({
    to: phone,
    text: `PaymentGate code: ${issued.code}. It expires in 10 minutes.`,
  });
  await insertAuditEvent({
    actorUserId: user.id,
    action: AUDIT_ACTIONS.contactPhoneOtpSend,
    metadata: { phone },
  });
  sendJson(res, 200, {
    status: "sent",
    phone,
    expiresAt: issued.expiresAt.toISOString(),
    ...otpEcho(issued),
  });
}

/**
 * POST /v1/auth/contact/phone/verify
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
  if (result === "ok") {
    await markPhoneVerified(caller.userId);
    await insertAuditEvent({
      actorUserId: caller.userId,
      action: AUDIT_ACTIONS.contactPhoneVerified,
    });
    const user = await findUserById(caller.userId);
    sendJson(res, 200, await sessionJson(user));
    return;
  }
  if (result === "locked") {
    sendError(res, 429, "otp_locked", "Too many attempts. Request a new code.");
    return;
  }
  if (result === "expired") {
    sendError(res, 410, "otp_expired", "This code has expired. Request a new one.");
    return;
  }
  sendError(res, 400, "otp_invalid", "Invalid verification code");
}
