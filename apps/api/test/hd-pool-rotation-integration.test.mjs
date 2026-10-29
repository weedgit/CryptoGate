/**
 * Postgres integration — HD pool reuse after xPub rotation (M10).
 * Skipped when DATABASE_URL is unset.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { HDKey } from "@scure/bip32";
import { getPool } from "../src/db/pool.mjs";
import { claimHdPoolAddress } from "../src/mode-s/hd-pool-store.mjs";
import { hdMaterialFingerprint } from "../src/security/spend-material.mjs";
import { findPlatformOrg, insertOrgAccount } from "../src/orgs/org-store.mjs";
import { hasPostgres, runMigrations } from "./helpers/postgres-integration.mjs";

const describePg = hasPostgres() ? describe : describe.skip;

/** @param {number} seedByte */
function accountXpub(seedByte) {
  return HDKey.fromMasterSeed(Buffer.alloc(32, seedByte)).derive("m/44'/195'/0'").publicExtendedKey;
}

describePg("HD pool after xPub rotation (M10)", () => {
  /** @type {string} */
  let merchantId;
  const oldXpub = accountXpub(1);
  const newXpub = accountXpub(2);

  before(async () => {
    runMigrations();
    const platform =
      (await findPlatformOrg()) ??
      (await insertOrgAccount({ type: "platform", name: "M10 Platform", parentId: null, maxAgentDepth: 1 })).row;
    merchantId = (
      await insertOrgAccount({
        type: "merchant",
        name: `m10-merchant-${Date.now()}`,
        parentId: platform.id,
        maxAgentDepth: null,
      })
    ).row.id;
    await getPool().query(
      `INSERT INTO merchant_xpubs (org_id, asset, network, xpub) VALUES ($1, 'USDT', 'tron', $2)`,
      [merchantId, newXpub],
    );
    await getPool().query(
      `INSERT INTO hd_pool_addresses (org_id, asset, network, hd_index, receive_address, status, xpub_fp)
       VALUES ($1, 'USDT', 'tron', 0, 'TOldWalletAddressNeverReuse0000000', 'FREE', $2)`,
      [merchantId, hdMaterialFingerprint(oldXpub)],
    );
  });

  it("never hands out a FREE address of the previous xPub", async () => {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const claimed = await claimHdPoolAddress(client, {
        merchantId,
        asset: "USDT",
        network: "tron",
        mainSettlementAddress: "TMainSettlementAddressExample00000",
      });
      await client.query("ROLLBACK");
      assert.notEqual(claimed.receiveAddress, "TOldWalletAddressNeverReuse0000000");
      assert.match(claimed.receiveAddress, /^T/);
    } finally {
      client.release();
    }
  });

  it("still reuses FREE addresses of the active xPub", async () => {
    await getPool().query(
      `INSERT INTO hd_pool_addresses (org_id, asset, network, hd_index, receive_address, status, xpub_fp)
       VALUES ($1, 'USDT', 'tron', 7, 'TActiveWalletFreeAddress0000000000', 'FREE', $2)`,
      [merchantId, hdMaterialFingerprint(newXpub)],
    );
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const claimed = await claimHdPoolAddress(client, {
        merchantId,
        asset: "USDT",
        network: "tron",
        mainSettlementAddress: "TMainSettlementAddressExample00000",
      });
      await client.query("ROLLBACK");
      assert.equal(claimed.receiveAddress, "TActiveWalletFreeAddress0000000000");
    } finally {
      client.release();
    }
  });
});

describePg("Mode S same-amount conflict (M11)", () => {
  it("treats 100 and 100.00 as the same amount", async () => {
    const { hasModeSSameAmountConflict } = await import("../src/orders/order-store.mjs");
    const { createUser } = await import("../src/auth/users.mjs");
    const platform = await findPlatformOrg();
    const merchant = (
      await insertOrgAccount({
        type: "merchant",
        name: `m11-merchant-${Date.now()}`,
        parentId: platform.id,
        maxAgentDepth: null,
      })
    ).row.id;
    const creator = await createUser({
      email: `m11-${Date.now()}@paymentgate.local`,
      password: "M11CreatorPass1234!",
    });
    await getPool().query(
      `INSERT INTO payment_orders (
         org_id, created_by, order_number, status, matching_mode, payable_amount,
         receive_address, address_source, asset, network, expires_at,
         required_confirmations, idempotency_key, idempotency_body_hash, invoice_amount_usd)
       VALUES ($1, $2, $3, 'pending_payment', 'S', '100', 'TMainS', 'main', 'USDT', 'tron',
               now() + interval '1 hour', 19, $3, 'h', '100')`,
      [merchant, creator.id, `M11-${Date.now()}`],
    );
    const conflict = await hasModeSSameAmountConflict(getPool(), {
      merchantId: merchant,
      asset: "USDT",
      network: "tron",
      payableAmount: "100.00",
      statuses: ["pending_payment"],
    });
    assert.equal(conflict, true);
  });
});
