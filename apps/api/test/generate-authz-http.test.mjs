import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createSession } from "../src/auth/sessions.mjs";
import { createUser, findUserByEmail } from "../src/auth/users.mjs";
import { insertMembership } from "../src/orgs/membership-store.mjs";
import { findPlatformOrg } from "../src/orgs/org-store.mjs";
import {
  apiFetch,
  closePool,
  hasPostgres,
  runMigrations,
  startTestServer,
  stopTestServer,
} from "./helpers/postgres-integration.mjs";

const describePg = hasPostgres() ? describe : describe.skip;

describePg("POST /v1/service-bills/generate — Owner only (HTTP)", () => {
  /** @type {import("node:http").Server | null} */
  let server = null;
  /** @type {string} */
  let base = "";
  /** @type {string} */
  let ownerToken = "";
  /** @type {string} */
  let adminToken = "";
  /** @type {string | null} */
  let skipReason = null;

  before(async () => {
    try {
      runMigrations();
    } catch (err) {
      skipReason = err instanceof Error ? err.message : String(err);
      return;
    }

    const platform = await findPlatformOrg();
    if (!platform) {
      skipReason = "platform org required";
      return;
    }

    const started = await startTestServer();
    server = started.server;
    base = started.base;

    const suffix = randomUUID().slice(0, 8);
    const ownerEmail = `gen-owner-${suffix}@paymentgate.local`;
    const adminEmail = `gen-admin-${suffix}@paymentgate.local`;
    const password = "GenAuthzPass12!";

    let ownerUser = await findUserByEmail(ownerEmail);
    if (!ownerUser) {
      ownerUser = await createUser({ email: ownerEmail, password });
    }
    let adminUser = await findUserByEmail(adminEmail);
    if (!adminUser) {
      adminUser = await createUser({ email: adminEmail, password });
    }

    await insertMembership({
      orgId: platform.id,
      userId: ownerUser.id,
      role: "owner",
    });
    await insertMembership({
      orgId: platform.id,
      userId: adminUser.id,
      role: "administrator",
    });

    ownerToken = (await createSession({ userId: ownerUser.id, mfaVerified: true }))
      .token;
    adminToken = (await createSession({ userId: adminUser.id, mfaVerified: true }))
      .token;
  });

  after(async () => {
    if (server) await stopTestServer(server);
    try {
      await closePool();
    } catch {
      /* pool may never have opened */
    }
  });

  it("rejects platform Administrator with 403", async (t) => {
    if (skipReason) {
      t.skip(skipReason);
      return;
    }
    const res = await apiFetch(base, "/v1/service-bills/generate", {
      method: "POST",
      token: adminToken,
      body: {},
    });
    assert.equal(res.status, 403);
    assert.equal(res.json.code, "forbidden");
  });

  it("allows platform Owner", async (t) => {
    if (skipReason) {
      t.skip(skipReason);
      return;
    }
    const res = await apiFetch(base, "/v1/service-bills/generate", {
      method: "POST",
      token: ownerToken,
      body: {
        periodStart: "2020-01-01",
        periodEnd: "2020-01-31",
      },
    });
    assert.equal(res.status, 200);
    assert.ok(res.json.periodStart);
    assert.ok(Array.isArray(res.json.issued));
    assert.ok(Array.isArray(res.json.skipped));
  });
});

describe("generate authz HTTP gate", () => {
  it("skips when DATABASE_URL unset", () => {
    if (!hasPostgres()) {
      assert.equal(process.env.DATABASE_URL, undefined);
    } else {
      assert.ok(process.env.DATABASE_URL);
    }
  });
});
