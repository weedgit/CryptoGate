import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  cachedPlatformOrgList,
  invalidatePlatformOrgListCache,
} from "../src/orgs/org-list-cache.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("platform org list cache", () => {
  it("reloads after invalidatePlatformOrgListCache", async () => {
    invalidatePlatformOrgListCache();
    let loads = 0;
    const loader = async () => {
      loads += 1;
      return loads === 1 ? [{ id: "first" }] : [{ id: "second" }];
    };

    const cached = await cachedPlatformOrgList(loader);
    assert.deepEqual(cached, [{ id: "first" }]);
    assert.equal(loads, 1);

    const stillCached = await cachedPlatformOrgList(loader);
    assert.deepEqual(stillCached, [{ id: "first" }]);
    assert.equal(loads, 1);

    invalidatePlatformOrgListCache();
    const fresh = await cachedPlatformOrgList(loader);
    assert.deepEqual(fresh, [{ id: "second" }]);
    assert.equal(loads, 2);
  });

  it("invalidates cache on org delete and status change", () => {
    const routes = readFileSync(
      join(root, "src/orgs/org-routes.mjs"),
      "utf8",
    );
    const deleteBlock = routes.slice(
      routes.indexOf("export async function handleDeleteOrg"),
      routes.indexOf("export async function handleCreateOrg"),
    );
    assert.match(deleteBlock, /invalidatePlatformOrgListCache\(\)/);

    const statusBlock = routes.slice(
      routes.indexOf("export async function handleSetOrgStatus"),
      routes.indexOf("export async function handleDeleteOrg"),
    );
    assert.match(statusBlock, /invalidatePlatformOrgListCache\(\)/);
  });
});
