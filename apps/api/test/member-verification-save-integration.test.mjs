/**
 * PATCH /v1/orgs/{orgId}/members/{userId} — verification sent with a contact change.
 * Skipped when DATABASE_URL is unset.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { clearUserPhone, findUserById } from "../src/auth/users.mjs";
import {
  apiFetch,
  ensureV032Seed,
  hasPostgres,
  runMigrations,
  startTestServer,
  stopTestServer,
} from "./helpers/postgres-integration.mjs";

const describePg = hasPostgres() ? describe : describe.skip;

describePg("member verification saved with the profile", () => {
  /** @type {import("node:http").Server} */
  let server;
  /** @type {string} */
  let base;
  /** @type {Awaited<ReturnType<typeof ensureV032Seed>>} */
  let seed;

  before(async () => {
    runMigrations();
    seed = await ensureV032Seed();
    ({ server, base } = await startTestServer());
  });

  after(async () => {
    await stopTestServer(server);
  });

  it("keeps phone verified when the phone is added in the same save", async () => {
    const users = await apiFetch(base, `/v1/orgs/${seed.merchantOrgId}/users`, {
      token: seed.platformToken,
    });
    const cashier = users.json.items.find((m) => m.role === "cashier");
    assert.ok(cashier);
    await clearUserPhone(cashier.userId);
    const path = `/v1/orgs/${seed.merchantOrgId}/members/${cashier.userId}`;

    const saved = await apiFetch(base, path, {
      method: "PATCH",
      token: seed.platformToken,
      body: {
        email: cashier.email,
        phone: "+1 (555) 201-3344",
        phoneVerified: true,
      },
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.json.phone, "+15552013344");
    assert.equal(saved.json.phoneVerified, true);
    assert.equal((await findUserById(cashier.userId)).phoneVerified, true);

    const changed = await apiFetch(base, path, {
      method: "PATCH",
      token: seed.platformToken,
      body: { email: cashier.email, phone: "+1 (555) 201-9999" },
    });
    assert.equal(changed.status, 200);
    assert.equal(changed.json.phoneVerified, false);
  });
});
