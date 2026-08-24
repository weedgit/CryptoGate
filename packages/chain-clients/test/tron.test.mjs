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

describe("@cryptogate/chain-clients/tron stub", () => {
  it("healthCheck returns stub mode without TRON_RPC_URL", async () => {
    const h = await healthCheck();
    assert.equal(h.network, "tron");
    assert.equal(h.mode, "stub");
    assert.equal(h.ok, true);
    assert.equal(h.rpcConfigured, false);
  });

  it("getTronConfig includes USDT contract and confirmations (M3-31)", () => {
    const cfg = getTronConfig();
    assert.equal(cfg.network, "tron");
    assert.equal(cfg.asset, "USDT");
    assert.equal(cfg.usdtContractAddress, USDT_TRC20_CONTRACT);
    assert.equal(cfg.requiredConfirmations, 19);
    assert.equal(cfg.decimals, 6);
  });

  it("listRecentTransfers returns empty stub with watched count", async () => {
    const result = await listRecentTransfers({
      watchedAddresses: ["TMain"],
    });
    assert.deepEqual(result.transfers, []);
    assert.equal(result.mode, "stub");
    assert.equal(result.watchedAddressCount, 1);
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
  const prevUrl = process.env.TRON_RPC_URL;
  const prevKey = process.env.TRON_API_KEY;
  const prevStubTx = process.env.WATCHER_STUB_TRANSFERS;
  const prevStubConf = process.env.WATCHER_STUB_CONFIRMATIONS;

  before(() => {
    process.env.TRON_RPC_URL = "https://api.trongrid.io";
    process.env.TRON_API_KEY = "test-key";
    delete process.env.WATCHER_STUB_TRANSFERS;
    delete process.env.WATCHER_STUB_CONFIRMATIONS;
  });

  after(() => {
    if (prevUrl === undefined) delete process.env.TRON_RPC_URL;
    else process.env.TRON_RPC_URL = prevUrl;
    if (prevKey === undefined) delete process.env.TRON_API_KEY;
    else process.env.TRON_API_KEY = prevKey;
    if (prevStubTx === undefined) delete process.env.WATCHER_STUB_TRANSFERS;
    else process.env.WATCHER_STUB_TRANSFERS = prevStubTx;
    if (prevStubConf === undefined) delete process.env.WATCHER_STUB_CONFIRMATIONS;
    else process.env.WATCHER_STUB_CONFIRMATIONS = prevStubConf;
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
                to: "TWatched",
                value: "50000000",
                token_info: {
                  address: USDT_TRC20_CONTRACT,
                  decimals: 6,
                },
              },
              {
                transaction_id: "tx1",
                to: "TWatched",
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
      watchedAddresses: ["TWatched"],
      fetch: /** @type {typeof fetch} */ (fetchMock),
    });

    assert.equal(result.mode, "trongrid");
    assert.equal(result.watchedAddressCount, 1);
    assert.equal(result.transfers.length, 1);
    assert.equal(result.transfers[0].amount, "50");
    assert.equal(result.transfers[0].txHash, "tx1");
    assert.match(urls[0], /\/v1\/accounts\/TWatched\/transactions\/trc20/);
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
    assert.equal(n, 25);
    assert.equal(paths.length, 2);
  });
});
