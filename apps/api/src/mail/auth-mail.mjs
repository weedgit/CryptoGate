/**
 * Transactional mail stubs. SMTP plugs in later — log locally for Phase 1.
 */
import { isOutboundMailConfigured } from "./mail-config.mjs";

/**
 * @param {{ to: string, subject: string, text: string }} message
 * @returns {Promise<{ delivered: boolean, mode: "stub" | "smtp" }>}
 */
async function sendTransactionalEmail(message) {
  const to = typeof message?.to === "string" ? message.to : "";
  const subject = typeof message?.subject === "string" ? message.subject : "";
  if (!isOutboundMailConfigured()) {
    console.info(`[mail:stub] to=${to} subject=${subject}`);
    return { delivered: false, mode: "stub" };
  }
  // SMTP_HOST is reserved for a real transport. Do not claim delivery.
  console.warn(
    `[mail:unwired] SMTP_HOST is set but no mail transport is implemented; not sending to=${to} subject=${subject}`,
  );
  return { delivered: false, mode: "stub" };
}

/**
 * @param {{
 *   to: string,
 *   orgName: string,
 *   role: string,
 *   temporaryPassword: string,
 *   inviteUrl: string,
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
