/**
 * Postgres integration — TOTP failure lockout and single-use codes (H8).
 * Skipped when DATABASE_URL is unset.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createSession } from "../src/auth/sessions.mjs";
import { createUser } from "../src/auth/users.mjs";
import { MFA_MAX_FAILURES } from "../src/auth/mfa-attempts.mjs";
import { encodeBase32, hotp } from "../src/auth/totp.mjs";
import { getPool } from "../src/db/pool.mjs";
import {
  apiFetch,
  hasPostgres,
  runMigrations,
  startTestServer,
  stopTestServer,
} from "./helpers/postgres-integration.mjs";

const describePg = hasPostgres() ? describe : describe.skip;

describePg("TOTP attempt limits (H8)", () => {
  /** @type {import("node:http").Server} */
  let server;
  /** @type {string} */
  let base;
  /** @type {string} */
  let userId;
  /** @type {Buffer} */
  let secret;

  const codeAt = (offsetSteps = 0) =>
    hotp(secret, Math.floor(Date.now() / 30_000) + offsetSteps);

  async function freshSession() {
    return (await createSession({ userId, mfaVerified: false })).token;
  }

  before(async () => {
    runMigrations();
    ({ server, base } = await startTestServer());
    const user = await createUser({
      email: `mfa-limit-${Date.now()}@paymentgate.local`,
      password: "MfaLimitPass12345!",
    });
    userId = user.id;
    secret = randomBytes(20);
    await getPool().query(
      `UPDATE users SET mfa_secret = $2, mfa_enrolled_at = now() WHERE id = $1`,
      [userId, encodeBase32(secret)],
    );
  });

  after(async () => {
    await stopTestServer(server);
  });

  it("locks the account's TOTP checks after repeated wrong codes", async () => {
    const token = await freshSession();
    const wrong = codeAt(0) === "000000" ? "111111" : "000000";
    let last;
    for (let i = 0; i < MFA_MAX_FAILURES; i += 1) {
      last = await apiFetch(base, "/v1/auth/mfa/verify", {
        method: "POST",
        token,
        body: { code: wrong },
      });
    }
    assert.equal(last.status, 429);
    assert.equal(last.json.code, "mfa_locked");
    const right = await apiFetch(base, "/v1/auth/mfa/verify", {
      method: "POST",
      token,
      body: { code: codeAt(0) },
    });
    assert.equal(right.status, 429, "even the right code waits out the lock");
  });

  it("accepts a code once; the same code cannot be replayed", async () => {
    await getPool().query(
      `UPDATE users SET mfa_locked_until = NULL, mfa_failed_count = 0 WHERE id = $1`,
      [userId],
    );
    const code = codeAt(0);
    const first = await apiFetch(base, "/v1/auth/mfa/verify", {
      method: "POST",
      token: await freshSession(),
      body: { code },
    });
    assert.equal(first.status, 200, JSON.stringify(first.json));
    const replay = await apiFetch(base, "/v1/auth/mfa/verify", {
      method: "POST",
      token: await freshSession(),
      body: { code },
    });
    assert.equal(replay.status, 401);
    assert.equal(replay.json.code, "invalid_mfa");
  });
});
