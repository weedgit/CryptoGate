/**
 * Transactional mail — stub by default; SMTP when MAIL_TRANSPORT=smtp.
 */
import { createRequire } from "node:module";
import { getSmtpConfig, isOutboundMailConfigured } from "./mail-config.mjs";

const require = createRequire(import.meta.url);

/**
 * @param {{ to: string, subject: string, text: string }} message
 * @returns {Promise<{ delivered: boolean, mode: "stub" | "smtp" }>}
 */
async function sendTransactionalEmail(message) {
  const to = typeof message?.to === "string" ? message.to : "";
  const subject = typeof message?.subject === "string" ? message.subject : "";
  const text = typeof message?.text === "string" ? message.text : "";

  if (!isOutboundMailConfigured()) {
    console.info(`[mail:stub] to=${to} subject=${subject}`);
    return { delivered: false, mode: "stub" };
  }

  const cfg = getSmtpConfig();
  if (!cfg) {
    console.info(`[mail:stub] to=${to} subject=${subject}`);
    return { delivered: false, mode: "stub" };
  }

  let nodemailer;
  try {
    nodemailer = require("nodemailer");
  } catch {
    console.warn(
      `[mail:unwired] MAIL_TRANSPORT=smtp but nodemailer is not installed; not sending to=${to}`,
    );
    return { delivered: false, mode: "stub" };
  }

  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass ?? "" } : undefined,
  });

  try {
    await transport.sendMail({
      from: cfg.from,
      to,
      subject,
      text,
    });
    console.info(`[mail:smtp] to=${to} subject=${subject}`);
    return { delivered: true, mode: "smtp" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[mail:smtp] send failed to=${to}: ${msg}`);
    return { delivered: false, mode: "smtp" };
  }
}

/**
 * @param {{
 *   to: string,
 *   orgName: string,
 *   role: string,
 *   temporaryPassword: string,
 *   inviteUrl: string,
 *   loginUrl?: string,
 * }} input
 */
export async function sendInviteEmail(input) {
  const text = [
    `You were invited to ${input.orgName} as ${input.role}.`,
    `Temporary password: ${input.temporaryPassword}`,
    `Open: ${input.inviteUrl}`,
    input.loginUrl ? `Login: ${input.loginUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return sendTransactionalEmail({
    to: input.to,
    subject: `PaymentGate invite — ${input.orgName}`,
    text,
  });
}

/**
 * @param {{ to: string, resetUrl: string }} input
 */
export async function sendPasswordResetEmail(input) {
  return sendTransactionalEmail({
    to: input.to,
    subject: "PaymentGate password reset",
    text: `Reset your password: ${input.resetUrl}`,
  });
}

/**
 * @param {{ to: string, code: string }} input
 */
export async function sendEmailOtp(input) {
  return sendTransactionalEmail({
    to: input.to,
    subject: "PaymentGate email verification",
    text: `Your verification code is ${input.code}. It expires in 10 minutes.`,
  });
}

/**
 * Notify-only alert to the previous verified email (no OTP). Best-effort.
 * @param {{
 *   to: string,
 *   phase: "requested" | "completed",
 *   newEmail?: string,
 * }} input
 */
export async function sendEmailChangeNotice(input) {
  const phase = input.phase === "completed" ? "completed" : "requested";
  if (phase === "completed") {
    const next = input.newEmail ? ` New login email: ${input.newEmail}.` : "";
    return sendTransactionalEmail({
      to: input.to,
      subject: "PaymentGate email address changed",
      text: `Your PaymentGate login email was changed.${next} If you did not do this, contact support immediately.`,
    });
  }
  return sendTransactionalEmail({
    to: input.to,
    subject: "PaymentGate email change requested",
    text: "A request was made to change your PaymentGate login email. A verification code was sent to the new address. Your current email stays active until that code is confirmed. If you did not request this, contact support immediately.",
  });
}
