/**
 * Transactional mail — stub by default; SMTP when MAIL_TRANSPORT=smtp.
 */
import { createRequire } from "node:module";
import { getSmtpConfig, isOutboundMailConfigured } from "./mail-config.mjs";
import { button, escapeHtml, fallbackLink, para, renderLayout, valueBox } from "./email-layout.mjs";

const require = createRequire(import.meta.url);

/*
 * The SMTP provider rejects more than 10 messages per second. Bulk
 * notifications are spaced below that; account mail (codes, resets, invites)
 * skips the queue so a user never waits behind a fan-out, using the headroom.
 */
const pacing = { gapMs: 150, retryBaseMs: 1000, maxAttempts: 3 };
let nextBulkSendAt = 0;

/** @returns {number} ms to wait before this bulk send may start */
function reserveBulkSlot() {
  const now = Date.now();
  const at = Math.max(now, nextBulkSendAt);
  nextBulkSendAt = at + pacing.gapMs;
  return at - now;
}

/*
 * Reserved / seed domains never resolve. Sending there only produces bounces,
 * which damage the sending domain's reputation.
 */
const UNDELIVERABLE_TLDS = new Set([
  "test",
  "local",
  "localhost",
  "example",
  "invalid",
  "internal",
  "paymentgate",
]);
const UNDELIVERABLE_DOMAINS = new Set(["example.com", "example.net", "example.org"]);

