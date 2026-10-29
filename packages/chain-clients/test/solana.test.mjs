import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { USDT_SOLANA, USDC_SOLANA } from "@paymentgate/domain";
import { healthCheck, getSolanaConfig, listRecentTransfers } from "../solana/index.mjs";

describe("@paymentgate/chain-clients/solana", () => {
  it("healthCheck stub without SOLANA_RPC_URL", async () => {
    const h = await healthCheck();
    assert.equal(h.network, "solana");
    assert.equal(h.mode, "stub");
  });

  it("getSolanaConfig resolves USDT and USDC mints", () => {
    assert.equal(getSolanaConfig("USDT").mintAddress, USDT_SOLANA.contractAddress);
    assert.equal(getSolanaConfig("USDC").mintAddress, USDC_SOLANA.contractAddress);
    assert.equal(USDT_SOLANA.enabled, true);
  });

  it("listRecentTransfers empty stub", async () => {
    const r = await listRecentTransfers({
      asset: "USDT",
      watchedAddresses: ["9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsHYdWzZQZJqJqJq"],
    });
    assert.deepEqual(r.transfers, []);
    assert.equal(r.mode, "stub");
  });
});

describe("@paymentgate/chain-clients/solana SPL mapping (H3 / H4)", () => {
  const owner = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsHYdWzZQZJqJqJq";
  const mint = USDT_SOLANA.contractAddress;
  const cfg = { owner, mint, decimals: 6, asset: "USDT", network: "solana" };
  const tx = (meta) => ({
    blockTime: 1_760_000_000,
    transaction: { signatures: ["sig1"] },
    meta: {
      preTokenBalances: [{ accountIndex: 1, mint, owner, uiTokenAmount: { amount: "0" } }],
      postTokenBalances: [{ accountIndex: 1, mint, owner, uiTokenAmount: { amount: "5000000" } }],
      ...meta,
    },
  });

  it("carries the block time", async () => {
    const { mapSplTransferFromTransaction } = await import("../solana/rpc.mjs");
    const mapped = mapSplTransferFromTransaction(tx({ err: null }), cfg);
    assert.equal(mapped.amount, "5");
    assert.equal(mapped.blockTimestampMs, 1_760_000_000_000);
  });

  it("ignores failed transactions", async () => {
    const { mapSplTransferFromTransaction } = await import("../solana/rpc.mjs");
    assert.equal(mapSplTransferFromTransaction(tx({ err: { InstructionError: [0, "x"] } }), cfg), null);
  });
});

describe("@paymentgate/chain-clients/solana signatures (M4 / M9)", () => {
  it("pages back to the oldest order and decodes each signature once", async () => {
    const { fetchSplTransfersForAddresses, resetSolanaSignatureCache } = await import(
      "../solana/rpc.mjs"
    );
    resetSolanaSignatureCache();
    const owner = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsHYdWzZQZJqJqJq";
    const mint = USDT_SOLANA.contractAddress;
    const calls = [];
    const fetchImpl = async (_url, init) => {
      const body = JSON.parse(String(init.body));
      calls.push(body.method);
      let result = null;
      if (body.method === "getTokenAccountsByOwner") result = { value: [] };
      if (body.method === "getSignaturesForAddress") {
        const before = body.params[1].before;
        result = before
          ? [{ signature: "s3", blockTime: 1_000 }]
          : [
              { signature: "s1", blockTime: 2_000_000_000 },
              { signature: "s2", blockTime: 2_000_000_000 },
            ];
      }
      if (body.method === "getTransaction") {
        result = {
          blockTime: 2_000_000_000,
          transaction: { signatures: [body.params[0]] },
          meta: {
            err: null,
            preTokenBalances: [],
            postTokenBalances: [{ accountIndex: 1, mint, owner, uiTokenAmount: { amount: "1000000" } }],
          },
        };
      }
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    };
    const runtimeConfig = {
      configured: true,
      rpcUrl: "https://sol.test",
      apiKey: "",
      mintAddress: mint,
      decimals: 6,
      asset: "USDT",
      network: "solana",
      signatureLimit: 2,
    };
    const input = {
      watchedAddresses: [owner],
      addressSinceMs: { [owner]: 1_500_000 * 1000 },
      fetchImpl: /** @type {typeof fetch} */ (fetchImpl),
      runtimeConfig,
    };
    const first = await fetchSplTransfersForAddresses(input);
    assert.deepEqual(first.transfers.map((t) => t.txHash), ["s1", "s2", "s3"]);
    const decodes = calls.filter((m) => m === "getTransaction").length;
    assert.equal(decodes, 3);
    const second = await fetchSplTransfersForAddresses(input);
    assert.equal(second.transfers.length, 3);
    assert.equal(calls.filter((m) => m === "getTransaction").length, decodes, "no re-decode");
  });
});
