import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  ERC20_MAX_SPAN_BLOCKS,
  ERC20_RESCAN_BLOCKS,
  blockAtOrBefore,
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

  it("scanRange starts at startIfNew, then only new blocks plus overlap", () => {
    const opts = { floor: 0, startIfNew: 950, overlap: 12, maxSpan: 51 };
    assert.deepEqual(scanRange(undefined, 1000, opts), { fromBlock: 950, toBlock: 1000 });
    assert.deepEqual(scanRange(1000, 1002, opts), { fromBlock: 989, toBlock: 1002 });
    assert.deepEqual(
      scanRange(1000, 1000, { floor: 0, startIfNew: 950, overlap: 1, maxSpan: 5 }),
      { fromBlock: 1000, toBlock: 1000 },
    );
    // A cursor far behind catches up from the cursor (no lookback clamp), maxSpan at a time.
    assert.deepEqual(
      scanRange(900, 1000, { floor: 0, startIfNew: 950, overlap: 1, maxSpan: 5 }),
      { fromBlock: 900, toBlock: 904 },
    );
    assert.deepEqual(
      scanRange(10, 1000, { floor: 500, startIfNew: 950, overlap: 1, maxSpan: 5 }),
      { fromBlock: 500, toBlock: 504 },
    );
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

describe("native ETH receipts (H3 / H4)", () => {
  beforeEach(() => resetEthScanCursors());

  it("drops reverted transfers and stamps block time", async () => {
    const payee = addr(7);
    const fetchImpl = async (_url, init) => {
      const body = JSON.parse(String(init.body));
      let result = null;
      if (body.method === "eth_blockNumber") result = "0x3e8";
      if (body.method === "eth_getBlockByNumber") {
        result = {
          timestamp: "0x6553f100",
          transactions: [
            { hash: "0xok", to: payee, value: "0xde0b6b3a7640000" },
            { hash: "0xreverted", to: payee, value: "0xde0b6b3a7640000" },
          ],
        };
      }
      if (body.method === "eth_getTransactionReceipt") {
        result = { blockNumber: "0x3e8", status: body.params[0] === "0xok" ? "0x1" : "0x0" };
      }
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    };
    const cfg = { ...BASE_CFG, asset: "ETH", nativeAsset: true, decimals: 18, nativeMaxBlocksPerTick: 1 };
    const result = await fetchNativeEthTransfersForAddresses({
      watchedAddresses: [payee],
      fetchImpl: /** @type {typeof fetch} */ (fetchImpl),
      runtimeConfig: cfg,
    });
    assert.deepEqual(result.transfers.map((t) => t.txHash), ["0xok"]);
    assert.equal(result.transfers[0].amount, "1");
    assert.equal(result.transfers[0].blockTimestampMs, 0x6553f100 * 1000);
  });
});

describe("ethereum per-address cursors (H5)", () => {
  beforeEach(() => resetEthScanCursors());

  const logsFor = (rpc, address) =>
    rpc.calls.filter(
      (c) =>
        c.method === "eth_getLogs" &&
        [].concat(c.params[0].topics[2]).some((t) => t.endsWith(address.slice(2))),
    );

  it("an address skipped by rotation resumes from its own cursor", async () => {
    const rpc = mockRpc(1000);
    const a = addr(1);
    const b = addr(2);
    const poll = (watched) =>
      fetchErc20TransfersForAddresses({
        watchedAddresses: watched,
        fetchImpl: rpc.fetchImpl,
        runtimeConfig: BASE_CFG,
      });
    await poll([a]);
    rpc.state.head = 1100;
    await poll([b]);
    rpc.state.head = 1101;
    await poll([a]);
    const last = logsFor(rpc, a).at(-1);
    assert.equal(last.params[0].fromBlock, `0x${(1001 - ERC20_RESCAN_BLOCKS).toString(16)}`);
    assert.equal(last.params[0].toBlock, `0x${(1101).toString(16)}`);
  });

  it("a never-scanned address starts at its oldest order, not the lookback", async () => {
    const rpc = mockRpc(100_000);
    const a = addr(3);
    const nowMs = Date.parse("2026-10-29T12:00:00Z");
    await fetchErc20TransfersForAddresses({
      watchedAddresses: [a],
      addressSinceMs: { [a]: nowMs - 60 * 60 * 1000 },
      nowMs,
      fetchImpl: rpc.fetchImpl,
      runtimeConfig: BASE_CFG,
    });
    const first = logsFor(rpc, a)[0];
    assert.equal(
      first.params[0].fromBlock,
      `0x${blockAtOrBefore(100_000, nowMs - 60 * 60 * 1000, nowMs).toString(16)}`,
    );
    assert.ok(Number.parseInt(first.params[0].fromBlock, 16) <= 100_000 - 300);
  });

  it("a catching-up address never holds back current ones", async () => {
    const rpc = mockRpc(100_000);
    const fresh = addr(4);
    const old = addr(5);
    const nowMs = Date.parse("2026-10-29T12:00:00Z");
    await fetchErc20TransfersForAddresses({
      watchedAddresses: [fresh, old],
      addressSinceMs: { [old]: nowMs - 3 * 24 * 60 * 60 * 1000 },
      nowMs,
      fetchImpl: rpc.fetchImpl,
      runtimeConfig: BASE_CFG,
    });
    const freshCall = logsFor(rpc, fresh)[0];
    const oldCall = logsFor(rpc, old)[0];
    assert.notEqual(freshCall, oldCall);
    assert.equal(freshCall.params[0].toBlock, `0x${(100_000).toString(16)}`);
    const span =
      Number.parseInt(oldCall.params[0].toBlock, 16) -
      Number.parseInt(oldCall.params[0].fromBlock, 16) +
      1;
    assert.equal(span, ERC20_MAX_SPAN_BLOCKS);
  });

  it("native ETH matches every open address, not only this tick's subset", async () => {
    const polled = addr(8);
    const deferred = addr(9);
    const fetchImpl = async (_url, init) => {
      const body = JSON.parse(String(init.body));
      let result = null;
      if (body.method === "eth_blockNumber") result = "0x3e8";
      if (body.method === "eth_getBlockByNumber") {
        result = {
          timestamp: "0x6553f100",
          transactions: [{ hash: "0xdeferred", to: deferred, value: "0x1" }],
        };
      }
      if (body.method === "eth_getTransactionReceipt") result = { status: "0x1", blockNumber: "0x3e8" };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    };
    const result = await fetchNativeEthTransfersForAddresses({
      watchedAddresses: [polled],
      allWatchedAddresses: [polled, deferred],
      fetchImpl: /** @type {typeof fetch} */ (fetchImpl),
      runtimeConfig: { ...BASE_CFG, asset: "ETH", nativeAsset: true, decimals: 18, nativeMaxBlocksPerTick: 1 },
    });
    assert.deepEqual(result.transfers.map((t) => t.txHash), ["0xdeferred"]);
  });
});
