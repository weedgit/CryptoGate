/**
 * Outbound mail is stubbed until a real transport is implemented (Phase 1).
 * Setting SMTP_HOST alone must NOT flip notification emailAvailable — auth-mail
 * still logs `[mail:unwired]` and does not send.
 */
export function isOutboundMailConfigured() {
  // Flip to true only after nodemailer (or similar) is wired behind MAIL_TRANSPORT=smtp.
  if (process.env.MAIL_TRANSPORT !== "smtp") return false;
  const host =
    process.env.SMTP_HOST?.trim() ||
    process.env.MAIL_SMTP_HOST?.trim() ||
    "";
  return host.length > 0;
}
