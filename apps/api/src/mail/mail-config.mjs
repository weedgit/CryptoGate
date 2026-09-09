/**
 * Outbound mail config (Phase 1).
 *
 * Email is available only when:
 *   MAIL_TRANSPORT=smtp
 *   SMTP_HOST is set
 *
 * Optional: SMTP_PORT (default 587), SMTP_USER, SMTP_PASS, SMTP_FROM,
 * SMTP_SECURE=true for TLS on connect (port 465).
 */
export function isOutboundMailConfigured() {
  if (process.env.MAIL_TRANSPORT !== "smtp") return false;
  const host =
    process.env.SMTP_HOST?.trim() ||
    process.env.MAIL_SMTP_HOST?.trim() ||
    "";
  return host.length > 0;
}

/**
 * @returns {{
 *   host: string,
 *   port: number,
 *   secure: boolean,
 *   user: string | null,
 *   pass: string | null,
 *   from: string,
 * } | null}
 */
export function getSmtpConfig() {
  if (!isOutboundMailConfigured()) return null;
  const host =
    process.env.SMTP_HOST?.trim() ||
    process.env.MAIL_SMTP_HOST?.trim() ||
    "";
  const portRaw = process.env.SMTP_PORT?.trim() || "587";
  const port = Number.parseInt(portRaw, 10);
  const secure =
    process.env.SMTP_SECURE === "true" ||
    process.env.SMTP_SECURE === "1" ||
    port === 465;
  const user = process.env.SMTP_USER?.trim() || null;
  const pass = process.env.SMTP_PASS?.trim() || null;
  const from =
    process.env.SMTP_FROM?.trim() ||
    process.env.MAIL_FROM?.trim() ||
    (user ? user : "noreply@paymentgate.local");
  return {
    host,
    port: Number.isFinite(port) ? port : 587,
    secure,
    user,
    pass,
    from,
  };
}
