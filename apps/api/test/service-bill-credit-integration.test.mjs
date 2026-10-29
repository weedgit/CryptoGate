/**
 * Postgres integration — merchant service-bill credit is spent once (M22).
 * Skipped when DATABASE_URL is unset.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import {
  addMerchantServiceBillCredit,
  consumeMerchantServiceBillCredit,
} from "../src/commercial/merchant-commercial-store.mjs";
import { getPool } from "../src/db/pool.mjs";
import { findPlatformOrg, insertOrgAccount } from "../src/orgs/org-store.mjs";
import { hasPostgres, runMigrations } from "./helpers/postgres-integration.mjs";

const describePg = hasPostgres() ? describe : describe.skip;

describePg("service-bill credit (M22)", () => {
  /** @type {string} */
  let merchantId;

  before(async () => {
    runMigrations();
    const platform =
      (await findPlatformOrg()) ??
      (await insertOrgAccount({ type: "platform", name: "M22 Platform", parentId: null, maxAgentDepth: 1 })).row;
    merchantId = (
      await insertOrgAccount({ type: "merchant", name: `m22-${Date.now()}`, parentId: platform.id })
    ).row.id;
    await getPool().query(
      `INSERT INTO merchant_commercial (org_id, tier, volume_fee_percent, effective_from, service_bill_credit_usd)
       VALUES ($1, 'small', '0.5', now(), '10.00')`,
      [merchantId],
    );
  });

  async function balance() {
    const { rows } = await getPool().query(
      `SELECT service_bill_credit_usd FROM merchant_commercial WHERE org_id = $1`,
      [merchantId],
    );
    return rows[0].service_bill_credit_usd;
  }

  it("two concurrent bill runs cannot both spend the same credit", async () => {
    const [a, b] = await Promise.all([
      consumeMerchantServiceBillCredit(merchantId, "8.00"),
      consumeMerchantServiceBillCredit(merchantId, "8.00"),
    ]);
    const applied = [a.creditApplied, b.creditApplied].map(Number).sort((x, y) => x - y);
    assert.deepEqual(applied, [2, 8]);
    assert.equal(await balance(), "0.00");
    assert.deepEqual([a.newTotal, b.newTotal].sort(), ["0.00", "6.00"]);
  });

  it("returned credit is available again", async () => {
    await addMerchantServiceBillCredit(merchantId, "8.00");
    assert.equal(await balance(), "8.00");
    const next = await consumeMerchantServiceBillCredit(merchantId, "5.50");
    assert.equal(next.creditApplied, "5.50");
    assert.equal(await balance(), "2.50");
  });
});
