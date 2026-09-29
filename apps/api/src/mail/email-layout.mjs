/**
 * Shared HTML building blocks for outbound mail (account mail and alerts).
 */

/** @param {string} value */
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const FONT = "Arial,Helvetica,sans-serif";

/** @param {string} html */
export function para(html, color = "#334155") {
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:22px;color:${color};">${html}</p>`;
}

/** @param {string} url @param {string} label */
export function button(url, label) {
  const href = escapeHtml(url);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr><td style="border-radius:8px;background:#0d9488;"><a href="${href}" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a></td></tr></table>`;
}

/** @param {string} value @param {{ large?: boolean }} [opts] */
export function valueBox(value, opts = {}) {
  const size = opts.large ? "32px;line-height:40px;letter-spacing:8px" : "18px;line-height:26px;letter-spacing:1px";
  return `<div style="display:inline-block;margin:0 0 24px;padding:${opts.large ? "14px 28px" : "10px 16px"};background:#f0fdfa;border:1px solid #99f6e4;border-radius:10px;font-family:'Courier New',Courier,monospace;font-size:${size};font-weight:700;color:#0f172a;word-break:break-all;">${escapeHtml(value)}</div>`;
}

/** @param {string} url */
export function fallbackLink(url) {
  const href = escapeHtml(url);
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:13px;line-height:20px;color:#64748b;">If the button doesn't work, copy this link into your browser:<br><a href="${href}" style="color:#0d9488;word-break:break-all;">${href}</a></p>`;
}

/**
 * Shared shell for account mail. Plain structure, no images or tracking:
 * a new sender's bare text-and-links mail is what spam filters flag.
 * @param {{ title: string, preheader: string, heading: string, body: string, footer: string, footerHtml?: string }} parts
 */
export function renderLayout(parts) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(parts.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(parts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
<tr><td style="padding:24px 32px;border-bottom:1px solid #e2e8f0;font-family:${FONT};font-size:18px;font-weight:700;color:#0f172a;">
<span style="color:#0d9488;">&#9679;</span>&nbsp;PaymentGate
</td></tr>
<tr><td style="padding:32px 32px 16px;">
<h1 style="margin:0 0 16px;font-family:${FONT};font-size:20px;line-height:28px;font-weight:700;color:#0f172a;">${escapeHtml(parts.heading)}</h1>
${parts.body}
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #e2e8f0;font-family:${FONT};font-size:12px;line-height:18px;color:#94a3b8;">
${escapeHtml(parts.footer)}${parts.footerHtml ? `<br>${parts.footerHtml}` : ""}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
