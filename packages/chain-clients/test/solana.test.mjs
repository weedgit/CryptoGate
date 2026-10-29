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
