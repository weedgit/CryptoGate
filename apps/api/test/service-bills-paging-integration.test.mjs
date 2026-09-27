/**
 * Postgres integration — Service Bills server paging, buckets, date window,
 * search, sort and summary. Skipped when DATABASE_URL is unset.
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
const WEEK = "from=2026-05-10&to=2026-05-16&tz=UTC";
const TX_HASH = `0x${"ab12".repeat(16)}`;

describePg("service bills paging (Postgres integration)", () => {
  /** @type {import("node:http").Server} */
  let server;
  let base = "";
  let prefix = "";
  const ids = /** @type {Record<string, string>} */ ({});
  const tokens = /** @type {Record<string, string>} */ ({});
  const billIds = /** @type {Record<string, string>} */ ({});

  async function org(type, name, parentId, legalName = null) {
    const created = await insertOrgAccount({ type, name, parentId, maxAgentDepth: null });
    if (!created.ok) throw new Error(`could not create ${type} ${name}`);
    if (legalName) {
      await getPool().query(`UPDATE org_accounts SET legal_name = $2 WHERE id = $1`, [
        created.row.id,
        legalName,
      ]);
    }
    return created.row.id;
  }

  async function user(key, orgId, role) {
    const u = await createUser({ email: `${key}-${randomUUID()}@bills.test`, password: "BillsTestPass12!" });
    await insertMembership({ orgId, userId: u.id, role });
    const s = await createSession({ userId: u.id, mfaVerified: true });
    tokens[key] = s.token;
  }

  async function bill(key, orgId, f) {
    const { rows } = await getPool().query(
      `INSERT INTO service_bills (
         org_id, period_start, period_end, subscription_amount, volume_fee_amount,
         total_amount, due_at, status, created_at, bill_kind, payment_reference)
       VALUES ($1, $2, $3, $4, '0', $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        orgId,
        f.periodStart,
        f.periodEnd ?? f.periodStart,
        f.total,
        f.dueAt,
        f.status,
        f.createdAt ?? f.dueAt,
        f.kind ?? "monthly",
        f.ref ?? null,
      ],
    );
    billIds[key] = rows[0].id;
  }

  const get = (who, path) => apiFetch(base, path, { token: tokens[who] });

  before(async () => {
    runMigrations();
    prefix = `sbp${randomUUID().slice(0, 6)}`;
    let platform = await findPlatformOrg();
    if (!platform) {
      const created = await insertOrgAccount({
        type: "platform",
        name: "Bills Test Platform",
        parentId: null,
        maxAgentDepth: 1,
      });
      platform = created.row;
    }
    ids.agent = await org("agent", `${prefix}-agent`, platform.id, `${prefix} Zeta Holdings`);
    ids.m1 = await org("merchant", `${prefix}-alpha`, ids.agent);
    ids.m2 = await org("merchant", `${prefix}-beta`, platform.id, `${prefix} Beta Legal`);
    ids.otherAgent = await org("agent", `${prefix}-other-agent`, platform.id);
    ids.otherMerchant = await org("merchant", `${prefix}-other-merchant`, ids.otherAgent);
    ids.emptyAgent = await org("agent", `${prefix}-empty-agent`, platform.id);

    await user("platform", platform.id, "owner");
    await user("agent", ids.agent, "owner");
    await user("m1", ids.m1, "owner");
    await user("cashier", ids.m1, "cashier");

    await bill("m1Paid", ids.m1, { periodStart: "2026-04-01", periodEnd: "2026-04-30", total: "59", dueAt: "2026-05-12T12:00:00Z", status: "paid" });
    await bill("m1OldIssued", ids.m1, { periodStart: "2025-12-01", periodEnd: "2025-12-31", total: "20", dueAt: "2026-01-10T12:00:00Z", createdAt: "2026-01-01T00:00:00Z", status: "issued" });
    await bill("m1Activation", ids.m1, { periodStart: "2026-05-14", total: "99", dueAt: "2026-05-14T12:00:00Z", status: "draft", kind: "activation" });
    await bill("m2Overdue", ids.m2, { periodStart: "2026-04-01", periodEnd: "2026-04-30", total: "35", dueAt: "2026-05-15T12:00:00Z", status: "overdue" });
    await bill("m2Waived", ids.m2, { periodStart: "2026-01-01", periodEnd: "2026-01-31", total: "10", dueAt: "2026-02-01T12:00:00Z", createdAt: "2026-01-20T00:00:00Z", status: "waived" });
    await bill("m2Draft", ids.m2, { periodStart: "2026-05-01", periodEnd: "2026-05-31", total: "40", dueAt: "2026-05-13T12:00:00Z", status: "draft" });
    await bill("m2Paid", ids.m2, { periodStart: "2026-03-01", periodEnd: "2026-03-31", total: "15", dueAt: "2026-05-11T12:00:00Z", status: "paid", ref: TX_HASH });

    ({ server, base } = await startTestServer());
  });

  after(async () => {
    if (server) await stopTestServer(server);
    await closePool();
  });

  it("agent summary covers its merchants in the window (open AR always included)", async () => {
    const { status, json } = await get("agent", `/v1/service-bills/summary?${WEEK}`);
    assert.equal(status, 200);
    assert.equal(json.counts.all, 3);
    assert.equal(json.counts.issued, 1);
    assert.equal(json.counts.unpaid, 1);
    assert.equal(json.counts.activation, 1);
    assert.equal(json.counts.draft, 0);
    assert.equal(json.counts.paid, 1);
    assert.equal(json.counts.overdue, 0);
    assert.deepEqual(json.amounts, { issuedUsd: "20.00", overdueUsd: "0.00", paidUsd: "59.00" });
  });

  it("summary for one org hides closed bills outside the window", async () => {
    const { json } = await get("platform", `/v1/service-bills/summary?${WEEK}&orgId=${ids.m2}`);
    assert.equal(json.counts.all, 3);
    assert.equal(json.counts.waived, 0);
    assert.equal(json.counts.overdue, 1);
    assert.equal(json.counts.draft, 1);
    assert.equal(json.amounts.overdueUsd, "35.00");
    const all = await get("platform", `/v1/service-bills/summary?orgId=${ids.m2}`);
    assert.equal(all.json.counts.all, 4);
    assert.equal(all.json.counts.waived, 1);
  });

  it("pages with a server total", async () => {
    const p1 = await get("agent", `/v1/service-bills?${WEEK}&limit=2&offset=0`);
    assert.equal(p1.status, 200);
    assert.equal(p1.json.total, 3);
    assert.equal(p1.json.items.length, 2);
    const p2 = await get("agent", `/v1/service-bills?${WEEK}&limit=2&offset=2`);
    assert.equal(p2.json.items.length, 1);
    const seen = new Set([...p1.json.items, ...p2.json.items].map((b) => b.id));
    assert.equal(seen.size, 3);
  });

  it("filters by bucket", async () => {
    const act = await get("agent", `/v1/service-bills?${WEEK}&bucket=activation`);
    assert.deepEqual(act.json.items.map((b) => b.id), [billIds.m1Activation]);
    const unpaid = await get("platform", `/v1/service-bills?${WEEK}&bucket=unpaid&orgId=${ids.m2}`);
    assert.deepEqual(unpaid.json.items.map((b) => b.id), [billIds.m2Overdue]);
  });

  it("sorts on the server", async () => {
    const asc = await get("platform", `/v1/service-bills?${WEEK}&orgId=${ids.m2}&sort=total&dir=asc`);
    assert.deepEqual(asc.json.items.map((b) => b.totalAmount), ["15", "35", "40"]);
    const byMerchant = await get("platform", `/v1/service-bills?${WEEK}&q=${prefix}&sort=merchant&dir=desc`);
    assert.equal(byMerchant.json.items[0].orgId, ids.m2);
    assert.equal(byMerchant.json.items.at(-1).orgId, ids.m1);
  });

  it("searches merchant, parent agent legal name, bill id and tx hash", async () => {
    const agentLegal = await get("platform", `/v1/service-bills?${WEEK}&q=${encodeURIComponent(`${prefix} zeta`)}`);
    assert.equal(agentLegal.json.total, 3);
    assert.ok(agentLegal.json.items.every((b) => b.orgId === ids.m1));

    const merchantLegal = await get("platform", `/v1/service-bills?${WEEK}&q=${encodeURIComponent(`${prefix} beta legal`)}`);
    assert.equal(merchantLegal.json.total, 3);

    const short = `SB-${billIds.m2Draft.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    const byId = await get("platform", `/v1/service-bills?q=${short}`);
    assert.ok(byId.json.items.some((b) => b.id === billIds.m2Draft));

    const byTx = await get("platform", `/v1/service-bills?q=${TX_HASH.slice(0, 20)}`);
    assert.ok(byTx.json.items.some((b) => b.id === billIds.m2Paid));

    const wildcard = await get("platform", `/v1/service-bills?${WEEK}&q=${encodeURIComponent("%")}&orgId=${ids.m2}`);
    assert.equal(wildcard.json.total, 0);
  });

  it("merchant buckets: open (drafts + activation + AR), late, activation first", async () => {
    const open = await get("m1", `/v1/service-bills?bucket=open&sort=activationFirst`);
    assert.equal(open.json.total, 2);
    assert.equal(open.json.items[0].id, billIds.m1Activation);
    const summary = await get("m1", `/v1/service-bills/summary`);
    assert.equal(summary.json.counts.open, 2);
    assert.equal(summary.json.counts.late, 0);
    const late = await get("platform", `/v1/service-bills?bucket=late&orgId=${ids.m2}`);
    assert.deepEqual(late.json.items.map((b) => b.id), [billIds.m2Overdue]);
    const byPeriod = await get("m1", `/v1/service-bills?q=2025-12`);
    assert.deepEqual(byPeriod.json.items.map((b) => b.id), [billIds.m1OldIssued]);
  });

  it("merchant owner sees own bills; cashier and outsiders are blocked", async () => {
    const m1 = await get("m1", `/v1/service-bills?${WEEK}`);
    assert.equal(m1.json.total, 3);
    assert.equal((await get("cashier", `/v1/service-bills/summary?${WEEK}`)).status, 403);
    assert.equal((await get("agent", `/v1/service-bills/summary?orgId=${ids.m2}`)).status, 403);
    assert.equal((await apiFetch(base, `/v1/service-bills/summary?${WEEK}`)).status, 401);
  });

  it("org-status gives one badge row per merchant", async () => {
    const agent = await get("agent", `/v1/service-bills/org-status`);
    assert.equal(agent.status, 200);
    assert.deepEqual(agent.json.items, [
      { orgId: ids.m1, billStatus: "activation", feeStatus: "issued", latestPeriod: "2026-05", latestPeriodOpen: false },
    ]);
    const platform = await get("platform", `/v1/service-bills/org-status`);
    const m2 = platform.json.items.find((r) => r.orgId === ids.m2);
    assert.deepEqual(m2, { orgId: ids.m2, billStatus: "overdue", feeStatus: "overdue", latestPeriod: "2026-05", latestPeriodOpen: false });
    assert.equal((await get("cashier", `/v1/service-bills/org-status`)).status, 403);
  });

  it("agentOrgId narrows to merchants under that agent", async () => {
    const list = await get("platform", `/v1/service-bills?agentOrgId=${ids.agent}`);
    assert.equal(list.status, 200);
    assert.equal(list.json.total, 3);
    assert.ok(list.json.items.every((b) => b.orgId === ids.m1));
    const summary = await get("platform", `/v1/service-bills/summary?agentOrgId=${ids.agent}`);
    assert.equal(summary.json.counts.all, 3);
    const own = await get("agent", `/v1/service-bills?agentOrgId=${ids.agent}`);
    assert.equal(own.json.total, 3);
    const empty = await get("platform", `/v1/service-bills?agentOrgId=${ids.emptyAgent}`);
    assert.equal(empty.status, 200);
    assert.equal(empty.json.total, 0);
  });

  it("billing period overlap filters list and summary", async () => {
    const may = "periodFrom=2026-05-01&periodTo=2026-05-31";
    const agentMay = await get("platform", `/v1/service-bills?agentOrgId=${ids.agent}&${may}`);
    assert.deepEqual(agentMay.json.items.map((b) => b.id), [billIds.m1Activation]);
    const summary = await get("platform", `/v1/service-bills/summary?agentOrgId=${ids.agent}&${may}`);
    assert.equal(summary.json.counts.all, 1);
    assert.equal(summary.json.counts.activation, 1);

    const april = await get("platform", `/v1/service-bills?q=${prefix}&periodFrom=2026-04-15&periodTo=2026-04-15`);
    assert.deepEqual(
      april.json.items.map((b) => b.id).sort(),
      [billIds.m1Paid, billIds.m2Overdue].sort(),
    );
    const merchantMay = await get("platform", `/v1/service-bills?orgId=${ids.m2}&${may}`);
    assert.deepEqual(merchantMay.json.items.map((b) => b.id), [billIds.m2Draft]);
  });

  it("rejects bad agentOrgId / billing period and agents outside scope", async () => {
    assert.equal((await get("platform", `/v1/service-bills?agentOrgId=nope`)).status, 400);
    assert.equal((await get("platform", `/v1/service-bills/summary?agentOrgId=nope`)).status, 400);
    assert.equal((await get("platform", `/v1/service-bills?periodFrom=2026-05-01`)).status, 400);
    assert.equal((await get("platform", `/v1/service-bills?periodFrom=2026-05-31&periodTo=2026-05-01`)).status, 400);
    assert.equal((await get("platform", `/v1/service-bills/summary?periodFrom=2026-5-1&periodTo=2026-05-31`)).status, 400);
    assert.equal((await get("agent", `/v1/service-bills?agentOrgId=${ids.otherAgent}`)).status, 403);
    assert.equal((await get("agent", `/v1/service-bills/summary?agentOrgId=${ids.otherAgent}`)).status, 403);
  });

  it("validates params", async () => {
    assert.equal((await get("agent", `/v1/service-bills?bucket=bogus`)).status, 400);
    assert.equal((await get("agent", `/v1/service-bills?sort=secret`)).status, 400);
    assert.equal((await get("agent", `/v1/service-bills?from=2026-05-10`)).status, 400);
    assert.equal((await get("agent", `/v1/service-bills/summary?from=2026-05-10&to=2026-05-01`)).status, 400);
    assert.equal((await get("agent", `/v1/service-bills?from=2026-05-10&to=2026-05-16&tz=Mars/Base`)).status, 400);
  });
});
