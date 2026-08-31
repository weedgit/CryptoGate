/**
 * Outbound mail is stubbed until SMTP env is configured (Phase 1).
 */
export function isOutboundMailConfigured() {
  const host =
    process.env.SMTP_HOST?.trim() ||
    process.env.MAIL_SMTP_HOST?.trim() ||
    "";
  return host.length > 0;
}