/** @param {string} to */
export function isSuppressedRecipient(to) {
  const domain = String(to).trim().toLowerCase().split("@")[1] ?? "";
  if (!domain) return true;
  const extra = (process.env.MAIL_SUPPRESS_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (UNDELIVERABLE_DOMAINS.has(domain) || extra.includes(domain)) return true;
  return UNDELIVERABLE_TLDS.has(domain.split(".").pop() ?? "");
}

/** @param {unknown} err */
function isRateLimited(err) {
  const e = /** @type {{ responseCode?: number, message?: string }} */ (err ?? {});
  return e.responseCode === 429 || /too many requests|rate limit/i.test(e.message ?? "");
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Test hook. @param {Partial<typeof pacing>} next */
export function setMailPacingForTest(next) {
  Object.assign(pacing, next);
  nextBulkSendAt = 0;
}

/**
 * @param {{ to: string, subject: string, text: string, html?: string, headers?: Record<string, string> }} message
 * @param {{ bulk?: boolean }} [opts]
 * @returns {Promise<{ delivered: boolean, mode: "stub" | "smtp" | "suppressed" }>}
 */
async function sendTransactionalEmail(message, opts = {}) {
  const to = typeof message?.to === "string" ? message.to : "";
  const subject = typeof message?.subject === "string" ? message.subject : "";
  const text = typeof message?.text === "string" ? message.text : "";
  const html = typeof message?.html === "string" && message.html ? message.html : undefined;
  const headers = message?.headers && typeof message.headers === "object" ? message.headers : undefined;

  if (!isOutboundMailConfigured()) {
    console.info(`[mail:stub] to=${to} subject=${subject}`);
    return { delivered: false, mode: "stub" };
  }

  const cfg = getSmtpConfig();
  if (!cfg) {
    console.info(`[mail:stub] to=${to} subject=${subject}`);
    return { delivered: false, mode: "stub" };
  }

  if (isSuppressedRecipient(to)) {
    console.info(`[mail:suppressed] to=${to} subject=${subject}`);
    return { delivered: false, mode: "suppressed" };
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

  if (opts.bulk) {
    const wait = reserveBulkSlot();
    if (wait > 0) await sleep(wait);
  }

  for (let attempt = 1; ; attempt += 1) {
    try {
      await transport.sendMail({
        from: cfg.from,
        to,
        subject,
        text,
        ...(html ? { html } : {}),
        ...(headers ? { headers } : {}),
      });
      console.info(`[mail:smtp] to=${to} subject=${subject}`);
      return { delivered: true, mode: "smtp" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isRateLimited(err) && attempt < pacing.maxAttempts) {
        console.warn(`[mail:smtp] rate limited to=${to}; retry ${attempt}`);
        await sleep(pacing.retryBaseMs * attempt);
        continue;
      }
      console.error(`[mail:smtp] send failed to=${to}: ${msg}`);
      return { delivered: false, mode: "smtp" };
    }
  }
}

/**
 * Event notification (preference-gated by the caller).
 * @param {{ to: string, subject: string, text: string, html?: string, headers?: Record<string, string> }} message
 */
export async function sendNotificationEmail(message) {
  return sendTransactionalEmail(message, { bulk: true });
}

/** @param {string} role */
function roleLabel(role) {
  const r = String(role || "member").replace(/_/g, " ");
  return r.charAt(0).toUpperCase() + r.slice(1);
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
 * @returns {{ subject: string, text: string, html: string }}
 */
export function renderInviteEmail(input) {
  const org = String(input.orgName);
  const role = roleLabel(input.role);
  const subject = `You're invited to join ${org} on PaymentGate`;
  const footer = `This invitation was sent to ${input.to}. If you weren't expecting it, you can ignore this email.`;
  const text = [
    "PaymentGate",
    "",
    `You've been invited to join ${org} on PaymentGate as ${role}.`,
    "",
    `Set your password: ${input.inviteUrl}`,
    "",
    `Or sign in with this temporary password: ${input.temporaryPassword}`,
    input.loginUrl ? `Sign-in page: ${input.loginUrl}` : null,
    "Change the temporary password after your first sign-in.",
    "",
    footer,
  ]
    .filter((line) => line !== null)
    .join("\n");
  const body = [
    para(`You've been invited to join <strong>${escapeHtml(org)}</strong> on PaymentGate as <strong>${escapeHtml(role)}</strong>.`),
    para("Set a password to activate your account:"),
    button(input.inviteUrl, "Set your password"),
    para("Or sign in with this temporary password:", "#64748b"),
    valueBox(input.temporaryPassword),
    input.loginUrl
      ? para(`Sign-in page: <a href="${escapeHtml(input.loginUrl)}" style="color:#0d9488;">${escapeHtml(input.loginUrl)}</a>`, "#64748b")
      : "",
    para("Change the temporary password after your first sign-in.", "#64748b"),
    fallbackLink(input.inviteUrl),
  ].join("\n");
  const html = renderLayout({
    title: subject,
    preheader: `Join ${org} on PaymentGate as ${role}.`,
    heading: `Join ${org} on PaymentGate`,
    body,
    footer,
  });
  return { subject, text, html };
}

/** @param {Parameters<typeof renderInviteEmail>[0]} input */
export async function sendInviteEmail(input) {
  return sendTransactionalEmail({ to: input.to, ...renderInviteEmail(input) });
}

/**
 * @param {{ to: string, resetUrl: string }} input
 * @returns {{ subject: string, text: string, html: string }}
 */
export function renderPasswordResetEmail(input) {
  const subject = "Reset your PaymentGate password";
  const footer = `This email was sent to ${input.to} because a password reset was requested for a PaymentGate account.`;
  const text = [
    "PaymentGate",
    "",
    "We received a request to reset your PaymentGate password.",
    "",
    `Reset your password: ${input.resetUrl}`,
    "",
    "If you didn't request this, ignore this email. Your password stays the same.",
    "",
    footer,
  ].join("\n");
  const body = [
    para("We received a request to reset your PaymentGate password."),
    button(input.resetUrl, "Reset password"),
    para("If you didn't request this, ignore this email. Your password stays the same.", "#64748b"),
    fallbackLink(input.resetUrl),
  ].join("\n");
  const html = renderLayout({
    title: subject,
    preheader: "Use the link inside to choose a new password.",
    heading: "Reset your password",
    body,
    footer,
  });
  return { subject, text, html };
}

/** @param {{ to: string, resetUrl: string }} input */
export async function sendPasswordResetEmail(input) {
  return sendTransactionalEmail({ to: input.to, ...renderPasswordResetEmail(input) });
}

/**
 * @param {{ to: string, code: string }} input
 * @returns {{ subject: string, text: string, html: string }}
 */
export function renderEmailOtp(input) {
  const code = String(input.code);
  const subject = `${code} is your PaymentGate verification code`;
  const footer = `This email was sent to ${input.to} because a verification code was requested for a PaymentGate account.`;
  const text = [
    "PaymentGate",
    "",
    `Your verification code is: ${code}`,
    "",
    "Enter this code in PaymentGate to verify your email address. It expires in 10 minutes.",
    "",
    "If you didn't request this code, you can ignore this email. Your account stays unchanged.",
    "",
    footer,
  ].join("\n");
  const body = [
    para("Enter this code in PaymentGate to confirm this email address belongs to you."),
    `<div style="text-align:center;">${valueBox(code, { large: true })}</div>`,
    para("The code expires in <strong>10 minutes</strong>."),
    para("If you didn't request this code, you can ignore this email. Your account stays unchanged.", "#64748b"),
  ].join("\n");
  const html = renderLayout({
    title: subject,
    preheader: `Your PaymentGate verification code is ${code}. It expires in 10 minutes.`,
    heading: "Verify your email address",
    body,
    footer,
  });
  return { subject, text, html };
}

/** @param {{ to: string, code: string }} input */
export async function sendEmailOtp(input) {
  return sendTransactionalEmail({ to: input.to, ...renderEmailOtp(input) });
}

/**
 * Notify-only alert to the previous verified email (no OTP). Best-effort.
 * @param {{
 *   to: string,
 *   phase: "requested" | "completed",
 *   newEmail?: string,
 * }} input
 * @returns {{ subject: string, text: string, html: string }}
 */
export function renderEmailChangeNotice(input) {
  const completed = input.phase === "completed";
  const subject = completed
    ? "Your PaymentGate sign-in email was changed"
    : "Email change requested for your PaymentGate account";
  const lines = completed
    ? [
        `Your PaymentGate sign-in email was changed${input.newEmail ? ` to ${input.newEmail}` : ""}.`,
        "If you didn't make this change, contact support immediately.",
      ]
    : [
        "Someone asked to change the sign-in email on your PaymentGate account. A verification code was sent to the new address.",
        "Your current email keeps working until that code is confirmed. If you didn't request this, contact support immediately.",
      ];
  const footer = `This security notice was sent to ${input.to}, the email currently on the account.`;
  const text = ["PaymentGate", "", ...lines, "", footer].join("\n");
  const html = renderLayout({
    title: subject,
    preheader: lines[0],
    heading: completed ? "Sign-in email changed" : "Email change requested",
    body: lines.map((line, i) => para(escapeHtml(line), i === 0 ? "#334155" : "#64748b")).join("\n"),
    footer,
  });
  return { subject, text, html };
}

/** @param {Parameters<typeof renderEmailChangeNotice>[0]} input */
export async function sendEmailChangeNotice(input) {
  return sendTransactionalEmail({ to: input.to, ...renderEmailChangeNotice(input) });
}
