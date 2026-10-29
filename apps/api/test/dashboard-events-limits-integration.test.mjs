/**
 * Postgres integration — live-update stream limits (M25). Skipped when DATABASE_URL is unset.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { MAX_STREAMS_PER_USER } from "../src/events/dashboard-events-routes.mjs";
import { dashboardEventSubscriberCount } from "../src/events/dashboard-events-hub.mjs";
import {
  ensureV032Seed,
  hasPostgres,
  runMigrations,
  startTestServer,
  stopTestServer,
} from "./helpers/postgres-integration.mjs";

const describePg = hasPostgres() ? describe : describe.skip;

describePg("dashboard event streams (M25)", () => {
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

  it("caps open streams per user and frees the slot on close", async () => {
    const open = [];
    const connect = async () => {
      const controller = new AbortController();
      const res = await fetch(`${base}/v1/events`, {
        headers: { Cookie: `cg_session=${seed.platformToken}` },
        signal: controller.signal,
      });
      return { res, controller };
    };
    for (let i = 0; i < MAX_STREAMS_PER_USER; i += 1) {
      const stream = await connect();
      assert.equal(stream.res.status, 200);
      open.push(stream);
    }
    const extra = await connect();
    assert.equal(extra.res.status, 429);
    const before = dashboardEventSubscriberCount();
    open.pop().controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(dashboardEventSubscriberCount(), before - 1);
    const again = await connect();
    assert.equal(again.res.status, 200);
    open.push(again);
    for (const s of open) s.controller.abort();
  });
});
