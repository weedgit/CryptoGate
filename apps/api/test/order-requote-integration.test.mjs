import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { HDKey } from "@scure/bip32";
import { resolvePlatformFeeNetwork } from "@paymentgate/domain";
import {
  closePool,
  hasPostgres,
  runMigrations,
  startTestServer,
  stopTestServer,
} from "./helpers/postgres-integration.mjs";
import { getPool } from "../src/db/pool.mjs";
import { createSession } from "../src/auth/sessions.mjs";
import { createUser, findUserByEmail } from "../src/auth/users.mjs";
import { SESSION_COOKIE_NAME } from "../src/http/cookies.mjs";
import { insertMembership } from "../src/orgs/membership-store.mjs";
import { findPlatformOrg, insertOrgAccount } from "../src/orgs/org-store.mjs";
import { forceSettlementAddress } from "../src/settlement/settlement-store.mjs";
import { upsertMatchingModeSettings } from "../src/matching-mode/matching-mode-store.mjs";
import { upsertXpub } from "../src/xpub/xpub-store.mjs";
import {
  getPlatformPricingSettings,
  updateMerchantPricingSettings,
  updatePlatformPricingSettings,
} from "../src/rates/pricing-settings-store.mjs";
import { clearUsdPriceCache } from "../src/rates/usd-price.mjs";
import { expireDuePaymentOrders } from "../src/orders/order-expiry.mjs";

const skip = !hasPostgres();
const PREFIX = "fx-requote-";
const PASSWORD = "FxRequoteTest12!";
const TRON_MAIN = "TFxRequoteMainTronAddr000000000001";
const ETH_MAIN = "0x00000000000000000000000000000000000fe001";
const VECTOR_XPUB = HDKey.fromMasterSeed(
  Uint8Array.from(Buffer.from("000102030405060708090a0b0c0d0e0f", "hex")),
).publicExtendedKey;

/** USD price per asset served by the stubbed venues. */
const prices = { USDT: "1", USDC: "1", ETH: "4000", TRX: "0.25" };
const COINGECKO_TO_ASSET = { tether: "USDT", "usd-coin": "USDC", ethereum: "ETH", tron: "TRX" };
const KRAKEN_TO_ASSET = { USDTZUSD: "USDT", USDCUSD: "USDC", XETHZUSD: "ETH", TRXUSD: "TRX" };
const BINANCE_TO_ASSET = { USDCUSDT: "USDC", ETHUSDT: "ETH", TRXUSDT: "TRX" };

const realFetch = globalThis.fetch;
function stubFetch(input, init) {
  const url = new URL(String(input));
  const json = (body) =>
    Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  if (url.hostname === "api.binance.com") {
    const asset = BINANCE_TO_ASSET[url.searchParams.get("symbol")];
    return asset ? json({ price: prices[asset] }) : Promise.resolve(new Response("{}", { status: 400 }));
  }
  if (url.hostname === "api.coingecko.com") {
    const id = url.searchParams.get("ids");
    return json({ [id]: { usd: Number(prices[COINGECKO_TO_ASSET[id]]) } });
  }
  if (url.hostname === "api.kraken.com") {
    const pair = url.searchParams.get("pair");
    return json({ error: [], result: { [pair]: { c: [prices[KRAKEN_TO_ASSET[pair]], "1"] } } });
  }
  return realFetch(input, init);
}

