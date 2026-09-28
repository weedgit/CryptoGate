import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  ERC20_RESCAN_BLOCKS,
  fetchErc20TransfersForAddresses,
  fetchNativeEthTransfersForAddresses,
  resetEthScanCursors,
  scanRange,
} from "../ethereum/rpc.mjs";

const BASE_CFG = {
  rpcUrl: "https://eth.test",
  apiKey: "",
  usdtContractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
  decimals: 6,
  requiredConfirmations: 12,
  asset: "USDT",
  network: "ethereum",
  blockLookback: 50,
  configured: true,
  pairEnabled: true,
  nativeAsset: false,
  nativeMaxBlocksPerTick: 5,
};

function addr(n) {
  return `0x${n.toString(16).padStart(40, "0")}`;
}

/** Mock RPC recording every call; head block is mutable. */
function mockRpc(head) {
  const calls = [];
  const state = { head };
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(String(init.body));
    calls.push(body);
    let result = null;
    if (body.method === "eth_blockNumber") result = `0x${state.head.toString(16)}`;
    if (body.method === "eth_getLogs") result = [];
    if (body.method === "eth_getBlockByNumber") result = { transactions: [] };
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
  };
  return { calls, state, fetchImpl: /** @type {typeof fetch} */ (fetchImpl) };
}

describe("ethereum scan cursor (Infura request budget)", () => {
  beforeEach(() => resetEthScanCursors());

  it("scanRange starts at the lookback, then only new blocks plus overlap", () => {
    assert.deepEqual(scanRange(undefined, 1000, { lookback: 50, overlap: 12, maxSpan: 51 }), {
      fromBlock: 950,
      toBlock: 1000,
    });
    assert.deepEqual(scanRange(1000, 1002, { lookback: 50, overlap: 12, maxSpan: 51 }), {
      fromBlock: 989,
      toBlock: 1002,
    });
    assert.deepEqual(scanRange(1000, 1000, { lookback: 50, overlap: 1, maxSpan: 5 }), {
      fromBlock: 1000,
      toBlock: 1000,
    });
    assert.deepEqual(scanRange(900, 1000, { lookback: 50, overlap: 1, maxSpan: 5 }), {
      fromBlock: 950,
      toBlock: 954,
    });
  });

  it("queries USDT logs for all watched addresses in one call per 50 addresses", async () => {
    const rpc = mockRpc(1000);
    const watched = Array.from({ length: 76 }, (_, i) => addr(i + 1));
    await fetchErc20TransfersForAddresses({
      watchedAddresses: watched,
      fetchImpl: rpc.fetchImpl,
      runtimeConfig: BASE_CFG,
    });
    const logs = rpc.calls.filter((c) => c.method === "eth_getLogs");
    assert.equal(logs.length, 2);
    assert.equal(logs[0].params[0].topics[2].length, 50);
    assert.equal(logs[1].params[0].topics[2].length, 26);
    assert.equal(logs[0].params[0].fromBlock, `0x${(950).toString(16)}`);
  });

  it("next USDT cycle re-reads only recent blocks", async () => {
    const rpc = mockRpc(1000);
    const input = { watchedAddresses: [addr(1)], fetchImpl: rpc.fetchImpl, runtimeConfig: BASE_CFG };
    await fetchErc20TransfersForAddresses(input);
    rpc.state.head = 1001;
    await fetchErc20TransfersForAddresses(input);
    const last = rpc.calls.filter((c) => c.method === "eth_getLogs").at(-1);
    assert.equal(last.params[0].fromBlock, `0x${(1001 - ERC20_RESCAN_BLOCKS).toString(16)}`);
    assert.equal(last.params[0].toBlock, `0x${(1001).toString(16)}`);
  });

  it("native ETH fetches at most 5 blocks per cycle and catches up", async () => {
    const rpc = mockRpc(1000);
    const cfg = { ...BASE_CFG, asset: "ETH", nativeAsset: true, decimals: 18 };
    const input = { watchedAddresses: [addr(1)], fetchImpl: rpc.fetchImpl, runtimeConfig: cfg };
    await fetchNativeEthTransfersForAddresses(input);
    const blocks = () => rpc.calls.filter((c) => c.method === "eth_getBlockByNumber").length;
    assert.equal(blocks(), 5);
    for (let i = 0; i < 20; i += 1) await fetchNativeEthTransfersForAddresses(input);
    const before = blocks();
    await fetchNativeEthTransfersForAddresses(input);
    assert.equal(blocks() - before, 1, "idle head: one overlap block per cycle");
  });
});
