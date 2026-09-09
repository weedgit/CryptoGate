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
      const { sendPasswordResetEmail } = await import("../src/mail/auth-mail.mjs");
      const out = await sendPasswordResetEmail({
        to: "a@example.com",
        resetUrl: "http://localhost/reset",
      });
      assert.equal(out.delivered, false);
      assert.equal(out.mode, "stub");
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
        to: "user@example.com",
        resetUrl: "http://localhost/r",
      });
      assert.equal(out.mode, "smtp");
      assert.equal(out.delivered, true);
      assert.equal(captured.to, "user@example.com");
      assert.match(captured.subject, /password reset/i);
      assert.match(captured.text, /http:\/\/localhost\/r/);
    } finally {
      nodemailer.createTransport = original;
      restoreEnv(prev);
    }
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
