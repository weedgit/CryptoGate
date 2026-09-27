/**
 * Postgres integration — commission payouts server search / sort / aging-first
 * paging and the status summary. Skipped when DATABASE_URL is unset.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createSession } from "../src/auth/sessions.mjs";
import { createUser } from "../src/auth/users.mjs";
import { getPool } from "../src/db/pool.mjs";
import { insertMembership } from "../src/orgs/membership-store.mjs";
import { findPlatformOrg, insertOrgAccount } from "../src/orgs/org-store.mjs";
import {
  apiFetch,
  closePool,
  hasPostgres,
  runMigrations,
  startTestServer,
  stopTestServer,
} from "./helpers/postgres-integration.mjs";

const describePg = hasPostgres() ? describe : describe.skip;

describePg("commission payouts paging (Postgres integration)", () => {
  /** @type {import("node:http").Server} */
  let server;
  let base = "";
  let prefix = "";
  const ids = /** @type {Record<string, string>} */ ({});
  const tokens = /** @type {Record<string, string>} */ ({});
  const payoutIds = /** @type {Record<string, string>} */ ({});

  async function user(key, orgId, role) {
    const u = await createUser({ email: `${key}-${randomUUID()}@comm.test`, password: "CommTestPass12!" });
    await insertMembership({ orgId, userId: u.id, role });
    const s = await createSession({ userId: u.id, mfaVerified: true });
    tokens[key] = s.token;
  }

  async function payout(key, orgId, name, f) {
    const { rows } = await getPool().query(
      `INSERT INTO commission_payouts (
         payee_org_id, payee_name, payer, period_key, period_label,
         commission_percent, commission_amount, platform_fee_collected,
         payout_status, payment_link, paid_at, settled_at, tx_ref)
       VALUES ($1, $2, 'platform', $3, $3, '10', $4, $5, $6, '/x', $7, $8, $9)
       RETURNING id`,
      [orgId, name, f.period, f.amount, f.fee ?? f.amount * 10, f.status, f.paidAt ?? null, f.settledAt ?? null, f.tx ?? null],
    );
    payoutIds[key] = rows[0].id;
  }

  const get = (who, path) => apiFetch(base, path, { token: tokens[who] });

  before(async () => {
    runMigrations();
    prefix = `cmp${randomUUID().slice(0, 6)}`;
    let platform = await findPlatformOrg();
    if (!platform) {
      const created = await insertOrgAccount({ type: "platform", name: "Comm Test Platform", parentId: null, maxAgentDepth: 1 });
      platform = created.row;
    }
    const a1 = await insertOrgAccount({ type: "agent", name: `${prefix}-alpha`, parentId: platform.id, maxAgentDepth: null });
    const a2 = await insertOrgAccount({ type: "agent", name: `${prefix}-beta`, parentId: platform.id, maxAgentDepth: null });
    ids.a1 = a1.row.id;
    ids.a2 = a2.row.id;
    await user("platform", platform.id, "owner");
    await user("a1", ids.a1, "owner");

    const old = new Date(Date.now() - 10 * 86400000).toISOString();
    const recent = new Date(Date.now() - 1 * 86400000).toISOString();
    await payout("a1Issued", ids.a1, `${prefix}-alpha`, { period: "2026-05", amount: 12.5, status: "issued" });
    await payout("a1PaidOld", ids.a1, `${prefix}-alpha`, { period: "2026-04", amount: 7, status: "paid", paidAt: old, tx: `0x${"cd".repeat(32)}` });
    await payout("a1Settled", ids.a1, `${prefix}-alpha`, { period: "2026-03", amount: 3, status: "settled", paidAt: old, settledAt: recent });
    await payout("a2PaidNew", ids.a2, `${prefix}-beta`, { period: "2026-05", amount: 20, status: "paid", paidAt: recent });

    ({ server, base } = await startTestServer());
  });

  after(async () => {
    if (server) await stopTestServer(server);
    await closePool();
  });

  it("agent summary counts only its own invoices, including stuck paid", async () => {
    const { status, json } = await get("a1", `/v1/commission-payouts/summary?payer=platform`);
    assert.equal(status, 200);
    assert.deepEqual(json, { counts: { all: 3, issued: 1, paid: 1, settled: 1 }, stuckPaid: 1 });
  });

  it("platform search narrows to one agent; paging reports a total", async () => {
    const res = await get(
      "platform",
      `/v1/commission-payouts?payer=platform&status=issued,paid&q=${prefix}-alpha&limit=1&offset=0`,
    );
    assert.equal(res.status, 200);
    assert.equal(res.json.total, 2);
    assert.equal(res.json.items.length, 1);
    const byInvoiceId = await get(
      "platform",
      `/v1/commission-payouts?q=CI-${payoutIds.a2PaidNew.replace(/-/g, "").slice(0, 8)}`,
    );
    assert.ok(byInvoiceId.json.items.some((r) => r.id === payoutIds.a2PaidNew));
    const byTx = await get("platform", `/v1/commission-payouts?q=0x${"cd".repeat(6)}`);
    assert.ok(byTx.json.items.some((r) => r.id === payoutIds.a1PaidOld));
  });

  it("aging paid invoices sort first, then the requested column", async () => {
    const res = await get(
      "platform",
      `/v1/commission-payouts?payer=platform&status=issued,paid&q=${prefix}&sort=commission&dir=desc&agingFirst=1`,
    );
    assert.deepEqual(
      res.json.items.map((r) => r.id),
      [payoutIds.a1PaidOld, payoutIds.a2PaidNew, payoutIds.a1Issued],
    );
    const asc = await get("platform", `/v1/commission-payouts?q=${prefix}&sort=agent&dir=asc`);
    assert.equal(asc.json.items.at(-1).payeeOrgId, ids.a2);
  });

  it("validates sort / dir", async () => {
    assert.equal((await get("platform", `/v1/commission-payouts?sort=secret`)).status, 400);
    assert.equal((await get("platform", `/v1/commission-payouts?dir=up`)).status, 400);
    assert.equal((await apiFetch(base, `/v1/commission-payouts/summary`)).status, 401);
  });
});
