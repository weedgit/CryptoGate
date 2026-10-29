/**
 * Postgres integration — who may lift a suspension (M15). Skipped when DATABASE_URL is unset.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/auth/sessions.mjs";
import { createUser } from "../src/auth/users.mjs";
import { getPool } from "../src/db/pool.mjs";
import { insertMembership } from "../src/orgs/membership-store.mjs";
import { findPlatformOrg, insertOrgAccount } from "../src/orgs/org-store.mjs";
import {
  apiFetch,
  hasPostgres,
  runMigrations,
  startTestServer,
  stopTestServer,
} from "./helpers/postgres-integration.mjs";

const describePg = hasPostgres() ? describe : describe.skip;

describePg("suspensions the platform imposed (M15)", () => {
  /** @type {import("node:http").Server} */
  let server;
  /** @type {string} */
  let base;
  /** @type {string} */
  let merchantId;
  /** @type {string} */
  let agentToken;

  before(async () => {
    runMigrations();
    ({ server, base } = await startTestServer());
    const platform =
      (await findPlatformOrg()) ??
      (await insertOrgAccount({ type: "platform", name: "M15 Platform", parentId: null, maxAgentDepth: 1 })).row;
    const agent = (
      await insertOrgAccount({ type: "agent", name: `m15-agent-${Date.now()}`, parentId: platform.id })
    ).row;
    merchantId = (
      await insertOrgAccount({ type: "merchant", name: `m15-merchant-${Date.now()}`, parentId: agent.id })
    ).row.id;
    await getPool().query(
      `UPDATE org_accounts SET billing_email = 'billing@m15.local', country = 'US', legal_name = 'M15 Agent'
       WHERE id = $1`,
      [agent.id],
    );
    const owner = await createUser({
      email: `m15-agent-${Date.now()}@paymentgate.local`,
      password: "M15AgentPass12345!",
    });
    await insertMembership({ orgId: agent.id, userId: owner.id, role: "owner" });
    // A fully set-up agent (name + payout wallet), so the live-action gate lets it act.
    await getPool().query(
      `UPDATE users SET first_name = 'Ada', last_name = 'Agent' WHERE id = $1`,
      [owner.id],
    );
    await getPool().query(
      `INSERT INTO agent_payout_addresses (org_id, asset, network, address)
       VALUES ($1, 'USDT', 'tron', 'TAgentPayoutAddressExample00000000')`,
      [agent.id],
    );
    agentToken = (await createSession({ userId: owner.id, mfaVerified: true })).token;
  });

  after(async () => {
    await stopTestServer(server);
  });

  /** @param {boolean} byPlatform */
  async function pause(byPlatform) {
    await getPool().query(
      `UPDATE org_accounts
       SET status = 'paused', status_reason = 'test', status_set_by_platform = $2
       WHERE id = $1`,
      [merchantId, byPlatform],
    );
  }

  it("an agent cannot lift a platform suspension", async () => {
    await pause(true);
    const res = await apiFetch(base, `/v1/orgs/${merchantId}/status`, {
      method: "PUT",
      token: agentToken,
      body: { status: "active" },
    });
    assert.equal(res.status, 403, JSON.stringify(res.json));
    assert.equal(res.json.code, "platform_suspension");
  });

  it("an agent can still lift its own pause", async () => {
    await pause(false);
    const res = await apiFetch(base, `/v1/orgs/${merchantId}/status`, {
      method: "PUT",
      token: agentToken,
      body: { status: "active" },
    });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.status, "active");
  });
});
