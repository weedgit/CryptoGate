import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  closePool,
  hasPostgres,
  runMigrations,
  startTestServer,
  stopTestServer,
} from "./helpers/postgres-integration.mjs";
import { getPool } from "../src/db/pool.mjs";
import { createSession } from "../src/auth/sessions.mjs";
import { createUser } from "../src/auth/users.mjs";
import { SESSION_COOKIE_NAME } from "../src/http/cookies.mjs";
import { insertMembership } from "../src/orgs/membership-store.mjs";
import { findPlatformOrg, insertOrgAccount } from "../src/orgs/org-store.mjs";
import {
  getPlatformPricingSettings,
  updatePlatformPricingSettings,
} from "../src/rates/pricing-settings-store.mjs";
import { clearUsdPriceCache, expireUsdPriceCache } from "../src/rates/usd-price.mjs";
import { clearEurUsdPriceCache } from "../src/rates/eur-usd.mjs";
import { FEEDS } from "../src/rates/chainlink-reference.mjs";
import {
  clearRateFeedStatusCache,
  getRateFeedStatus,
} from "../src/rates/rate-feed-status.mjs";

const skip = !hasPostgres();
const PREFIX = "rate-feed-";
const PASSWORD = "RateFeedTest12!";

const binance = { ETHUSDT: "4004", TRXUSDT: "0.25", USDCUSDT: "1", EURUSDT: "1.25" };
const gecko = { ethereum: 4000, tron: 0.25, tether: 1, "usd-coin": 1 };
const kraken = { XETHZUSD: "3996", TRXUSD: "0.25", USDTZUSD: "1", USDCUSD: "1", ZEURZUSD: "1.25" };
const coinbase = { "ETH-USD": "4001", "USDT-USD": "1" };
const bitstamp = { ethusd: "3999", trxusd: "0.25", usdtusd: "1", usdcusd: "1", eurusd: "1.25" };
const chainlink = { ETH: 4010, USDT: 1, USDC: 1 };
const down = new Set();

function roundData(answer, updatedAt) {
  const w = (n) => BigInt(n).toString(16).padStart(64, "0");
  return `0x${w(1)}${w(answer)}${w(updatedAt)}${w(updatedAt)}${w(1)}`;
}

const assetByFeed = Object.fromEntries(
  Object.entries(FEEDS).map(([asset, f]) => [f.address.toLowerCase(), asset]),
);

const realFetch = globalThis.fetch;
function stubFetch(input, init) {
  const url = new URL(String(input));
  const json = (body) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  const fail = () => Promise.resolve(new Response("{}", { status: 500 }));
  if (url.hostname === "api.binance.com") {
    if (down.has("binance")) return fail();
    const price = binance[url.searchParams.get("symbol")];
    return price ? json({ price }) : Promise.resolve(new Response("{}", { status: 400 }));
  }
  if (url.hostname === "api.coingecko.com") {
    if (down.has("coingecko")) return fail();
    const ids = String(url.searchParams.get("ids")).split(",");
    return json(
      Object.fromEntries(
        ids.map((id) => [id, id === "tether" ? { usd: 1, eur: 0.8 } : { usd: gecko[id] }]),
      ),
    );
  }
  if (url.hostname === "api.exchange.coinbase.com") {
    if (down.has("coinbase")) return fail();
    const price = coinbase[url.pathname.split("/")[2]];
    return price ? json({ price }) : Promise.resolve(new Response("{}", { status: 404 }));
  }
  if (url.hostname === "www.bitstamp.net") {
    if (down.has("bitstamp")) return fail();
    const last = bitstamp[url.pathname.split("/")[4]];
    return last ? json({ last }) : Promise.resolve(new Response("{}", { status: 404 }));
  }
  if (url.hostname === "api.kraken.com") {
    if (down.has("kraken")) return fail();
    const pair = url.searchParams.get("pair");
    return json({ error: [], result: { [pair]: { c: [kraken[pair], "1"] } } });
  }
  if (init?.method === "POST" && typeof init.body === "string" && init.body.includes("eth_call")) {
    if (down.has("chainlink")) return fail();
    const to = JSON.parse(init.body).params[0].to.toLowerCase();
    const asset = assetByFeed[to];
    const answer = BigInt(Math.round(chainlink[asset] * 1e8));
    return json({ jsonrpc: "2.0", id: 1, result: roundData(answer, Math.floor(Date.now() / 1000)) });
  }
  return realFetch(input, init);
}

