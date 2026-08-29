import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { USDT_ETHEREUM } from "@cryptogate/domain";
import {
  healthCheck,
  getEthereumConfig,
  listRecentTransfers,
  dedupeTransfersByTxHash,
  getTransactionConfirmations,
  mapTransferLog,
  ERC20_TRANSFER_TOPIC,
} from "../ethereum/index.mjs";

describe("@cryptogate/chain-clients/ethereum stub", () => {
  it("healthCheck returns stub mode without ETH_RPC_URL", async () => {
    const h = await healthCheck();
    assert.equal(h.network, "ethereum");
    assert.equal(h.mode, "stub");
    assert.equal(h.ok, true);
    assert.equal(h.rpcConfigured, false);
  });

  it("getEthereumConfig reads USDT_ETHEREUM registry (not hardcoded confirmations)", () => {
    const cfg = getEthereumConfig();
    assert.equal(cfg.network, "ethereum");
    assert.equal(cfg.asset, "USDT");
    assert.equal(cfg.tokenContractAddress ?? cfg.usdtContractAddress, USDT_ETHEREUM.contractAddress);
    assert.equal(cfg.requiredConfirmations, USDT_ETHEREUM.requiredConfirmations);
    assert.equal(cfg.decimals, USDT_ETHEREUM.decimals);
    assert.notEqual(cfg.requiredConfirmations, 19);
  });

  it("listRecentTransfers returns empty stub with watched count", async () => {
    const result = await listRecentTransfers({
      watchedAddresses: ["0x742d35cc6634c0532925a3b844bc9e7595f0beb0"],
    });
    assert.deepEqual(result.transfers, []);
    assert.equal(result.mode, "stub");
    assert.equal(result.watchedAddressCount, 1);
  });

  it("dedupeTransfersByTxHash drops duplicates", () => {
    const out = dedupeTransfersByTxHash([
      { txHash: "0xa", network: "ethereum" },
      { txHash: "0xa", network: "ethereum" },
    ]);
    assert.equal(out.length, 1);
  });
});

describe("@cryptogate/chain-clients/ethereum map + rpc (mocked)", () => {
  it("mapTransferLog maps ERC-20 Transfer log", () => {
    const to = "0x742d35cc6634c0532925a3b844bc9e7595f0beb0";
    const mapped = mapTransferLog(
      {
        address: USDT_ETHEREUM.contractAddress,
        transactionHash: "0xabc123",
        topics: [
          ERC20_TRANSFER_TOPIC,
          "0x0000000000000000000000001111111111111111111111111111111111111111",
          `0x000000000000000000000000${to.replace(/^0x/, "")}`,
        ],
        data: "0x000000000000000000000000000000000000000000000000000000000f4240",
      },
      {
        contractAddress: USDT_ETHEREUM.contractAddress,
        decimals: 6,
      },
    );
    assert.deepEqual(mapped, {
      toAddress: to,
      fromAddress: "0x1111111111111111111111111111111111111111",
      amount: "1",
      txHash: "0xabc123",
      asset: "USDT",
      network: "ethereum",
      memoOrTag: undefined,
    });
  });

  it("mapTransferLog skips wrong contract", () => {
    const mapped = mapTransferLog(
      {
        address: "0x0000000000000000000000000000000000000001",
        transactionHash: "0xabc",
        topics: [ERC20_TRANSFER_TOPIC],
        data: "0x0",
      },
      { contractAddress: USDT_ETHEREUM.contractAddress, decimals: 6 },
    );
    assert.equal(mapped, null);
  });
});

describe("@cryptogate/chain-clients/ethereum JSON-RPC live (mocked)", () => {
  const prevUrl = process.env.ETH_RPC_URL;
  const prevStubTx = process.env.WATCHER_STUB_TRANSFERS;
  const prevStubConf = process.env.WATCHER_STUB_CONFIRMATIONS;

  before(() => {
    process.env.ETH_RPC_URL = "https://eth.example/rpc";
    delete process.env.WATCHER_STUB_TRANSFERS;
    delete process.env.WATCHER_STUB_CONFIRMATIONS;
  });

  after(() => {
    if (prevUrl === undefined) delete process.env.ETH_RPC_URL;
    else process.env.ETH_RPC_URL = prevUrl;
    if (prevStubTx === undefined) delete process.env.WATCHER_STUB_TRANSFERS;
    else process.env.WATCHER_STUB_TRANSFERS = prevStubTx;
    if (prevStubConf === undefined) delete process.env.WATCHER_STUB_CONFIRMATIONS;
    else process.env.WATCHER_STUB_CONFIRMATIONS = prevStubConf;
  });

  it("healthCheck reports eth-rpc when URL set", async () => {
    const h = await healthCheck();
    assert.equal(h.mode, "eth-rpc");
    assert.equal(h.rpcConfigured, true);
  });

  it("listRecentTransfers maps eth_getLogs rows", async () => {
    const watched = "0x742d35cc6634c0532925a3b844bc9e7595f0beb0";
    const toTopic = `0x000000000000000000000000${watched.toLowerCase().replace(/^0x/, "")}`;

    const fetchMock = async (_url, init) => {
      const body = JSON.parse(String(init.body));
      if (body.method === "eth_blockNumber") {
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x100" }));
      }
      if (body.method === "eth_getLogs") {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: [
              {
                address: USDT_ETHEREUM.contractAddress,
                transactionHash: "0xdeadbeef",
                topics: [
                  ERC20_TRANSFER_TOPIC,
                  "0x0000000000000000000000001111111111111111111111111111111111111111",
                  toTopic,
                ],
                data: "0x000000000000000000000000000000000000000000000000000000000f4240",
              },
            ],
          }),
        );
      }
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: null }));
    };

    const result = await listRecentTransfers({
      watchedAddresses: [watched],
      fetch: /** @type {typeof fetch} */ (fetchMock),
    });
    assert.equal(result.mode, "eth-rpc");
    assert.equal(result.transfers.length, 1);
    assert.equal(result.transfers[0].amount, "1");
    assert.equal(result.transfers[0].txHash, "0xdeadbeef");
  });

  it("getTransactionConfirmations uses receipt + head block", async () => {
    const fetchMock = async (_url, init) => {
      const body = JSON.parse(String(init.body));
      if (body.method === "eth_getTransactionReceipt") {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: { blockNumber: "0x64" },
          }),
        );
      }
      if (body.method === "eth_blockNumber") {
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x6e" }));
      }
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: null }));
    };

    const n = await getTransactionConfirmations({
      txHash: "0xabc",
      fetch: /** @type {typeof fetch} */ (fetchMock),
    });
    assert.equal(n, 11);
  });
});
