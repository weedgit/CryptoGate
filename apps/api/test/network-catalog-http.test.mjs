import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSession } from "../src/auth/sessions.mjs";
import { createUser, findUserByEmail } from "../src/auth/users.mjs";
import { canReadPlatformOrgPolicy } from "../src/orgs/role-policy.mjs";
import { insertMembership } from "../src/orgs/membership-store.mjs";
import { findPlatformOrg } from "../src/orgs/org-store.mjs";
import {
  apiFetch,
  closePool,
  ensureV032Seed,
  hasPostgres,
  runMigrations,
  startTestServer,
  stopTestServer,
} from "./helpers/postgres-integration.mjs";

const routesPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/platform-settings/network-maintenance-routes.mjs",
);

describe("network catalog HTTP", () => {
  it("imports canReadPlatformOrgPolicy in catalog routes", () => {
    const src = readFileSync(routesPath, "utf8");
    assert.match(src, /import\s*\{[^}]*canReadPlatformOrgPolicy[^}]*\}\s*from\s*"\.\.\/orgs\/role-policy\.mjs"/);
    assert.doesNotThrow(() => {
      canReadPlatformOrgPolicy({
        memberships: [{ orgType: "platform", role: "viewer" }],
      });
    });
  });

  it("GET /v1/platform/networks/catalog returns cards for platform viewer", async (t) => {
    if (!hasPostgres()) {
      t.skip("DATABASE_URL not set");
      return;
    }
    try {
      runMigrations();
    } catch (err) {
      t.skip(`postgres unavailable: ${err instanceof Error ? err.message : err}`);
      return;
    }
    const seed = await ensureV032Seed();
    const viewerEmail = "netcat-viewer@paymentgate.local";
    let viewer = await findUserByEmail(viewerEmail);
    if (!viewer) {
      viewer = await createUser({
        email: viewerEmail,
        password: "NetCatViewer1!",
      });
    }
    await insertMembership({
      orgId: seed.platformOrgId,
      userId: viewer.id,
      role: "viewer",
    });
    const viewerSession = await createSession({
      userId: viewer.id,
      mfaVerified: true,
    });

    const { server, base } = await startTestServer();
    try {
      const res = await apiFetch(base, "/v1/platform/networks/catalog", {
        token: viewerSession.token,
      });
      assert.equal(
        res.status,
        200,
        `expected 200, got ${res.status}: ${JSON.stringify(res.json)}`,
      );
      assert.ok(Array.isArray(res.json.items), "items must be an array");
      assert.ok(res.json.items.length > 0, "catalog must include networks");
      assert.equal(typeof res.json.chainEnv, "string");
      const tron = res.json.items.find((row) => row.network === "tron");
      assert.ok(tron, "tron card expected");
      assert.equal(typeof tron.title, "string");
      assert.ok(Array.isArray(tron.pairs));
    } finally {
      await stopTestServer(server);
      await closePool();
    }
  });
});