describe("platform rate feed status + test quote (Postgres integration)", { skip }, () => {
  /** @type {import("node:http").Server} */
  let server;
  let base = "";
  let platformToken = "";
  let merchantToken = "";
  let defaults;

  async function api(path, { method = "GET", token = platformToken, body } = {}) {
    const headers = { Accept: "application/json", Cookie: `${SESSION_COOKIE_NAME}=${token}` };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  }

  const testQuote = (body, token) =>
    api("/v1/platform/rates/test-quote", { method: "POST", body, token });

  before(async () => {
    runMigrations();
    globalThis.fetch = stubFetch;
    ({ server, base } = await startTestServer());
    defaults = await getPlatformPricingSettings();

    const platform =
      (await findPlatformOrg()) ??
      (await insertOrgAccount({ type: "platform", name: "Rate Feed Platform", parentId: null, maxAgentDepth: 1 })).row;
    const merchant = await insertOrgAccount({
      type: "merchant",
      name: `${PREFIX}merchant-${Date.now()}`,
      parentId: platform.id,
      maxAgentDepth: null,
    });
    assert.ok(merchant.ok);

    const run = Date.now();
    const staff = await createUser({ email: `${PREFIX}staff-${run}@paymentgate.local`, password: PASSWORD });
    const owner = await createUser({ email: `${PREFIX}owner-${run}@paymentgate.local`, password: PASSWORD });
    await getPool().query(
      `UPDATE users SET first_name = 'Rate', last_name = 'Feed' WHERE id = ANY($1::uuid[])`,
      [[staff.id, owner.id]],
    );
    await insertMembership({ orgId: platform.id, userId: staff.id, role: "viewer" });
    await insertMembership({ orgId: merchant.row.id, userId: owner.id, role: "owner" });
    platformToken = (await createSession({ userId: staff.id, mfaVerified: true })).token;
    merchantToken = (await createSession({ userId: owner.id, mfaVerified: true })).token;
  });

  beforeEach(async () => {
    down.clear();
    clearRateFeedStatusCache();
    clearUsdPriceCache();
    clearEurUsdPriceCache();
    await updatePlatformPricingSettings({
      ratesEnabled: true,
      modeMarketEnabled: true,
      modePegged1to1Enabled: true,
      minRateSources: 2,
      rateVenues: ["binance", "coingecko", "kraken"],
    });
  });

  after(async () => {
    await updatePlatformPricingSettings({
      ratesEnabled: defaults.ratesEnabled,
      modeMarketEnabled: defaults.modeMarketEnabled,
      modePegged1to1Enabled: defaults.modePegged1to1Enabled,
      minRateSources: defaults.minRateSources,
      rateVenues: defaults.rateVenues,
    }).catch(() => {});
    globalThis.fetch = realFetch;
    if (server) await stopTestServer(server);
    await closePool();
  });

  it("reports every venue, the median, deviations and Chainlink per asset", async () => {
    const res = await api("/v1/platform/rates/status");
    assert.equal(res.status, 200, JSON.stringify(res.json));
    const s = res.json;
    assert.equal(s.cached, false);
    assert.equal(s.settings.minRateSources, 2);

    const eth = s.assets.find((a) => a.asset === "ETH");
    assert.equal(eth.median, "4000");
    assert.equal(eth.healthyCount, 3);
    assert.equal(eth.quotable, true);
    const byVenue = Object.fromEntries(eth.venues.map((v) => [v.venue, v]));
    assert.equal(byVenue.binance.rate, "4004");
    assert.equal(byVenue.binance.deviationBps, 10);
    assert.equal(byVenue.coingecko.deviationBps, 0);
    assert.equal(byVenue.kraken.deviationBps, 10);
    assert.equal(eth.chainlink.rate, "4010");
    assert.equal(eth.chainlink.deviationBps, 24);
    assert.equal(eth.chainlink.withinBand, true);

    const usdt = s.assets.find((a) => a.asset === "USDT");
    const usdtBinance = usdt.venues.find((v) => v.venue === "binance");
    assert.equal(usdtBinance.supported, false);
    assert.equal(usdt.healthyCount, 2);

    const trx = s.assets.find((a) => a.asset === "TRX");
    assert.equal(trx.chainlink, null);

    assert.equal(s.eurUsd.median, "1.25");
    assert.equal(s.eurUsd.healthyCount, 4);
    assert.equal(s.eurUsd.venues.find((v) => v.venue === "coinbase").supported, false);

    const coinbaseEth = byVenue.coinbase;
    assert.equal(coinbaseEth.enabled, false);
    assert.equal(coinbaseEth.rate, "4001");
    assert.equal(trx.venues.find((v) => v.venue === "coinbase").supported, false);
    assert.equal(s.settings.staleMaxSeconds, 600);
    assert.ok(s.monitor);
    assert.equal(s.eurUsd.quotable, true);
  });

  it("shows a failing venue with its error and flags assets that can no longer be quoted", async () => {
    down.add("kraken");
    const s = await getRateFeedStatus({ refresh: true });
    const eth = s.assets.find((a) => a.asset === "ETH");
    const k = eth.venues.find((v) => v.venue === "kraken");
    assert.equal(k.rate, null);
    assert.equal(k.error, "kraken_http_500");
    assert.equal(eth.healthyCount, 2);
    assert.equal(eth.quotable, true);
    assert.equal(eth.median, "4002");

    const usdt = s.assets.find((a) => a.asset === "USDT");
    assert.equal(usdt.healthyCount, 1);
    assert.equal(usdt.quotable, false);

    const eurKraken = s.eurUsd.venues.find((v) => v.venue === "kraken");
    assert.equal(eurKraken.error, "kraken_http_500");
    // Binance EUR/USDT still converts through CoinGecko's USDT/USD.
    assert.equal(s.eurUsd.healthyCount, 3);
  });

  it("probes disabled venues but leaves them out of the median and health count", async () => {
    await updatePlatformPricingSettings({ rateVenues: ["coingecko", "kraken"] });
    const s = await getRateFeedStatus({ refresh: true });
    const eth = s.assets.find((a) => a.asset === "ETH");
    const b = eth.venues.find((v) => v.venue === "binance");
    assert.equal(b.enabled, false);
    assert.equal(b.rate, "4004");
    assert.equal(eth.healthyCount, 2);
    assert.equal(eth.median, "3998");
  });

  it("marks Chainlink outside the band and reports its failure", async () => {
    chainlink.ETH = 4200;
    try {
      let s = await getRateFeedStatus({ refresh: true });
      let eth = s.assets.find((a) => a.asset === "ETH");
      assert.equal(eth.chainlink.withinBand, false);

      clearRateFeedStatusCache();
      down.add("chainlink");
      s = await getRateFeedStatus({ refresh: true });
      eth = s.assets.find((a) => a.asset === "ETH");
      assert.equal(eth.chainlink.rate, null);
      assert.match(eth.chainlink.error, /chainlink_rpc_http_500/);
    } finally {
      chainlink.ETH = 4010;
    }
  });

  it("caches the probe for 15s and throttles forced refreshes to one per 5s", async () => {
    const t0 = Date.now();
    const first = await getRateFeedStatus({ now: t0 });
    assert.equal(first.cached, false);
    assert.equal((await getRateFeedStatus({ now: t0 + 10_000 })).cached, true);
    assert.equal((await getRateFeedStatus({ now: t0 + 3_000, refresh: true })).cached, true);
    assert.equal((await getRateFeedStatus({ now: t0 + 6_000, refresh: true })).cached, false);
    assert.equal((await getRateFeedStatus({ now: t0 + 30_000 })).cached, false);
  });

  it("requires platform membership for both endpoints", async () => {
    assert.equal((await api("/v1/platform/rates/status", { token: merchantToken })).status, 403);
    const q = await testQuote(
      { asset: "ETH", network: "ethereum", amount: "100", currency: "USD", pricingMode: "market" },
      merchantToken,
    );
    assert.equal(q.status, 403);
  });

  it("test quote prices like create-order and never inserts an order", async () => {
    const count = async () =>
      Number((await getPool().query(`SELECT count(*)::int AS n FROM payment_orders`)).rows[0].n);
    const before = await count();

    const eth = await testQuote({
      asset: "ETH",
      network: "ethereum",
      amount: "100",
      currency: "USD",
      pricingMode: "market",
    });
    assert.equal(eth.status, 200, JSON.stringify(eth.json));
    assert.equal(eth.json.quote.marketRate, "4000");
    assert.equal(eth.json.quote.payAmount, "0.025");
    assert.equal(eth.json.quote.pricingMode, "market");
    assert.equal(eth.json.quote.rateSources.length, 3);

    const pegged = await testQuote({
      asset: "USDT",
      network: "tron",
      amount: "100",
      currency: "USD",
      pricingMode: "pegged_1to1",
    });
    assert.equal(pegged.status, 200, JSON.stringify(pegged.json));
    assert.equal(pegged.json.quote.pricingMode, "pegged_1to1");
    assert.equal(pegged.json.quote.payAmount, "100");

    const eur = await testQuote({
      asset: "USDT",
      network: "tron",
      amount: "80",
      currency: "EUR",
      pricingMode: "market",
    });
    assert.equal(eur.status, 200, JSON.stringify(eur.json));
    assert.equal(eur.json.quote.invoiceAmountUsd, "100");
    assert.equal(eur.json.quote.invoiceCurrency, "EUR");

    const exact = await testQuote({
      asset: "ETH",
      network: "ethereum",
      amount: "0.5",
      currency: "CRYPTO",
      pricingMode: "market",
    });
    assert.equal(exact.status, 200, JSON.stringify(exact.json));
    assert.equal(exact.json.quote.pricingMode, "crypto_exact");
    assert.equal(exact.json.quote.payAmount, "0.5");
    assert.equal(exact.json.quote.invoiceAmountUsd, "2000");

    assert.equal(await count(), before);
  });

  it("pegged stablecoins keep quoting 1:1 on a Chainlink-confirmed peg when venues are down", async () => {
    down.add("kraken");
    down.add("coingecko");
    const body = { asset: "USDT", network: "tron", amount: "100", currency: "USD" };
    const market = await testQuote({ ...body, pricingMode: "market" });
    assert.equal(market.status, 503);
    const pegged = await testQuote({ ...body, pricingMode: "pegged_1to1" });
    assert.equal(pegged.status, 200, JSON.stringify(pegged.json));
    assert.equal(pegged.json.quote.payAmount, "100");
    assert.equal(pegged.json.quote.rateWarning, "peg_fallback_chainlink");

    down.add("chainlink");
    const blind = await testQuote({ ...body, pricingMode: "pegged_1to1" });
    assert.equal(blind.status, 503);
  });

  it("serves the last good price, marked stale, when venues drop out", async () => {
    const body = { asset: "ETH", network: "ethereum", amount: "100", currency: "USD", pricingMode: "market" };
    const live = await testQuote(body);
    assert.equal(live.status, 200);
    clearRateFeedStatusCache();
    down.add("kraken");
    down.add("coingecko");
    down.add("binance");
    expireUsdPriceCache();
    const stale = await testQuote(body);
    assert.equal(stale.status, 200, JSON.stringify(stale.json));
    assert.equal(stale.json.quote.marketRate, "4000");
    assert.match(stale.json.quote.rateWarning, /^stale_rate:\d+s$/);
  });

  it("test quote surfaces the same failures a real order would hit", async () => {
    const base = { asset: "ETH", network: "ethereum", amount: "100", currency: "USD", pricingMode: "market" };

    down.add("kraken");
    down.add("coingecko");
    const thin = await testQuote(base);
    assert.equal(thin.status, 503);
    assert.equal(thin.json.error?.code ?? thin.json.code, "rates_unavailable");
    down.clear();

    await updatePlatformPricingSettings({ ratesEnabled: false });
    const off = await testQuote(base);
    assert.equal(off.status, 503);
    await updatePlatformPricingSettings({ ratesEnabled: true });

    await updatePlatformPricingSettings({ modeMarketEnabled: false });
    const modeOff = await testQuote(base);
    assert.equal(modeOff.status, 422);
    await updatePlatformPricingSettings({ modeMarketEnabled: true });

    assert.equal((await testQuote({ ...base, network: "solana" })).status, 422);
    assert.equal((await testQuote({ ...base, pricingMode: "depeg_market" })).status, 400);
    assert.equal((await testQuote({ ...base, amount: "-1" })).status, 400);
    assert.equal((await testQuote({ ...base, amount: "0.00000000001" })).status, 400);
  });
});
