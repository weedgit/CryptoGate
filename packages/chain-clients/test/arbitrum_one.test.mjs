import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { USDT_ARBITRUM_ONE, USDC_ARBITRUM_ONE } from "@paymentgate/domain";
import {
  healthCheck,
  getArbitrumOneConfig,
  listRecentTransfers,
  dedupeTransfersByTxHash,
} from "../arbitrum_one/index.mjs";

describe("@paymentgate/chain-clients/arbitrum_one stub", () => {
  it("healthCheck returns stub mode without ARBITRUM_RPC_URL", async () => {
    const h = await healthCheck();
    assert.equal(h.network, "arbitrum_one");
    assert.equal(h.mode, "stub");
    assert.equal(h.ok, true);
    assert.equal(h.rpcConfigured, false);
  });

  it("getArbitrumOneConfig reads USDT_ARBITRUM_ONE (12 conf)", () => {
    const cfg = getArbitrumOneConfig("USDT");
    assert.equal(cfg.network, "arbitrum_one");
    assert.equal(cfg.asset, "USDT");
    assert.equal(cfg.tokenContractAddress, USDT_ARBITRUM_ONE.contractAddress);
    assert.equal(cfg.requiredConfirmations, 12);
    assert.equal(USDT_ARBITRUM_ONE.enabled, true);
  });

  it("getArbitrumOneConfig resolves USDC on arbitrum_one when enabled", () => {
    const cfg = getArbitrumOneConfig("USDC");
    assert.equal(cfg.asset, "USDC");
    assert.equal(cfg.tokenContractAddress, USDC_ARBITRUM_ONE.contractAddress);
    assert.equal(cfg.pairEnabled, true);
  });

  it("listRecentTransfers returns empty stub with watched count", async () => {
    const result = await listRecentTransfers({
      asset: "USDC",
      watchedAddresses: ["0x742d35cc6634c0532925a3b844bc9e7595f0beb0"],
    });
    assert.deepEqual(result.transfers, []);
    assert.equal(result.mode, "stub");
    assert.equal(result.watchedAddressCount, 1);
  });

  it("dedupeTransfersByTxHash drops duplicates", () => {
    const out = dedupeTransfersByTxHash([
      { txHash: "0xa", network: "arbitrum_one" },
      { txHash: "0xa", network: "arbitrum_one" },
    ]);
    assert.equal(out.length, 1);
  });
});

describe("@paymentgate/chain-clients/arbitrum_one rpc env", () => {
  const prev = process.env.ARBITRUM_RPC_URL;

  before(() => {
    process.env.ARBITRUM_RPC_URL = "https://arb1.arbitrum.io/rpc";
  });

  after(() => {
    if (prev === undefined) delete process.env.ARBITRUM_RPC_URL;
    else process.env.ARBITRUM_RPC_URL = prev;
  });

  it("healthCheck reports arbitrum-rpc when ARBITRUM_RPC_URL set", async () => {
    const h = await healthCheck();
    assert.equal(h.mode, "arbitrum-rpc");
    assert.equal(h.rpcConfigured, true);
  });
});