describe("order re-quote + pricing kill switch (Postgres integration)", { skip }, () => {
  /** @type {import("node:http").Server} */
  let server;
  let base = "";
  let merchantId = "";
  let ownerToken = "";
  let viewerToken = "";
  let platformDefaults;
  let seq = 0;

  async function api(path, { method = "GET", token = ownerToken, body, headers = {} } = {}) {
    const h = { Accept: "application/json", Cookie: `${SESSION_COOKIE_NAME}=${token}`, ...headers };
    if (body !== undefined) h["Content-Type"] = "application/json";
    const res = await fetch(`${base}${path}`, {
      method,
      headers: h,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  }

  async function createOrder(body) {
    seq += 1;
    const res = await api("/v1/orders", {
      method: "POST",
      headers: { "Idempotency-Key": `${PREFIX}${Date.now()}-${seq}`, "X-PaymentGate-Client": "web" },
      body: { orgId: merchantId, validitySeconds: 1800, ...body },
    });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    return res.json;
  }

  async function requote(orderId, body, token = ownerToken) {
    return api(`/v1/orders/${orderId}/quote`, { method: "POST", token, body });
  }

  async function row(orderId) {
    const { rows } = await getPool().query(`SELECT * FROM payment_orders WHERE id = $1`, [orderId]);
    return rows[0];
  }

  async function ensureUser(email) {
    const existing = await findUserByEmail(email);
    const user = existing ?? (await createUser({ email, password: PASSWORD }));
    await getPool().query(
      `UPDATE users SET first_name = 'Fx', last_name = 'Tester' WHERE id = $1`,
      [user.id],
    );
    return user;
  }

  before(async () => {
    runMigrations();
    globalThis.fetch = stubFetch;
    ({ server, base } = await startTestServer());
    platformDefaults = await getPlatformPricingSettings();

    const platform =
      (await findPlatformOrg()) ??
      (await insertOrgAccount({ type: "platform", name: "FX Test Platform", parentId: null, maxAgentDepth: 1 })).row;
    const created = await insertOrgAccount({
      type: "merchant",
      name: `${PREFIX}merchant-${Date.now()}`,
      parentId: platform.id,
      maxAgentDepth: null,
    });
    assert.ok(created.ok);
    merchantId = created.row.id;
    await getPool().query(
      `UPDATE org_accounts SET billing_email = 'billing@fx-requote.local', country = 'US' WHERE id = $1`,
      [merchantId],
    );
    // Activation fee paid (billing anchor set) so live merchant actions are allowed.
    await getPool().query(
      `INSERT INTO merchant_commercial (org_id, tier, volume_fee_percent, effective_from, billing_anchor_at)
       VALUES ($1, 'small', '0.5', now(), now())
       ON CONFLICT (org_id) DO UPDATE SET billing_anchor_at = now()`,
      [merchantId],
    );

    const run = Date.now();
    const owner = await ensureUser(`${PREFIX}owner-${run}@paymentgate.local`);
    const viewer = await ensureUser(`${PREFIX}viewer-${run}@paymentgate.local`);
    await insertMembership({ orgId: merchantId, userId: owner.id, role: "owner" });
    await insertMembership({ orgId: merchantId, userId: viewer.id, role: "viewer" });
    ownerToken = (await createSession({ userId: owner.id, mfaVerified: true })).token;
    viewerToken = (await createSession({ userId: viewer.id, mfaVerified: true })).token;

    await forceSettlementAddress({ orgId: merchantId, asset: "USDT", network: "tron", address: TRON_MAIN });
    // The account setup gate wants a wallet on the platform-fee network (Tron Nile on testnet).
    await forceSettlementAddress({
      orgId: merchantId,
      asset: "USDT",
      network: resolvePlatformFeeNetwork(),
      address: TRON_MAIN,
    });
    await forceSettlementAddress({ orgId: merchantId, asset: "USDT", network: "ethereum", address: ETH_MAIN });
    await forceSettlementAddress({ orgId: merchantId, asset: "ETH", network: "ethereum", address: ETH_MAIN });
  });

  beforeEach(async () => {
    clearUsdPriceCache();
    Object.assign(prices, { USDT: "1", USDC: "1", ETH: "4000", TRX: "0.25" });
    await upsertMatchingModeSettings({ orgId: merchantId, matchingMode: "C" });
    await updateMerchantPricingSettings(merchantId, { pricingMode: "market", quoteLockSeconds: 900 });
    await getPool().query(
      `UPDATE payment_orders SET status = 'cancelled' WHERE org_id = $1 AND status = 'pending_payment'`,
      [merchantId],
    );
  });

  after(async () => {
    await updatePlatformPricingSettings({
      ratesEnabled: platformDefaults.ratesEnabled,
      modePegged1to1Enabled: platformDefaults.modePegged1to1Enabled,
      modeMarketEnabled: platformDefaults.modeMarketEnabled,
    }).catch(() => {});
    globalThis.fetch = realFetch;
    if (server) await stopTestServer(server);
    await closePool();
  });

  it("re-prices through matching: new rate, unique payable, same main address", async () => {
    const order = await createOrder({ asset: "USDT", network: "tron", amountUsd: "100" });
    const before = await row(order.id);
    assert.equal(before.receive_address, TRON_MAIN);
    assert.equal(before.validity_seconds, 1800);

    const other = await createOrder({ asset: "USDT", network: "tron", amountUsd: "100" });
    assert.notEqual(String((await row(other.id)).payable_amount), String(before.payable_amount));

    prices.USDT = "0.98";
    clearUsdPriceCache();
    const res = await requote(order.id);
    assert.equal(res.status, 200, JSON.stringify(res.json));
    const afterRow = await row(order.id);
    assert.equal(afterRow.pricing_rate, "0.98");
    assert.equal(afterRow.receive_address, TRON_MAIN);
    assert.ok(Number(afterRow.payable_amount) > 102, String(afterRow.payable_amount));
    assert.notEqual(String(afterRow.payable_amount), String((await row(other.id)).payable_amount));

    const { rows: audits } = await getPool().query(
      `SELECT metadata FROM audit_log WHERE action = 'payment_order.requoted' AND metadata->>'orderId' = $1`,
      [order.id],
    );
    assert.equal(audits.length, 1);
  });

  it("does not collide with itself when the amount is unchanged (Mode B)", async () => {
    await upsertMatchingModeSettings({ orgId: merchantId, matchingMode: "B" });
    const order = await createOrder({ asset: "USDT", network: "tron", amountUsd: "50" });
    const payableBefore = String((await row(order.id)).payable_amount);
    const res = await requote(order.id);
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(String((await row(order.id)).payable_amount), payableBefore);

    const clash = await createOrder({ asset: "USDT", network: "ethereum", amountUsd: "50" });
    const moved = await requote(clash.id, { network: "tron" });
    assert.equal(moved.status, 409);
    assert.equal(moved.json.error?.code ?? moved.json.code, "mode_b_amount_in_use");
    const unchanged = await row(clash.id);
    assert.equal(unchanged.network, "ethereum");
    assert.equal(unchanged.receive_address, ETH_MAIN);
  });

  it("moving network takes that network's receive address and confirmations", async () => {
    const order = await createOrder({ asset: "USDT", network: "tron", amountUsd: "25" });
    const res = await requote(order.id, { network: "ethereum" });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    const moved = await row(order.id);
    assert.equal(moved.network, "ethereum");
    assert.equal(moved.receive_address, ETH_MAIN);
    assert.notEqual(moved.required_confirmations, null);
  });

  it("exact-crypto invoices keep their asset and network", async () => {
    const order = await createOrder({ asset: "ETH", network: "ethereum", amountCrypto: "0.01" });
    const blocked = await requote(order.id, { asset: "USDT" });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.json.error?.code ?? blocked.json.code, "crypto_invoice_pair_locked");
    assert.equal((await row(order.id)).asset, "ETH");

    prices.ETH = "5000";
    clearUsdPriceCache();
    const same = await requote(order.id);
    assert.equal(same.status, 200, JSON.stringify(same.json));
    const r = await row(order.id);
    assert.equal(r.pricing_mode, "crypto_exact");
    assert.equal(r.invoice_amount, "0.01");
  });

  it("read-only roles cannot re-quote", async () => {
    const order = await createOrder({ asset: "USDT", network: "tron", amountUsd: "10" });
    const res = await requote(order.id, undefined, viewerToken);
    assert.equal(res.status, 403);
  });

  it("expired orders cannot be revived; a refresh re-opens the payment window", async () => {
    const order = await createOrder({ asset: "USDT", network: "tron", amountUsd: "12" });
    await getPool().query(
      `UPDATE payment_orders SET expires_at = now() + interval '30 seconds',
                                 quote_expires_at = now() + interval '30 seconds'
       WHERE id = $1`,
      [order.id],
    );
    const res = await requote(order.id);
    assert.equal(res.status, 200, JSON.stringify(res.json));
    const r = await row(order.id);
    const minutesLeft = (new Date(r.expires_at).getTime() - Date.now()) / 60000;
    assert.ok(minutesLeft > 14 && minutesLeft <= 15, `expires in ${minutesLeft} min`);
    assert.ok(new Date(r.expires_at) <= new Date(r.quote_expires_at));

    await getPool().query(
      `UPDATE payment_orders SET expires_at = now() - interval '1 second' WHERE id = $1`,
      [order.id],
    );
    const late = await requote(order.id);
    assert.equal(late.status, 409);
    assert.equal(late.json.error?.code ?? late.json.code, "order_expired");
  });

  it("Smart address (HD pool): new address bound, old one cools down", async () => {
    await upsertMatchingModeSettings({ orgId: merchantId, matchingMode: "S" });
    await upsertXpub({ orgId: merchantId, asset: "USDT", network: "tron", xPub: VECTOR_XPUB, cooldownMs: 0 });
    const onMain = await createOrder({ asset: "USDT", network: "tron", amountUsd: "30" });
    assert.equal((await row(onMain.id)).address_source, "main");
    // Same amount while the main address holds 30 → Smart address moves it to the HD pool.
    const order = await createOrder({ asset: "USDT", network: "tron", amountUsd: "30" });
    const first = await row(order.id);
    assert.equal(first.address_source, "hd_pool");

    const hdRows = async (addrs) => {
      const { rows } = await getPool().query(
        `SELECT receive_address, status, last_order_id FROM hd_pool_addresses
         WHERE org_id = $1 AND receive_address = ANY($2::text[])`,
        [merchantId, addrs],
      );
      return Object.fromEntries(rows.map((r) => [r.receive_address, r]));
    };

    // Unchanged amount still conflicts → a fresh HD address; the old one cools down.
    const res = await requote(order.id);
    assert.equal(res.status, 200, JSON.stringify(res.json));
    const second = await row(order.id);
    assert.equal(second.address_source, "hd_pool");
    assert.notEqual(second.receive_address, first.receive_address);
    let byAddr = await hdRows([first.receive_address, second.receive_address]);
    assert.equal(byAddr[first.receive_address].status, "COOLDOWN");
    assert.equal(byAddr[second.receive_address].status, "IN_USE");
    assert.equal(byAddr[second.receive_address].last_order_id, order.id);

    // New rate → no conflict → back on the main address; the HD address cools down.
    prices.USDT = "0.97";
    clearUsdPriceCache();
    const moved = await requote(order.id);
    assert.equal(moved.status, 200, JSON.stringify(moved.json));
    const third = await row(order.id);
    assert.equal(third.address_source, "main");
    assert.equal(third.receive_address, TRON_MAIN);
    assert.equal(third.hd_index, null);
    byAddr = await hdRows([second.receive_address]);
    assert.equal(byAddr[second.receive_address].status, "COOLDOWN");
  });

  it("kill switch ends open rate-priced orders, not exact-crypto ones", async () => {
    const market = await createOrder({ asset: "USDT", network: "tron", amountUsd: "40" });
    const exact = await createOrder({ asset: "ETH", network: "ethereum", amountCrypto: "0.02" });

    await updatePlatformPricingSettings({ modeMarketEnabled: false });
    try {
      const m = await row(market.id);
      assert.ok(new Date(m.expires_at).getTime() <= Date.now());
      assert.ok(new Date(m.quote_expires_at).getTime() <= Date.now());
      const e = await row(exact.id);
      assert.ok(new Date(e.expires_at).getTime() > Date.now());

      await expireDuePaymentOrders();
      assert.equal((await row(market.id)).status, "expired");
      assert.equal((await row(exact.id)).status, "pending_payment");
    } finally {
      await updatePlatformPricingSettings({ modeMarketEnabled: true });
    }
  });

  it("rejects a minimum source count USDT can never meet", async () => {
    await assert.rejects(
      () => updatePlatformPricingSettings({ minRateSources: 3, rateVenues: ["binance", "coingecko", "kraken"] }),
      /Binance has no USDT\/USD market/,
    );
  });
});
