import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { USDT_SOLANA, USDC_SOLANA } from "@cryptogate/domain";
import { healthCheck, getSolanaConfig, listRecentTransfers } from "../solana/index.mjs";

describe("@cryptogate/chain-clients/solana", () => {
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
