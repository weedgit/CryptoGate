/**
 * Postgres integration — billable volume is USD by confirmation time, and retention cannot
 * delete unbilled completed orders (H10). Skipped when DATABASE_URL is unset.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { createUser } from "../src/auth/users.mjs";
import { getPool } from "../src/db/pool.mjs";
import { insertOrgAccount, findPlatformOrg } from "../src/orgs/org-store.mjs";
import { purgeTerminalOrdersBatch } from "../src/retention/order-retention-purge.mjs";
import { sumCompletedPayableVolume } from "../src/service-bills/service-bill-store.mjs";
import { hasPostgres, runMigrations } from "./helpers/postgres-integration.mjs";

const describePg = hasPostgres() ? describe : describe.skip;

describePg("billing volume and retention (H10)", () => {
  /** @type {string} */
  let merchantId;
  /** @type {string} */
  let creatorId;
  let n = 0;

  /**
   * @param {{ status: string, asset: string, network: string, payable: string, usd: string,
   *   createdAt: string, confirmedAt: string | null, updatedAt: string }} o
   */
  async function order(o) {
    n += 1;
    const { rows } = await getPool().query(
      `INSERT INTO payment_orders (
         org_id, created_by, order_number, status, matching_mode, payable_amount,
         receive_address, address_source, asset, network, expires_at,
         required_confirmations, idempotency_key, idempotency_body_hash,
         invoice_amount_usd, created_at, updated_at, confirmed_at)
       VALUES ($1, $11, $2, $3, 'B', $4, 'addr', 'main', $5, $6,
               $7::timestamptz + interval '1 hour', 1, $2, 'h', $8, $7, $9, $10)
       RETURNING id`,
      [merchantId, `H10-${Date.now()}-${n}`, o.status, o.payable, o.asset, o.network,
        o.createdAt, o.usd, o.updatedAt, o.confirmedAt, creatorId],
    );
    return rows[0].id;
  }

  before(async () => {
    runMigrations();
    const platform =
      (await findPlatformOrg()) ??
      (await insertOrgAccount({ type: "platform", name: "H10 Platform", parentId: null, maxAgentDepth: 1 })).row;
    const created = await insertOrgAccount({
      type: "merchant",
      name: `h10-merchant-${Date.now()}`,
      parentId: platform.id,
      maxAgentDepth: null,
    });
    merchantId = created.row.id;
    creatorId = (
      await createUser({ email: `h10-${Date.now()}@paymentgate.local`, password: "H10CreatorPass123!" })
    ).id;
  });

  it("sums USD invoice amounts, not token units, by confirmation time", async () => {
    await order({
      status: "completed", asset: "ETH", network: "ethereum", payable: "0.5", usd: "1500.00",
      createdAt: "2026-09-10T00:00:00Z", confirmedAt: "2026-09-10T00:10:00Z",
      updatedAt: "2026-09-10T00:10:00Z",
    });
    await order({
      status: "completed", asset: "TRX", network: "tron", payable: "400", usd: "100.00",
      createdAt: "2026-09-12T00:00:00Z", confirmedAt: "2026-09-12T00:05:00Z",
      updatedAt: "2026-09-12T00:05:00Z",
    });
    // Confirmed in August, touched by the watcher in September: belongs to August only.
    await order({
      status: "completed", asset: "USDT", network: "tron", payable: "50", usd: "50.00",
      createdAt: "2026-08-31T23:00:00Z", confirmedAt: "2026-08-31T23:30:00Z",
      updatedAt: "2026-09-02T00:00:00Z",
    });
    const september = await sumCompletedPayableVolume(
      [merchantId], "2026-09-01T00:00:00Z", "2026-10-01T00:00:00Z",
    );
    assert.equal(Number(september), 1600);
    const august = await sumCompletedPayableVolume(
      [merchantId], "2026-08-01T00:00:00Z", "2026-09-01T00:00:00Z",
    );
    assert.equal(Number(august), 50);
  });

  it("a 7-day retention cannot purge completed orders before they are billed", async () => {
    const day = 24 * 60 * 60 * 1000;
    const tenDaysAgo = new Date(Date.now() - 10 * day).toISOString();
    const completed = await order({
      status: "completed", asset: "USDT", network: "tron", payable: "20", usd: "20.00",
      createdAt: tenDaysAgo, confirmedAt: tenDaysAgo, updatedAt: tenDaysAgo,
    });
    const expired = await order({
      status: "expired", asset: "USDT", network: "tron", payable: "20", usd: "20.00",
      createdAt: tenDaysAgo, confirmedAt: null, updatedAt: tenDaysAgo,
    });
    await purgeTerminalOrdersBatch({ orgIds: [merchantId], orderDeleteDays: 7 });
    const { rows } = await getPool().query(
      `SELECT id FROM payment_orders WHERE id = ANY($1::uuid[])`,
      [[completed, expired]],
    );
    assert.deepEqual(rows.map((r) => r.id), [completed]);
  });
});
