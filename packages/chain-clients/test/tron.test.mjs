import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  healthCheck,
  getTronConfig,
  listRecentTransfers,
  dedupeTransfersByTxHash,
  getTransactionConfirmations,
  minorToMajor,
  mapTrc20Row,
  USDT_TRC20_CONTRACT,
} from "../tron/index.mjs";

/** Keys that leak from a developer `.env` and break hermetic stub / mainnet mocks. */
const TRON_TEST_ENV_KEYS = [
  "TRON_RPC_URL",
  "TRON_NILE_RPC_URL",
  "TRON_API_KEY",
  "TRON_NILE_API_KEY",
  "TRON_USDT_CONTRACT",
  "PAYMENTGATE_CHAIN_ENV",
  "VITE_PAYMENTGATE_CHAIN_ENV",
  "WATCHER_STUB_TRANSFERS",
  "WATCHER_STUB_CONFIRMATIONS",
  "WATCHER_STUB_TX_PRESENCE",
];

/**
 * @param {Record<string, string | undefined>} patch
 * @returns {() => void} restore
 */
function withEnv(patch) {
  /** @type {Record<string, string | undefined>} */
  const prev = {};
  for (const key of Object.keys(patch)) {
    prev[key] = process.env[key];
    const next = patch[key];
    if (next === undefined) delete process.env[key];
    else process.env[key] = next;
  }
  return () => {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

function clearTronTestEnv() {
  /** @type {Record<string, string | undefined>} */
  const patch = {};
  for (const key of TRON_TEST_ENV_KEYS) patch[key] = undefined;
  return withEnv(patch);
}

describe("@paymentgate/chain-clients/tron stub", () => {
  let restore = () => {};

  before(() => {
    restore = clearTronTestEnv();
  });

  after(() => {
    restore();
  });

  it("healthCheck returns stub mode without TRON_RPC_URL", async () => {
    const h = await healthCheck();
    assert.equal(h.network, "tron");
    assert.equal(h.mode, "stub");
    assert.equal(h.ok, true);
    assert.equal(h.rpcConfigured, false);
  });

  it("healthCheck({ network }) does not follow DEFAULT_NETWORK / testnet env", async () => {
    const restoreHint = withEnv({
      PAYMENTGATE_CHAIN_ENV: "testnet",
      DEFAULT_NETWORK: "tron_nile",
    });
    try {
      const main = await healthCheck({ network: "tron" });
      const nile = await healthCheck({ network: "tron_nile" });
      assert.equal(main.network, "tron");
      assert.equal(nile.network, "tron_nile");
    } finally {
      restoreHint();
    }
  });

  it("getTronConfig includes USDT contract and confirmations (M3-31)", () => {
    const cfg = getTronConfig();
    assert.equal(cfg.network, "tron");
    assert.equal(cfg.asset, "USDT");
    assert.equal(cfg.contractAddress ?? cfg.usdtContractAddress, USDT_TRC20_CONTRACT);
    assert.equal(cfg.requiredConfirmations, 19);
    assert.equal(cfg.decimals, 6);
  });

  it("getTronConfig resolves Nile contract when network is tron_nile", () => {
    const cfg = getTronConfig("USDT", "tron_nile");
    assert.equal(cfg.network, "tron_nile");
    assert.equal(cfg.contractAddress, "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf");
  });

  it("splits mainnet vs Nile TronGrid bases so both can complete in testnet env", () => {
    const restore = withEnv({
      TRON_RPC_URL: "https://api.trongrid.io",
      TRON_NILE_RPC_URL: "https://nile.trongrid.io",
      PAYMENTGATE_CHAIN_ENV: "testnet",
    });
    try {
      const main = getTronConfig("USDT", "tron");
      const nile = getTronConfig("USDT", "tron_nile");
      assert.equal(main.network, "tron");
      assert.equal(main.rpcUrl, "https://api.trongrid.io");
      assert.equal(main.contractAddress, USDT_TRC20_CONTRACT);
      assert.equal(main.requiredConfirmations, 19);
      assert.equal(nile.network, "tron_nile");
      assert.equal(nile.rpcUrl, "https://nile.trongrid.io");
      assert.equal(nile.requiredConfirmations, 19);
    } finally {
      restore();
    }
  });

  it("does not send mainnet ingest to a Nile-only TRON_RPC_URL", () => {
    const restore = withEnv({
      TRON_RPC_URL: "https://nile.trongrid.io",
      TRON_NILE_RPC_URL: undefined,
      PAYMENTGATE_CHAIN_ENV: "testnet",
    });
    try {
      const main = getTronConfig("USDT", "tron");
      const nile = getTronConfig("USDT", "tron_nile");
      assert.equal(main.rpcUrl, null);
      assert.equal(nile.rpcUrl, "https://nile.trongrid.io");
    } finally {
      restore();
    }
  });

  it("pairs public Nile with a mainnet TRON_RPC_URL when TRON_NILE_RPC_URL is unset", () => {
    const restore = withEnv({
      TRON_RPC_URL: "https://api.trongrid.io",
      TRON_NILE_RPC_URL: undefined,
      PAYMENTGATE_CHAIN_ENV: "testnet",
    });
    try {
      const main = getTronConfig("USDT", "tron");
      const nile = getTronConfig("USDT", "tron_nile");
      assert.equal(main.rpcUrl, "https://api.trongrid.io");
      assert.equal(nile.rpcUrl, "https://nile.trongrid.io");
    } finally {
      restore();
    }
  });

  it("listRecentTransfers returns empty stub with watched count", async () => {
    const result = await listRecentTransfers({
      watchedAddresses: ["TRBapU5LUjFTT4fb25ZfiVKosMqNHsjGsK"],
    });
    assert.deepEqual(result.transfers, []);
    assert.equal(result.mode, "stub");
    assert.equal(result.watchedAddressCount, 1);
  });

  it("listRecentTransfers skips invalid seed-style addresses without error", async () => {
    const prev = process.env.TRON_RPC_URL;
    process.env.TRON_RPC_URL = "https://api.trongrid.io";
    try {
      const result = await listRecentTransfers({
        watchedAddresses: [
          // Alphabet-ok hex seed — fails Base58Check
          "T35dacea7f19482733e4dcf20457d7073a",
          // Contains '0' — fails alphabet / checksum
          "T0d16beb96cc393e07deef302f40642d5d",
          "",
          // Known mainnet USDT TRC-20 contract (valid Base58Check)
          USDT_TRC20_CONTRACT,
        ],
        network: "tron",
        fetch: async (url) => {
          if (String(url).includes(USDT_TRC20_CONTRACT)) {
            return {
              ok: true,
              status: 200,
              headers: { get: () => null },
              json: async () => ({ data: [] }),
              text: async () => "",
            };
          }
          throw new Error(`unexpected TronGrid call: ${url}`);
        },
      });
      assert.equal(result.mode, "trongrid");
      assert.equal(result.watchedAddressCount, 1);
      assert.equal(result.skippedInvalidAddresses, 2);
      assert.equal(result.transfers.length, 0);
      assert.equal(result.error, undefined);
    } finally {
      if (prev === undefined) delete process.env.TRON_RPC_URL;
      else process.env.TRON_RPC_URL = prev;
    }
  });

  it("dedupeTransfersByTxHash drops duplicates", () => {
    const out = dedupeTransfersByTxHash([
      { txHash: "0xa", network: "tron" },
      { txHash: "0xa", network: "tron" },
    ]);
    assert.equal(out.length, 1);
  });
});

describe("@paymentgate/chain-clients/tron amount + map", () => {
  it("minorToMajor formats USDT 6 decimals", () => {
    assert.equal(minorToMajor("50000000", 6), "50");
    assert.equal(minorToMajor("50000001", 6), "50.000001");
    assert.equal(minorToMajor("1", 6), "0.000001");
  });

  it("mapTrc20Row maps TronGrid TRC-20 row", () => {
    const mapped = mapTrc20Row(
      {
        transaction_id: "abcd",
        type: "Transfer",
        to: "TRecv",
        from: "TFrom",
        value: "1000000",
        token_info: {
          address: USDT_TRC20_CONTRACT,
          decimals: 6,
        },
      },
      { contractAddress: USDT_TRC20_CONTRACT, decimals: 6 },
    );
    assert.deepEqual(mapped, {
      toAddress: "TRecv",
      fromAddress: "TFrom",
      amount: "1",
      txHash: "abcd",
      asset: "USDT",
      network: "tron",
      memoOrTag: undefined,
      blockTimestampMs: undefined,
    });
  });

  it("mapTrc20Row skips wrong contract", () => {
    const mapped = mapTrc20Row(
      {
        transaction_id: "abcd",
        type: "Transfer",
        to: "TRecv",
        value: "1000000",
        token_info: { address: "TWrong", decimals: 6 },
      },
      { contractAddress: USDT_TRC20_CONTRACT, decimals: 6 },
    );
    assert.equal(mapped, null);
  });

  it("mapTrc20Row skips Approval and untyped rows (C1)", () => {
    const base = {
      transaction_id: "abcd",
      to: "TRecv",
      from: "TOwner",
      value: "50000000",
      token_info: { address: USDT_TRC20_CONTRACT, decimals: 6 },
    };
    const cfg = { contractAddress: USDT_TRC20_CONTRACT, decimals: 6 };
    assert.equal(mapTrc20Row({ ...base, type: "Approval" }, cfg), null);
    assert.equal(mapTrc20Row(base, cfg), null);
    assert.equal(mapTrc20Row({ ...base, type: "Transfer" }, cfg)?.amount, "50");
  });

  it("tronBase58ToHex / tronHexToBase58 round-trip", async () => {
    const { tronBase58ToHex, tronHexToBase58 } = await import("../tron/address.mjs");
    const hex = tronBase58ToHex(USDT_TRC20_CONTRACT);
    assert.equal(hex, "41a614f803b6fd780986a42c78ec9c7f77e6ded13c");
    assert.equal(tronHexToBase58(hex), USDT_TRC20_CONTRACT);
    assert.equal(tronHexToBase58(hex.slice(2)), USDT_TRC20_CONTRACT);
    assert.equal(tronBase58ToHex("TNotAnAddress"), null);
    assert.equal(tronHexToBase58("41zz"), null);
  });
});

const PAYEE = "TRBapU5LUjFTT4fb25ZfiVKosMqNHsjGsK";
const TRANSFER_TOPIC =
  "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/**
 * gettransactioninfobyid body for a successful USDT Transfer to `to`.
 * @param {string} to
 */
async function usdtTransferInfo(to) {
  const { tronBase58ToHex } = await import("../tron/address.mjs");
  return {
    blockNumber: 100,
    receipt: { result: "SUCCESS" },
    log: [
      {
        address: tronBase58ToHex(USDT_TRC20_CONTRACT).slice(2),
        topics: [
          TRANSFER_TOPIC,
          `000000000000000000000000${"11".repeat(20)}`,
          `000000000000000000000000${tronBase58ToHex(to).slice(2)}`,
        ],
        data: (50_000_000).toString(16).padStart(64, "0"),
      },
    ],
  };
}

describe("@paymentgate/chain-clients/tron receipt checks (C1 / H4)", () => {
  it("tronTransactionFailureReason accepts a USDT Transfer to the payee", async () => {
    const { tronTransactionFailureReason } = await import("../tron/trongrid.mjs");
    const cfg = { nativeAsset: false, contractAddress: USDT_TRC20_CONTRACT };
    const info = await usdtTransferInfo(PAYEE);
    assert.equal(tronTransactionFailureReason(info, cfg, PAYEE), null);
    assert.equal(tronTransactionFailureReason(info, cfg), null);
  });

  it("tronTransactionFailureReason rejects reverts, approvals and other payees", async () => {
    const { tronTransactionFailureReason } = await import("../tron/trongrid.mjs");
    const cfg = { nativeAsset: false, contractAddress: USDT_TRC20_CONTRACT };
    const ok = await usdtTransferInfo(PAYEE);
    assert.equal(
      tronTransactionFailureReason({ ...ok, receipt: { result: "REVERT" } }, cfg, PAYEE),
      "tx_failed",
    );
    assert.equal(
      tronTransactionFailureReason({ ...ok, result: "FAILED" }, cfg, PAYEE),
      "tx_failed",
    );
    const approval = {
      ...ok,
      log: [
        {
          ...ok.log[0],
          topics: [
            "8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925",
            ...ok.log[0].topics.slice(1),
          ],
        },
      ],
    };
    assert.equal(
      tronTransactionFailureReason(approval, cfg, PAYEE),
      "tx_not_token_transfer",
    );
    assert.equal(
      tronTransactionFailureReason(ok, cfg, "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"),
      "tx_not_token_transfer",
    );
    assert.equal(
      tronTransactionFailureReason({ blockNumber: 1, log: [] }, cfg, PAYEE),
      "tx_not_token_transfer",
    );
  });

  it("native TRX only fails on FAILED result", async () => {
    const { tronTransactionFailureReason } = await import("../tron/trongrid.mjs");
    const cfg = { nativeAsset: true, contractAddress: "" };
    assert.equal(tronTransactionFailureReason({ blockNumber: 1 }, cfg, PAYEE), null);
    assert.equal(
      tronTransactionFailureReason({ blockNumber: 1, result: "FAILED" }, cfg, PAYEE),
      "tx_failed",
    );
  });
});

describe("@paymentgate/chain-clients/tron TronGrid live (mocked)", () => {
  let restore = () => {};

  before(() => {
    restore = withEnv({
      TRON_RPC_URL: "https://api.trongrid.io",
      TRON_API_KEY: "test-key",
      PAYMENTGATE_CHAIN_ENV: undefined,
      VITE_PAYMENTGATE_CHAIN_ENV: undefined,
      TRON_USDT_CONTRACT: undefined,
      WATCHER_STUB_TRANSFERS: undefined,
      WATCHER_STUB_CONFIRMATIONS: undefined,
      WATCHER_STUB_TX_PRESENCE: undefined,
    });
  });

  after(() => {
    restore();
  });

  it("healthCheck reports trongrid when URL set", async () => {
    const h = await healthCheck();
    assert.equal(h.mode, "trongrid");
    assert.equal(h.rpcConfigured, true);
  });

  it("listRecentTransfers polls watched address via TronGrid", async () => {
    /** @type {string[]} */
    const urls = [];
    const fetchMock = async (url, init) => {
      urls.push(String(url));
      assert.equal(init?.headers?.["TRON-PRO-API-KEY"], "test-key");
      return {
        ok: true,
        async json() {
          return {
            data: [
              {
                transaction_id: "tx1",
                type: "Transfer",
                to: "TRBapU5LUjFTT4fb25ZfiVKosMqNHsjGsK",
                from: "TPayer",
                value: "50000000",
                token_info: {
                  address: USDT_TRC20_CONTRACT,
                  decimals: 6,
                },
              },
              {
                transaction_id: "tx1",
                type: "Transfer",
                to: "TRBapU5LUjFTT4fb25ZfiVKosMqNHsjGsK",
                from: "TPayer",
                value: "50000000",
                token_info: {
                  address: USDT_TRC20_CONTRACT,
                  decimals: 6,
                },
              },
            ],
          };
        },
      };
    };

    const result = await listRecentTransfers({
      watchedAddresses: ["TRBapU5LUjFTT4fb25ZfiVKosMqNHsjGsK"],
      network: "tron",
      fetch: /** @type {typeof fetch} */ (fetchMock),
    });

    assert.equal(result.mode, "trongrid");
    assert.equal(result.watchedAddressCount, 1);
    assert.equal(result.transfers.length, 1);
    assert.equal(result.transfers[0].amount, "50");
    assert.equal(result.transfers[0].txHash, "tx1");
    assert.equal(result.transfers[0].fromAddress, "TPayer");
    assert.match(
      urls[0],
      /\/v1\/accounts\/TRBapU5LUjFTT4fb25ZfiVKosMqNHsjGsK\/transactions\/trc20/,
    );
    assert.match(urls[0], /contract_address=/);
  });

  it("getTransactionConfirmations uses block delta", async () => {
    /** @type {string[]} */
    const paths = [];
    const fetchMock = async (url) => {
      paths.push(String(url));
      if (String(url).includes("gettransactioninfobyid")) {
        const info = await usdtTransferInfo(PAYEE);
        return {
          ok: true,
          async json() {
            return info;
          },
        };
      }
      return {
        ok: true,
        async json() {
          return { block_header: { raw_data: { number: 125 } } };
        },
      };
    };

    const n = await getTransactionConfirmations({
      txHash: "deadbeef",
      toAddress: PAYEE,
      fetch: /** @type {typeof fetch} */ (fetchMock),
    });
    assert.equal(n, 26);
    assert.equal(paths.length, 2);
  });

  it("getTransactionConfirmationState reports failed for a reverted transfer (C1)", async () => {
    const { getTransactionConfirmationState } = await import("../tron/index.mjs");
    const info = { ...(await usdtTransferInfo(PAYEE)), receipt: { result: "REVERT" } };
    const fetchMock = async (url) => {
      if (String(url).includes("gettransactioninfobyid")) {
        return {
          ok: true,
          async json() {
            return info;
          },
        };
      }
      throw new Error("unexpected " + url);
    };
    const state = await getTransactionConfirmationState({
      txHash: "deadbeef",
      toAddress: PAYEE,
      fetch: /** @type {typeof fetch} */ (fetchMock),
    });
    assert.equal(state.presence, "failed");
    assert.equal(state.failureReason, "tx_failed");
    assert.equal(state.confirmations, 0);
  });

  it("getTransactionConfirmationState marks empty info missing (M4-21)", async () => {
    const { getTransactionConfirmationState } = await import("../tron/index.mjs");
    const fetchMock = async (url) => {
      if (String(url).includes("gettransactioninfobyid")) {
        return {
          ok: true,
          async json() {
            return {};
          },
        };
      }
      throw new Error("unexpected " + url);
    };
    const state = await getTransactionConfirmationState({
      txHash: "deadbeef",
      fetch: /** @type {typeof fetch} */ (fetchMock),
    });
    assert.equal(state.presence, "missing");
    assert.equal(state.confirmations, 0);
  });
});

describe("@paymentgate/chain-clients/tron backoff (M3-45)", () => {
  it("tronBackoffMs doubles and caps", async () => {
    const { tronBackoffMs, extraWatcherBackoffMs, isRetryableTronStatus } =
      await import("../tron/backoff.mjs");
    assert.equal(tronBackoffMs(0, { baseMs: 400, maxMs: 30_000 }), 400);
    assert.equal(tronBackoffMs(1, { baseMs: 400, maxMs: 30_000 }), 800);
    assert.equal(isRetryableTronStatus(429), true);
    assert.equal(isRetryableTronStatus(400), false);
    assert.equal(
      extraWatcherBackoffMs(
        { ingest: { chainPollMode: "trongrid-error" } },
        5000,
      ),
      5000,
    );
    assert.equal(
      extraWatcherBackoffMs({ ingest: { chainPollMode: "trongrid" } }, 5000),
      0,
    );
  });

  it("retries 429 then succeeds", async () => {
    const restore = withEnv({
      TRON_RPC_URL: "https://api.trongrid.io",
      PAYMENTGATE_CHAIN_ENV: undefined,
      VITE_PAYMENTGATE_CHAIN_ENV: undefined,
      TRON_USDT_CONTRACT: undefined,
      WATCHER_STUB_TRANSFERS: undefined,
    });
    let calls = 0;
    const fetchMock = async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: false,
          status: 429,
          headers: { get: (n) => (n === "retry-after" ? "0" : null) },
          async text() {
            return "rate limit";
          },
        };
      }
      return {
        ok: true,
        async json() {
          return {
            data: [
              {
                transaction_id: "retry-ok",
                type: "Transfer",
                to: "TRBapU5LUjFTT4fb25ZfiVKosMqNHsjGsK",
                value: "1000000",
                token_info: { address: USDT_TRC20_CONTRACT, decimals: 6 },
              },
            ],
          };
        },
      };
    };
    try {
      const result = await listRecentTransfers({
        watchedAddresses: ["TRBapU5LUjFTT4fb25ZfiVKosMqNHsjGsK"],
        network: "tron",
        fetch: /** @type {typeof fetch} */ (fetchMock),
        sleep: async () => {},
      });
      assert.equal(calls, 2);
      assert.equal(result.mode, "trongrid");
      assert.equal(result.transfers[0].txHash, "retry-ok");
    } finally {
      restore();
    }
  });
});

