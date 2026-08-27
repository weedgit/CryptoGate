import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createPasswordResetToken,
  findValidPasswordReset,
  markPasswordResetUsed,
} from "../src/auth/password-reset-store.mjs";
import { createUser, findUserByEmail } from "../src/auth/users.mjs";
import {
  closePool,
  hasPostgres,
  runMigrations,
  startTestServer,
  stopTestServer,
} from "./helpers/postgres-integration.mjs";

describe("password reset HTTP", { skip: !hasPostgres() }, () => {
  it("forgot always returns 204; reset updates password", async () => {
    runMigrations();
    const email = `reset-${Date.now()}@local.cryptogate`;
    const oldPassword = "LocalReview1!";
    const newPassword = "NewLocalPass2!";
    await createUser({ email, password: oldPassword });

    const { server, base } = await startTestServer();
    try {
      const forgot = await fetch(`${base}/v1/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      assert.equal(forgot.status, 204);

      const user = await findUserByEmail(email);
      assert.ok(user);
      const rawToken = await createPasswordResetToken(user.id);

      const bad = await fetch(`${base}/v1/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: rawToken, password: "weak" }),
      });
      assert.equal(bad.status, 400);

      const reset = await fetch(`${base}/v1/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: rawToken, password: newPassword }),
      });
      assert.equal(reset.status, 204);

      const loginOld = await fetch(`${base}/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: oldPassword }),
      });
      assert.equal(loginOld.status, 401);

      const loginNew = await fetch(`${base}/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: newPassword }),
      });
      assert.equal(loginNew.status, 200);

      await markPasswordResetUsed(rawToken);
      assert.equal(await findValidPasswordReset(rawToken), null);

      const expired = await fetch(`${base}/v1/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: rawToken, password: newPassword }),
      });
      assert.equal(expired.status, 410);
      const body = await expired.json();
      assert.equal(body.code, "token_expired");
    } finally {
      await stopTestServer(server);
      await closePool();
    }
  });
});
