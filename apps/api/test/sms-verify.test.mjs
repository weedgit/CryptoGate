import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  checkPhoneVerification,
  startPhoneVerification,
  usesTwilioVerify,
} from "../src/sms/sms-send.mjs";

const KEYS = [
  "SMS_TRANSPORT",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_VERIFY_SERVICE_SID",
  "TWILIO_FROM",
];

describe("Twilio Verify phone codes", () => {
  /** @type {Record<string, string | undefined>} */
  let savedEnv;
  const realFetch = globalThis.fetch;
  /** @type {{ url: string, body: string, auth: string }[]} */
  let calls;

  function mockFetch(status, json) {
    globalThis.fetch = async (url, init) => {
      calls.push({
        url: String(url),
        body: String(init.body),
        auth: init.headers.Authorization,
      });
      return new Response(JSON.stringify(json), { status });
    };
  }

  beforeEach(() => {
    savedEnv = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    process.env.SMS_TRANSPORT = "twilio";
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "secret";
    process.env.TWILIO_VERIFY_SERVICE_SID = "VA456";
    delete process.env.TWILIO_FROM;
    calls = [];
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    for (const k of KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  it("is used only with SMS_TRANSPORT=twilio, credentials and a service SID", () => {
    assert.equal(usesTwilioVerify(), true);
    delete process.env.TWILIO_VERIFY_SERVICE_SID;
    assert.equal(usesTwilioVerify(), false);
    process.env.TWILIO_VERIFY_SERVICE_SID = "VA456";
    process.env.SMS_TRANSPORT = "stub";
    assert.equal(usesTwilioVerify(), false);
  });

  it("starts an SMS verification on the service", async () => {
    mockFetch(201, { status: "pending" });
    const sent = await startPhoneVerification("+14155550100");
    assert.deepEqual(sent, { delivered: true, mode: "twilio_verify" });
    assert.equal(calls[0].url, "https://verify.twilio.com/v2/Services/VA456/Verifications");
    assert.match(calls[0].body, /To=%2B14155550100/);
    assert.match(calls[0].body, /Channel=sms/);
    assert.equal(calls[0].auth, `Basic ${Buffer.from("AC123:secret").toString("base64")}`);
  });

  it("reports an undelivered start", async () => {
    mockFetch(400, { code: 60200, message: "Invalid parameter" });
    const sent = await startPhoneVerification("+1");
    assert.equal(sent.delivered, false);
  });

  it("approves only when Twilio says approved", async () => {
    mockFetch(200, { status: "approved" });
    assert.equal(await checkPhoneVerification("+14155550100", "123456"), true);
    assert.equal(calls[0].url, "https://verify.twilio.com/v2/Services/VA456/VerificationCheck");
    mockFetch(200, { status: "pending" });
    assert.equal(await checkPhoneVerification("+14155550100", "000000"), false);
  });

  it("treats a missing verification as a wrong code", async () => {
    mockFetch(404, { code: 20404 });
    assert.equal(await checkPhoneVerification("+14155550100", "123456"), false);
  });

  it("throws when Twilio cannot check the code", async () => {
    mockFetch(500, { message: "down" });
    await assert.rejects(
      checkPhoneVerification("+14155550100", "123456"),
      (err) => err.code === "sms_verify_unavailable",
    );
  });
});