describe("@paymentgate/chain-clients/tron native TRX ingest (H3 / H4)", () => {
  it("keeps SUCCESS transfers with block time and drops failed ones", async () => {
    const { fetchNativeTrxTransfersForAddresses } = await import("../tron/trongrid.mjs");
    const row = (txID, contractRet) => ({
      txID,
      block_timestamp: 1_760_000_000_000,
      ret: [{ contractRet }],
      raw_data: {
        contract: [
          {
            type: "TransferContract",
            parameter: { value: { amount: 2_000_000, to_address: PAYEE, owner_address: "TPayer" } },
          },
        ],
      },
    });
    const fetchImpl = async () => ({
      ok: true,
      async json() {
        return { data: [row("ok-tx", "SUCCESS"), row("bad-tx", "OUT_OF_ENERGY")] };
      },
    });
    const result = await fetchNativeTrxTransfersForAddresses({
      watchedAddresses: [PAYEE],
      fetchImpl: /** @type {typeof fetch} */ (fetchImpl),
      runtimeConfig: {
        configured: true,
        nativeAsset: true,
        baseUrl: "https://api.trongrid.io",
        apiKey: "",
        decimals: 6,
        asset: "TRX",
        network: "tron",
      },
    });
    assert.deepEqual(result.transfers.map((t) => t.txHash), ["ok-tx"]);
    assert.equal(result.transfers[0].amount, "2");
    assert.equal(result.transfers[0].blockTimestampMs, 1_760_000_000_000);
  });
});

