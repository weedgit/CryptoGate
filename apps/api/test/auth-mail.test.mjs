import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";
import {
  getSmtpConfig,
  isOutboundMailConfigured,
} from "../src/mail/mail-config.mjs";

const require = createRequire(import.meta.url);

describe("mail-config", () => {
  it("is unavailable without MAIL_TRANSPORT=smtp", () => {
    const prev = snapshotEnv();
    delete process.env.MAIL_TRANSPORT;
    process.env.SMTP_HOST = "smtp.example.com";
    try {
      assert.equal(isOutboundMailConfigured(), false);
      assert.equal(getSmtpConfig(), null);
    } finally {
      restoreEnv(prev);
    }
  });

  it("reads host/port/from when MAIL_TRANSPORT=smtp", () => {
    const prev = snapshotEnv();
    process.env.MAIL_TRANSPORT = "smtp";
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = "1025";
    process.env.SMTP_FROM = "ops@paymentgate.local";
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_SECURE;
    try {
      assert.equal(isOutboundMailConfigured(), true);
      assert.deepEqual(getSmtpConfig(), {
        host: "127.0.0.1",
        port: 1025,
        secure: false,
        user: null,
        pass: null,
        from: "ops@paymentgate.local",
      });
    } finally {
      restoreEnv(prev);
    }
  });
});

