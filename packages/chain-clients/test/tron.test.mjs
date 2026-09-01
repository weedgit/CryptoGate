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
  "CRYPTOGATE_CHAIN_ENV",
  "VITE_CRYPTOGATE_CHAIN_ENV",
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

describe("@cryptogate/chain-clients/tron stub", () => {
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
      CRYPTOGATE_CHAIN_ENV: "testnet",
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
      CRYPTOGATE_CHAIN_ENV: "testnet",
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
      CRYPTOGATE_CHAIN_ENV: "testnet",
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
      CRYPTOGATE_CHAIN_ENV: "testnet",
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

describe("@cryptogate/chain-clients/tron amount + map", () => {
  it("minorToMajor formats USDT 6 decimals", () => {
    assert.equal(minorToMajor("50000000", 6), "50");
    assert.equal(minorToMajor("50000001", 6), "50.000001");
    assert.equal(minorToMajor("1", 6), "0.000001");
  });

  it("mapTrc20Row maps TronGrid TRC-20 row", () => {
    const mapped = mapTrc20Row(
      {
        transaction_id: "abcd",
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
    });
  });

  it("mapTrc20Row skips wrong contract", () => {
    const mapped = mapTrc20Row(
      {
        transaction_id: "abcd",
        to: "TRecv",
        value: "1000000",
        token_info: { address: "TWrong", decimals: 6 },
      },
      { contractAddress: USDT_TRC20_CONTRACT, decimals: 6 },
    );
    assert.equal(mapped, null);
  });
});

describe("@cryptogate/chain-clients/tron TronGrid live (mocked)", () => {
  let restore = () => {};

  before(() => {
    restore = withEnv({
      TRON_RPC_URL: "https://api.trongrid.io",
      TRON_API_KEY: "test-key",
      CRYPTOGATE_CHAIN_ENV: undefined,
      VITE_CRYPTOGATE_CHAIN_ENV: undefined,
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
        return {
          ok: true,
          async json() {
            return { blockNumber: 100 };
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
      fetch: /** @type {typeof fetch} */ (fetchMock),
    });
    assert.equal(n, 26);
    assert.equal(paths.length, 2);
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

describe("@cryptogate/chain-clients/tron backoff (M3-45)", () => {
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
      CRYPTOGATE_CHAIN_ENV: undefined,
      VITE_CRYPTOGATE_CHAIN_ENV: undefined,
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