describe("@paymentgate/chain-clients/tron pagination (M4)", () => {
  it("follows fingerprints from the oldest open order", async () => {
    const { fetchTrc20TransfersForAddresses } = await import("../tron/trongrid.mjs");
    const urls = [];
    const row = (id) => ({
      transaction_id: id,
      type: "Transfer",
      to: PAYEE,
      from: "TPayer",
      value: "1000000",
      token_info: { address: USDT_TRC20_CONTRACT, decimals: 6 },
    });
    const fetchImpl = async (url) => {
      urls.push(String(url));
      const second = String(url).includes("fingerprint=");
      return {
        ok: true,
        async json() {
          return second
            ? { data: [row("p2")] }
            : { data: [row("p1a"), row("p1b")], meta: { fingerprint: "fp1" } };
        },
      };
    };
    const sinceMs = Date.parse("2026-10-20T00:00:00Z");
    const result = await fetchTrc20TransfersForAddresses({
      watchedAddresses: [PAYEE],
      addressSinceMs: { [PAYEE]: sinceMs },
      limit: 2,
      fetchImpl: /** @type {typeof fetch} */ (fetchImpl),
      runtimeConfig: {
        configured: true,
        nativeAsset: false,
        baseUrl: "https://api.trongrid.io",
        apiKey: "",
        contractAddress: USDT_TRC20_CONTRACT,
        decimals: 6,
        asset: "USDT",
        network: "tron",
      },
    });
    assert.deepEqual(result.transfers.map((t) => t.txHash), ["p1a", "p1b", "p2"]);
    assert.equal(urls.length, 2);
    assert.match(urls[0], new RegExp(`min_timestamp=${sinceMs - 5 * 60 * 1000}`));
    assert.match(urls[1], /fingerprint=fp1/);
  });
});
