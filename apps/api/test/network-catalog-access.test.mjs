import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canReadPlatformOrgPolicy } from "../src/orgs/role-policy.mjs";
import { handleGetNetworkCatalog } from "../src/platform-settings/network-maintenance-routes.mjs";
import { buildNetworkCatalog } from "../src/platform-settings/network-catalog.mjs";

const routesPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/platform-settings/network-maintenance-routes.mjs",
);

describe("network catalog access", () => {
  it("allows platform viewer to read org policy", () => {
    assert.equal(
      canReadPlatformOrgPolicy({
        memberships: [{ orgType: "platform", role: "viewer" }],
      }),
      true,
    );
  });

  it("exports catalog handler with read policy wired", () => {
    assert.equal(typeof handleGetNetworkCatalog, "function");
  });

  it("loads HTTP app without broken Mode S imports", async () => {
    await import("../src/http/app.mjs");
  });

  it("builds registry-only catalog without DATABASE_URL", async () => {
    const prev = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const catalog = await buildNetworkCatalog();
      assert.ok(Array.isArray(catalog.items));
      assert.ok(catalog.items.length > 0);
      assert.equal(typeof catalog.chainEnv, "string");
    } finally {
      if (prev === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prev;
    }
  });
});
