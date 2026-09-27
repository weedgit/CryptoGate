/**
 * Postgres integration — dashboard aggregate endpoints (kpis / series / rates / org-cards).
 * Skipped when DATABASE_URL is unset. Seeds its own orgs under a random prefix.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createSession } from "../src/auth/sessions.mjs";
import { createUser } from "../src/auth/users.mjs";
import { getPool } from "../src/db/pool.mjs";
import { insertMembership } from "../src/orgs/membership-store.mjs";
import { findPlatformOrg, insertOrgAccount } from "../src/orgs/org-store.mjs";
import { clearDashboardCache } from "../src/dashboard/dashboard-cache.mjs";
import {
  apiFetch,
  closePool,
  hasPostgres,
  runMigrations,
  startTestServer,
  stopTestServer,
} from "./helpers/postgres-integration.mjs";

const describePg = hasPostgres() ? describe : describe.skip;
const TZ = "America/Los_Angeles";
const WEEK = `from=2026-05-10&to=2026-05-16&tz=${encodeURIComponent(TZ)}`;

describePg("dashboard aggregates (Postgres integration)", () => {
  /** @type {import("node:http").Server} */
  let server;
  let base = "";
  const ids = /** @type {Record<string, string>} */ ({});
  const tokens = /** @type {Record<string, string>} */ ({});

  async function org(type, name, parentId) {
    const created = await insertOrgAccount({ type, name, parentId, maxAgentDepth: null });
    if (!created.ok) throw new Error(`could not create ${type} ${name}`);
    return created.row.id;
  }

  async function user(key, orgId, role) {
    const u = await createUser({ email: `${key}-${randomUUID()}@dash.test`, password: "DashTestPass12!" });
    await insertMembership({ orgId, userId: u.id, role });
    const s = await createSession({ userId: u.id, mfaVerified: true });
    tokens[key] = s.token;
    return u.id;
  }

  let seq = 0;
  async function order(orgId, createdBy, status, usd, createdAt, extra = {}) {
    seq += 1;
    const n = `${randomUUID().slice(0, 8)}-${seq}`;
    await getPool().query(
      `INSERT INTO payment_orders (
         org_id, created_by, order_number, status, matching_mode, payable_amount,
         receive_address, address_source, asset, network, expires_at,
         required_confirmations, idempotency_key, idempotency_body_hash,
         invoice_amount_usd, pricing_rate, received_amount, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'B', $5, 'addr', 'main', $6, $7,
               $8::timestamptz + interval '1 hour', 1, $3, 'h', $5, $9, $10, $8, $8)`,
      [
        orgId,
        createdBy,
        `DASH-${n}`,
        status,
        usd,
        extra.asset ?? "USDT",
        extra.network ?? "tron",
        createdAt,
        extra.rate ?? null,
        extra.received ?? null,
      ],
    );
  }

  async function bill(orgId, fields) {
    await getPool().query(
      `INSERT INTO service_bills (
         org_id, period_start, period_end, subscription_amount, volume_fee_amount,
         total_amount, due_at, status, paid_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        orgId,
        fields.periodStart,
        fields.periodEnd,
        fields.sub,
        fields.vol,
        String(Number(fields.sub) + Number(fields.vol)),
        fields.dueAt,
        fields.status,
        fields.paidAt ?? null,
        fields.createdAt ?? "2026-04-01T00:00:00Z",
      ],
    );
  }

  const get = async (who, path) => {
    const res = await apiFetch(base, path, { token: tokens[who] });
    return res;
  };

  before(async () => {
    runMigrations();
    clearDashboardCache();
    const prefix = `dash-${randomUUID().slice(0, 6)}`;
    let platform = await findPlatformOrg();
    if (!platform) {
      const created = await insertOrgAccount({
        type: "platform",
        name: "Dash Test Platform",
        parentId: null,
        maxAgentDepth: 1,
      });
      platform = created.row;
    }
    ids.platform = platform.id;
    ids.agent = await org("agent", `${prefix}-agent`, platform.id);
    ids.m1 = await org("merchant", `${prefix}-m1`, ids.agent);
    ids.s1 = await org("merchant_site", `${prefix}-s1`, ids.m1);
    ids.m2 = await org("merchant", `${prefix}-m2`, platform.id);
    await getPool().query(`UPDATE org_accounts SET created_at = '2026-05-11T12:00:00Z' WHERE id = $1`, [ids.m1]);

    await user("platform", platform.id, "owner");
    await user("agent", ids.agent, "owner");
    const m1Owner = await user("m1", ids.m1, "owner");
    const cashier = await user("cashier", ids.m1, "cashier");
    const m2Owner = await user("m2", ids.m2, "owner");

    // In range (LA dates May 10–16).
    await order(ids.m1, m1Owner, "completed", "100", "2026-05-10T18:00:00Z", { rate: "1.0001" });
    await order(ids.m1, m1Owner, "completed", "50", "2026-05-11T06:30:00Z", { rate: "1.0003" }); // May 10 23:30 LA
    await order(ids.s1, m1Owner, "confirmed", "25", "2026-05-12T12:00:00Z", {
      asset: "ETH",
      network: "ethereum",
      rate: "3000",
      received: "0.0083",
    });
    await order(ids.m1, m1Owner, "expired", "10", "2026-05-12T12:00:00Z");
    await order(ids.m1, m1Owner, "payment_anomaly", "7", "2026-05-12T13:00:00Z");
    await order(ids.m2, m2Owner, "completed", "200", "2026-05-13T12:00:00Z");
    await order(ids.m1, cashier, "completed", "5", "2026-05-14T12:00:00Z");
    // Previous period (May 3–9).
    await order(ids.m1, m1Owner, "completed", "40", "2026-05-05T12:00:00Z");

    await bill(ids.m1, {
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
      sub: "49",
      vol: "10",
      dueAt: "2026-05-12T12:00:00Z",
      status: "paid",
      paidAt: "2026-05-13T12:00:00Z",
    });
    await bill(ids.m2, {
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      sub: "30",
      vol: "5",
      dueAt: "2026-05-15T12:00:00Z",
      status: "overdue",
    });

    await getPool().query(
      `INSERT INTO commission_payouts (
         payee_org_id, payee_name, payer, period_key, period_label,
         commission_percent, commission_amount, payout_status, payment_link)
       VALUES ($1, 'A', 'platform', '2026-05', 'May 2026', '10', 12.5, 'issued', '/x'),
              ($1, 'A', 'platform', '2026-04', 'Apr 2026', '10', 7, 'paid', '/y')`,
      [ids.agent],
    );

    ({ server, base } = await startTestServer());
  });

  after(async () => {
    if (server) await stopTestServer(server);
    await closePool();
  });

  it("agent KPIs cover its subtree only (merchant + site), with previous period", async () => {
    const { status, json } = await get("agent", `/v1/dashboard/kpis?${WEEK}&orgId=${ids.agent}`);
    assert.equal(status, 200);
    assert.equal(json.orders.settled, 4);
    assert.equal(json.orders.volumeUsd, 180);
    assert.equal(json.orders.total, 6);
    assert.equal(json.orders.prevSettled, 1);
    assert.equal(json.orders.prevVolumeUsd, 40);
    assert.equal(json.orders.volumeTrend, 350);
    assert.equal(json.orders.anomalies, 1);
    assert.equal(json.bills.paid, 1);
    assert.equal(json.bills.feesCollected, 59);
    assert.equal(json.bills.overdue, 0);
    assert.deepEqual(json.commissions, { owed: 12.5, paid: 0 });
    assert.deepEqual(json.accounts.merchants, { total: 2, active: 2, paused: 0, new: 1 });
    assert.equal(json.accounts.agents, null);
  });

  it("platform KPIs include every merchant", async () => {
    const { status, json } = await get("platform", `/v1/dashboard/kpis?${WEEK}`);
    assert.equal(status, 200);
    assert.ok(json.orders.settled >= 5);
    assert.ok(json.orders.volumeUsd >= 380);
    assert.ok(json.bills.overdue >= 1);
    assert.ok(json.bills.feesBilled >= 94);
    assert.ok(json.commissions.owed >= 12.5);
    assert.ok(json.accounts.agents.total >= 1);
  });

  it("merchant owner sees merchant + sites; cashier sees only own orders and no bills", async () => {
    const m1 = await get("m1", `/v1/dashboard/kpis?${WEEK}`);
    assert.equal(m1.status, 200);
    assert.equal(m1.json.orders.volumeUsd, 180);
    assert.equal(m1.json.commissions, null);
    assert.ok(Array.isArray(m1.json.byOrg));
    assert.equal(m1.json.byOrg.find((r) => r.orgId === ids.m1)?.anomalies, 1);
    const site = m1.json.byOrg.find((r) => r.orgId === ids.s1);
    assert.equal(site?.orders, 1);
    assert.equal(site?.volumeUsd, 25);

    const cashier = await get("cashier", `/v1/dashboard/kpis?${WEEK}`);
    assert.equal(cashier.status, 200);
    assert.equal(cashier.json.orders.settled, 1);
    assert.equal(cashier.json.orders.volumeUsd, 5);
    assert.equal(cashier.json.bills.feesCollected, 0);
  });

  it("rejects orgs outside the caller's scope", async () => {
    const res = await get("agent", `/v1/dashboard/kpis?${WEEK}&orgId=${ids.m2}`);
    assert.equal(res.status, 403);
    const m2 = await get("m2", `/v1/dashboard/series?${WEEK}&orgId=${ids.m1}`);
    assert.equal(m2.status, 403);
  });

  it("daily series buckets by the viewer's time zone", async () => {
    const { status, json } = await get(
      "agent",
      `/v1/dashboard/series?${WEEK}&orgId=${ids.agent}&metrics=volume,settled,newMerchants`,
    );
    assert.equal(status, 200);
    assert.equal(json.interval, "day");
    assert.equal(json.keys.length, 7);
    assert.equal(json.keys[0], "2026-05-10");
    assert.deepEqual(json.series.volume, [150, 0, 25, 0, 5, 0, 0]);
    assert.deepEqual(json.series.settled, [2, 0, 1, 0, 1, 0, 0]);
    assert.deepEqual(json.series.newMerchants, [0, 1, 0, 0, 0, 0, 0]);
  });

  it("single day → hourly buckets", async () => {
    const { json } = await get(
      "agent",
      `/v1/dashboard/series?from=2026-05-10&to=2026-05-10&tz=${encodeURIComponent(TZ)}&orgId=${ids.agent}`,
    );
    assert.equal(json.interval, "hour");
    assert.equal(json.keys.length, 24);
    const at = (k) => json.series.volume[json.keys.indexOf(k)];
    assert.equal(at("2026-05-10T11"), 100);
    assert.equal(at("2026-05-10T23"), 50);
  });

  it("long ranges → weekly buckets with the same total", async () => {
    const { json } = await get(
      "agent",
      `/v1/dashboard/series?from=2026-03-01&to=2026-05-16&tz=${encodeURIComponent(TZ)}&orgId=${ids.agent}`,
    );
    assert.equal(json.interval, "week");
    assert.equal(json.keys.length, 11);
    assert.equal(json.series.volume.reduce((a, b) => a + b, 0), 220);
  });

  it("asset filter returns native amounts", async () => {
    const { json } = await get(
      "agent",
      `/v1/dashboard/series?${WEEK}&orgId=${ids.agent}&metrics=volume,volumeAsset&asset=ETH&network=ethereum`,
    );
    assert.deepEqual(json.series.volume, [0, 0, 25, 0, 0, 0, 0]);
    assert.equal(json.series.volumeAsset[2], 0.0083);
  });

  it("rates hold the last quote across empty buckets", async () => {
    const { status, json } = await get("agent", `/v1/dashboard/rates?${WEEK}&orgId=${ids.agent}`);
    assert.equal(status, 200);
    const eth = json.pairs.find((p) => p.asset === "ETH" && p.network === "ethereum");
    assert.equal(eth.quoteCount, 1);
    assert.equal(eth.latest, 3000);
    assert.deepEqual(eth.series, [0, 0, 3000, 3000, 3000, 3000, 3000]);
    const usdt = json.pairs.find((p) => p.asset === "USDT" && p.network === "tron");
    assert.equal(usdt.series[0], 1.0002);
  });

  it("org cards sum subtree volume and paid fees", async () => {
    const { status, json } = await get(
      "platform",
      `/v1/dashboard/org-cards?${WEEK}&orgIds=${ids.agent},${ids.m2}`,
    );
    assert.equal(status, 200);
    const agent = json.cards.find((c) => c.orgId === ids.agent);
    const m2 = json.cards.find((c) => c.orgId === ids.m2);
    assert.equal(agent.volumeUsd, 180);
    assert.equal(agent.feesCollected, 59);
    assert.equal(m2.volumeUsd, 200);
    assert.equal(m2.feesCollected, 0);
  });

  it("reports group orders on the server (status, org, day, creator, asset)", async () => {
    const { status, json } = await get("m1", `/v1/dashboard/reports?${WEEK}`);
    assert.equal(status, 200);
    assert.deepEqual(json.totals, { orders: 6, settledVolumeUsd: 180, anomalies: 1 });
    assert.deepEqual(json.byStatus.find((r) => r.status === "completed"), {
      status: "completed",
      count: 3,
      volumeUsd: 155,
    });
    assert.equal(json.byOrg.find((r) => r.orgId === ids.m1)?.count, 5);
    assert.equal(json.byOrg.find((r) => r.orgId === ids.s1)?.volumeUsd, 25);
    assert.ok(json.byOrg.every((r) => typeof r.orgName === "string"));
    assert.deepEqual(json.byDay[0], { day: "2026-05-14", count: 1, volumeUsd: 5 });
    assert.deepEqual(json.byDay.at(-1), { day: "2026-05-10", count: 2, volumeUsd: 150 });
    assert.equal(json.byCreator.length, 2);
    assert.ok(json.byCreator.every((r) => r.email?.endsWith("@dash.test")));
    assert.deepEqual(json.byAsset.find((r) => r.asset === "ETH"), {
      asset: "ETH",
      network: "ethereum",
      count: 1,
      volumeUsd: 25,
    });

    const allTime = await get("m1", `/v1/dashboard/reports?tz=${encodeURIComponent(TZ)}`);
    assert.equal(allTime.json.totals.orders, 7);

    const cashier = await get("cashier", `/v1/dashboard/reports?${WEEK}`);
    assert.equal(cashier.json.totals.orders, 1);
    assert.equal((await get("m2", `/v1/dashboard/reports?${WEEK}&orgId=${ids.m1}`)).status, 403);
    assert.equal((await get("m1", `/v1/dashboard/reports?from=2026-05-10`)).status, 400);
  });

  it("validates params", async () => {
    assert.equal((await get("agent", `/v1/dashboard/kpis?from=2026-05-10`)).status, 400);
    assert.equal(
      (await get("agent", `/v1/dashboard/kpis?from=2024-01-01&to=2026-05-10`)).json.code,
      "range_too_long",
    );
    assert.equal((await get("agent", `/v1/dashboard/series?${WEEK}&metrics=secret`)).status, 400);
    assert.equal((await get("agent", `/v1/dashboard/org-cards?${WEEK}`)).status, 400);
    assert.equal((await apiFetch(base, `/v1/dashboard/kpis?${WEEK}`)).status, 401);
  });
});
