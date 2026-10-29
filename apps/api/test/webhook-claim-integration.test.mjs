/**
 * Postgres integration — webhook delivery claims are exclusive and final states stick (M20).
 * Skipped when DATABASE_URL is unset.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPool } from "../src/db/pool.mjs";
import { findPlatformOrg, insertOrgAccount } from "../src/orgs/org-store.mjs";
import {
  claimPendingWebhookDeliveries,
  updateWebhookDeliveryResult,
} from "../src/webhooks/webhook-store.mjs";
import { hasPostgres, runMigrations } from "./helpers/postgres-integration.mjs";

const describePg = hasPostgres() ? describe : describe.skip;

describePg("webhook delivery claims (M20)", () => {
  /** @type {string} */
  let deliveryId;

  before(async () => {
    runMigrations();
    const platform =
      (await findPlatformOrg()) ??
      (await insertOrgAccount({ type: "platform", name: "M20 Platform", parentId: null, maxAgentDepth: 1 })).row;
    const merchant = (
      await insertOrgAccount({ type: "merchant", name: `m20-${Date.now()}`, parentId: platform.id })
    ).row;
    // Only this test's delivery is due: older pending rows from other suites are pushed out.
    await getPool().query(
      `UPDATE webhook_deliveries SET next_retry_at = now() + interval '1 day' WHERE status = 'pending'`,
    );
    const endpoint = await getPool().query(
      `INSERT INTO webhook_endpoints (org_id, url, signing_secret, events, enabled)
       VALUES ($1, 'https://example.com/hook', repeat('s', 40), ARRAY['payment_order.created'], true)
       RETURNING id`,
      [merchant.id],
    );
    const delivery = await getPool().query(
      `INSERT INTO webhook_deliveries (webhook_id, event_id, event_type, payload, body_raw, status, attempt, next_retry_at)
       VALUES ($1, $2, 'payment_order.created', '{}'::jsonb, '{}', 'pending', 1, now() - interval '1 second')
       RETURNING id`,
      [endpoint.rows[0].id, randomUUID()],
    );
    deliveryId = delivery.rows[0].id;
  });

  it("a claimed delivery is not handed out again while it is being posted", async () => {
    const first = await claimPendingWebhookDeliveries(20);
    assert.ok(first.some((r) => r.id === deliveryId));
    const second = await claimPendingWebhookDeliveries(20);
    assert.ok(!second.some((r) => r.id === deliveryId));
  });

  it("a late failure cannot overwrite a recorded success", async () => {
    await updateWebhookDeliveryResult({
      deliveryId,
      claimedAttempt: 1,
      status: "success",
      attempt: 1,
      httpStatus: 200,
      nextRetryAt: null,
    });
    await updateWebhookDeliveryResult({
      deliveryId,
      claimedAttempt: 1,
      status: "pending",
      attempt: 2,
      httpStatus: null,
      nextRetryAt: new Date(),
    });
    const { rows } = await getPool().query(
      `SELECT status, http_status FROM webhook_deliveries WHERE id = $1`,
      [deliveryId],
    );
    assert.deepEqual(rows[0], { status: "success", http_status: 200 });
  });
});
