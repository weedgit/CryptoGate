/**
 * GET /v1/platform/org-member-emails — bulk member email index.
 * Skipped when DATABASE_URL is unset.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  apiFetch,
  ensureV032Seed,
  hasPostgres,
  runMigrations,
  startTestServer,
  stopTestServer,
} from "./helpers/postgres-integration.mjs";

const describePg = hasPostgres() ? describe : describe.skip;

describePg("platform org member emails bulk", () => {
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

  it("returns grouped member emails for platform staff in one call", async () => {
    const res = await apiFetch(
      base,
      "/v1/platform/org-member-emails?types=merchant",
      {
        headers: { Cookie: `cg_session=${seed.platformToken}` },
      },
    );
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.json.items));
    const merchantRow = res.json.items.find(
      (row) => row.orgId === seed.merchantOrgId,
    );
    assert.ok(merchantRow, "expected merchant org in bulk index");
    assert.ok(merchantRow.emails.length >= 1);
    assert.ok(
      merchantRow.emails.some((e) => typeof e === "string" && e.includes("@")),
    );
  });

  it("returns 403 for roles without bulk email access", async () => {
    const res = await apiFetch(base, "/v1/org-member-emails", {
      headers: { Cookie: `cg_session=${seed.cashierToken}` },
    });
    assert.equal(res.status, 403);
  });
});
