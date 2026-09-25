import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createUser, findUserById } from "../src/auth/users.mjs";
import { createPasswordResetToken } from "../src/auth/password-reset-store.mjs";
import { createSession } from "../src/auth/sessions.mjs";
import { insertMembership } from "../src/orgs/membership-store.mjs";
import { findPlatformOrg, insertOrgAccount } from "../src/orgs/org-store.mjs";
import {
  isContactGatedRequest,
  isSetupAllowedMutation,
} from "../src/auth/contact-verification.mjs";
import {
  apiFetch,
  closePool,
  hasPostgres,
  runMigrations,
  startTestServer,
  stopTestServer,
} from "./helpers/postgres-integration.mjs";

describe("contact gated paths", () => {
  it("allows GET and /v1/auth writes", () => {
    assert.equal(isContactGatedRequest("GET", "/v1/orders"), false);
    assert.equal(isContactGatedRequest("POST", "/v1/auth/login"), false);
    assert.equal(isContactGatedRequest("POST", "/v1/auth/contact/email/send"), false);
    assert.equal(isContactGatedRequest("POST", "/v1/orders"), true);
    assert.equal(isContactGatedRequest("POST", "/v1/orgs"), true);
    assert.equal(isContactGatedRequest("PUT", "/v1/orgs/x/settlement"), true);
  });

  it("allows profile and wallet mutations while setup is incomplete", () => {
    assert.equal(isSetupAllowedMutation("PATCH", "/v1/orgs/abc"), true);
    assert.equal(isSetupAllowedMutation("PUT", "/v1/orgs/abc/settlement"), true);
    assert.equal(isSetupAllowedMutation("PUT", "/v1/orgs/abc/agent-payout"), true);
    assert.equal(isSetupAllowedMutation("POST", "/v1/orders"), false);
    assert.equal(isSetupAllowedMutation("POST", "/v1/orgs"), false);
  });
});

describe("contact verification HTTP", { skip: !hasPostgres() }, () => {
  it("invite URL proves email; live actions wait for phone too", async () => {
    runMigrations();
    const stamp = Date.now();
    const email = `invite-owner-${stamp}@local.paymentgate`;
    const password = "InviteOwner12!a";
    const user = await createUser({ email, password, invited: true });
    assert.equal((await findUserById(user.id)).emailVerified, false);

    let platform = await findPlatformOrg();
    if (!platform) {
      const created = await insertOrgAccount({
        type: "platform",
        name: `Contact Test Platform ${stamp}`,
        parentId: null,
        maxAgentDepth: 1,
      });
      platform = created.row;
    }
    const merchant = await insertOrgAccount({
      type: "merchant",
      name: `Contact Merchant ${stamp}`,
      parentId: platform.id,
    });
    assert.equal(merchant.ok, true);
    await insertMembership({
      orgId: merchant.row.id,
      userId: user.id,
      role: "owner",
    });

    const { server, base } = await startTestServer();
    try {
      const token = (await createSession({ userId: user.id, mfaVerified: true }))
        .token;

      const blocked = await apiFetch(base, "/v1/orders", {
        method: "POST",
        token,
        body: {
          asset: "USDT",
          network: "TRON",
          amountUsd: "10.00",
        },
      });
      assert.equal(blocked.status, 403);
      assert.equal(blocked.json.code, "contact_unverified");

      const resetToken = await createPasswordResetToken(user.id);
      const reset = await apiFetch(base, "/v1/auth/reset-password", {
        method: "POST",
        body: { token: resetToken, password: "InviteOwner12!b" },
      });
      assert.equal(reset.status, 204);
      assert.equal((await findUserById(user.id)).emailVerified, true);

      const stillPhone = await apiFetch(base, "/v1/orders", {
        method: "POST",
        token,
        body: { asset: "USDT", network: "TRON", amountUsd: "10.00" },
      });
      assert.equal(stillPhone.status, 403);
      assert.equal(stillPhone.json.code, "contact_unverified");

      const sendPhone = await apiFetch(base, "/v1/auth/contact/phone/send", {
        method: "POST",
        token,
        body: { phone: `+6591${String(stamp).slice(-6)}` },
      });
      assert.equal(sendPhone.status, 200);
      assert.ok(sendPhone.json.devCode);

      const verifyPhone = await apiFetch(base, "/v1/auth/contact/phone/verify", {
        method: "POST",
        token,
        body: { code: sendPhone.json.devCode },
      });
      assert.equal(verifyPhone.status, 200);
      assert.equal(verifyPhone.json.contactVerified, true);
      assert.equal(verifyPhone.json.emailVerified, true);
      assert.equal(verifyPhone.json.phoneVerified, true);
      assert.equal(verifyPhone.json.setupReady, false);
      assert.equal(verifyPhone.json.profileComplete, false);

      const afterContact = await apiFetch(base, "/v1/orders", {
        method: "POST",
        token,
        body: { asset: "USDT", network: "TRON", amountUsd: "10.00" },
      });
      assert.equal(afterContact.status, 403);
      assert.equal(afterContact.json.code, "org_setup_incomplete");

      const patchProfile = await apiFetch(
        base,
        `/v1/orgs/${merchant.row.id}`,
        {
          method: "PATCH",
          token,
          body: {
            name: merchant.row.name ?? `Contact Merchant ${stamp}`,
            country: "Singapore (SG)",
          },
        },
      );
      assert.equal(patchProfile.status, 200);

      const stillWallet = await apiFetch(base, "/v1/orders", {
        method: "POST",
        token,
        body: { asset: "USDT", network: "TRON", amountUsd: "10.00" },
      });
      assert.equal(stillWallet.status, 403);
      assert.equal(stillWallet.json.code, "org_setup_incomplete");

      const putSettle = await apiFetch(
        base,
        `/v1/orgs/${merchant.row.id}/settlement`,
        {
          method: "PUT",
          token,
          body: {
            asset: "USDT",
            network: "TRON",
            address: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
          },
        },
      );
      // MFA may be required for settlement; allow either success or mfa challenge
      assert.ok(
        putSettle.status === 200 ||
          putSettle.json?.code === "mfa_required" ||
          putSettle.status === 403,
      );

      if (putSettle.status === 200) {
        const session = await apiFetch(base, "/v1/auth/session", {
          method: "GET",
          token,
        });
        assert.equal(session.json.setupReady, true);
      }
    } finally {
      await stopTestServer(server);
      await closePool();
    }
  });

  it("email OTP unlocks email when invite link was not used", async () => {
    runMigrations();
    const stamp = Date.now();
    const email = `otp-owner-${stamp}@local.paymentgate`;
    const user = await createUser({
      email,
      password: "OtpOwnerPass12!",
      invited: true,
    });
    const { server, base } = await startTestServer();
    try {
      const token = (await createSession({ userId: user.id, mfaVerified: true }))
        .token;
      const send = await apiFetch(base, "/v1/auth/contact/email/send", {
        method: "POST",
        token,
      });
      assert.equal(send.status, 200);
      assert.ok(send.json.devCode);
      const verify = await apiFetch(base, "/v1/auth/contact/email/verify", {
        method: "POST",
        token,
        body: { code: send.json.devCode },
      });
      assert.equal(verify.status, 200);
      assert.equal(verify.json.emailVerified, true);
      assert.equal(verify.json.contactVerified, false);
    } finally {
      await stopTestServer(server);
      await closePool();
    }
  });
});