describe("auth-mail", () => {
  it("stubs when transport is off", async () => {
    const prev = snapshotEnv();
    delete process.env.MAIL_TRANSPORT;
    delete process.env.SMTP_HOST;
    try {
      const { sendEmailChangeNotice, sendPasswordResetEmail } = await import(
        "../src/mail/auth-mail.mjs"
      );
      const out = await sendPasswordResetEmail({
        to: "a@example.com",
        resetUrl: "http://localhost/reset",
      });
      assert.equal(out.delivered, false);
      assert.equal(out.mode, "stub");
      const notice = await sendEmailChangeNotice({
        to: "old@example.com",
        phase: "requested",
      });
      assert.equal(notice.mode, "stub");
    } finally {
      restoreEnv(prev);
    }
  });

  it("delivers via nodemailer when smtp is configured", async () => {
    const prev = snapshotEnv();
    process.env.MAIL_TRANSPORT = "smtp";
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = "1025";
    process.env.SMTP_FROM = "test@paymentgate.local";

    const nodemailer = require("nodemailer");
    const original = nodemailer.createTransport;
    let captured;
    nodemailer.createTransport = () => ({
      sendMail: async (opts) => {
        captured = opts;
        return { messageId: "test-id" };
      },
    });
    try {
      // Fresh import path is hard; call through the same module by re-requiring
      // the send path after patch — auth-mail uses createRequire(nodemailer).
      const { sendPasswordResetEmail } = await import("../src/mail/auth-mail.mjs");
      const out = await sendPasswordResetEmail({
        to: "user@mailbox.dev",
        resetUrl: "http://localhost/r",
      });
      assert.equal(out.mode, "smtp");
      assert.equal(out.delivered, true);
      assert.equal(captured.to, "user@mailbox.dev");
      assert.match(captured.subject, /reset your paymentgate password/i);
      assert.match(captured.text, /http:\/\/localhost\/r/);
      assert.match(captured.html, /href="http:\/\/localhost\/r"/);
    } finally {
      nodemailer.createTransport = original;
      restoreEnv(prev);
    }
  });

  it("retries a rate-limited send and spaces bulk notifications", async () => {
    const prev = snapshotEnv();
    process.env.MAIL_TRANSPORT = "smtp";
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = "1025";
    process.env.SMTP_FROM = "test@paymentgate.local";
    const nodemailer = require("nodemailer");
    const original = nodemailer.createTransport;
    const { sendEmailOtp, sendNotificationEmail, setMailPacingForTest } = await import(
      "../src/mail/auth-mail.mjs"
    );
    setMailPacingForTest({ gapMs: 40, retryBaseMs: 5 });
    let calls = 0;
    /** @type {number[]} */
    const sentAt = [];
    nodemailer.createTransport = () => ({
      sendMail: async () => {
        calls += 1;
        if (calls === 1) {
          const err = new Error("Message failed: 550 Too many requests.");
          throw err;
        }
        sentAt.push(Date.now());
        return { messageId: `id-${calls}` };
      },
    });
    try {
      const otp = await sendEmailOtp({ to: "user@mailbox.dev", code: "123456" });
      assert.equal(otp.delivered, true);
      assert.equal(calls, 2);

      sentAt.length = 0;
      const results = await Promise.all(
        [1, 2, 3].map((i) =>
          sendNotificationEmail({ to: `n${i}@mailbox.dev`, subject: "s", text: "t" }),
        ),
      );
      assert.ok(results.every((r) => r.delivered));
      sentAt.sort((a, b) => a - b);
      assert.ok(sentAt[2] - sentAt[0] >= 70, `spacing ${sentAt[2] - sentAt[0]}ms`);
    } finally {
      nodemailer.createTransport = original;
      setMailPacingForTest({ gapMs: 150, retryBaseMs: 1000 });
      restoreEnv(prev);
    }
  });

  it("suppresses reserved and seed domains without calling SMTP", async () => {
    const prev = snapshotEnv();
    process.env.MAIL_TRANSPORT = "smtp";
    process.env.SMTP_HOST = "127.0.0.1";
    const nodemailer = require("nodemailer");
    const original = nodemailer.createTransport;
    let calls = 0;
    nodemailer.createTransport = () => ({
      sendMail: async () => {
        calls += 1;
        return { messageId: "x" };
      },
    });
    const { isSuppressedRecipient, sendNotificationEmail } = await import(
      "../src/mail/auth-mail.mjs"
    );
    try {
      for (const to of [
        "a@audit.test",
        "b@paymentgate.local",
        "cashier.load001@local.paymentgate",
        "c@example.com",
        "d@localhost",
        "no-at-sign",
      ]) {
        assert.equal(isSuppressedRecipient(to), true, to);
      }
      assert.equal(isSuppressedRecipient("owner@gmail.com"), false);
      assert.equal(isSuppressedRecipient("ops@boostbunny.io"), false);
      const out = await sendNotificationEmail({ to: "x@bw.test", subject: "s", text: "t" });
      assert.deepEqual(out, { delivered: false, mode: "suppressed" });
      assert.equal(calls, 0);
    } finally {
      nodemailer.createTransport = original;
      restoreEnv(prev);
    }
  });

  it("renders the invite with a set-password button and the temporary password", async () => {
    const { renderInviteEmail } = await import("../src/mail/auth-mail.mjs");
    const mail = renderInviteEmail({
      to: "new@example.com",
      orgName: "Hitman <Group>",
      role: "owner",
      temporaryPassword: "Tmp&Pass123",
      inviteUrl: "https://agent.example/reset-password?token=abc&x=1",
      loginUrl: "https://agent.example",
    });
    assert.equal(mail.subject, "You're invited to join Hitman <Group> on PaymentGate");
    assert.match(mail.text, /as Owner\./);
    assert.match(mail.text, /temporary password: Tmp&Pass123/);
    assert.match(mail.html, /Hitman &lt;Group&gt;/);
    assert.match(mail.html, /Tmp&amp;Pass123/);
    assert.match(mail.html, /href="https:\/\/agent\.example\/reset-password\?token=abc&amp;x=1"/);
    assert.match(mail.html, />Set your password</);
  });

  it("renders the verification email with code in subject, text and html", async () => {
    const { renderEmailOtp } = await import("../src/mail/auth-mail.mjs");
    const mail = renderEmailOtp({ to: "a<b>@example.com", code: "482913" });
    assert.equal(mail.subject, "482913 is your PaymentGate verification code");
    assert.match(mail.text, /Your verification code is: 482913/);
    assert.match(mail.text, /expires in 10 minutes/);
    assert.match(mail.html, /482913/);
    assert.match(mail.html, /a&lt;b&gt;@example\.com/);
    assert.doesNotMatch(mail.html, /a<b>@/);
  });
});

function snapshotEnv() {
  return {
    MAIL_TRANSPORT: process.env.MAIL_TRANSPORT,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_FROM: process.env.SMTP_FROM,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_SECURE: process.env.SMTP_SECURE,
  };
}

function restoreEnv(prev) {
  for (const [k, v] of Object.entries(prev)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}
