import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { USDT_BNB_SMART_CHAIN } from "@paymentgate/domain";
import {
  healthCheck,
  getBnbSmartChainConfig,
  listRecentTransfers,
  dedupeTransfersByTxHash,
  mapTransferLog,
  ERC20_TRANSFER_TOPIC,
} from "../bnb_smart_chain/index.mjs";

describe("@paymentgate/chain-clients/bnb_smart_chain stub", () => {
  it("healthCheck returns stub mode without BSC_RPC_URL", async () => {
    const h = await healthCheck();
    assert.equal(h.network, "bnb_smart_chain");
    assert.equal(h.mode, "stub");
    assert.equal(h.ok, true);
    assert.equal(h.rpcConfigured, false);
  });

  it("getBnbSmartChainConfig reads USDT_BNB_SMART_CHAIN (18 decimals, 15 conf)", () => {
    const cfg = getBnbSmartChainConfig();
    assert.equal(cfg.network, "bnb_smart_chain");
    assert.equal(cfg.asset, "USDT");
    assert.equal(cfg.usdtContractAddress, USDT_BNB_SMART_CHAIN.contractAddress);
    assert.equal(cfg.requiredConfirmations, USDT_BNB_SMART_CHAIN.requiredConfirmations);
    assert.equal(cfg.decimals, 18);
    assert.equal(USDT_BNB_SMART_CHAIN.enabled, true);
    assert.notEqual(cfg.requiredConfirmations, 19);
    assert.notEqual(cfg.decimals, 6);
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
      { txHash: "0xa", network: "bnb_smart_chain" },
      { txHash: "0xa", network: "bnb_smart_chain" },
    ]);
    assert.equal(out.length, 1);
  });
});

describe("@paymentgate/chain-clients/bnb_smart_chain map (18 decimals)", () => {
  it("mapTransferLog maps BEP-20 Transfer with 18 decimals", () => {
    const to = "0x742d35cc6634c0532925a3b844bc9e7595f0beb0";
    // 1e18 minor = 1.0 major at 18 decimals
    const mapped = mapTransferLog(
      {
        address: USDT_BNB_SMART_CHAIN.contractAddress,
        transactionHash: "0xbscabc",
        topics: [
          ERC20_TRANSFER_TOPIC,
          "0x0000000000000000000000001111111111111111111111111111111111111111",
          `0x000000000000000000000000${to.replace(/^0x/, "")}`,
        ],
        data: "0x0000000000000000000000000000000000000000000000000de0b6b3a7640000",
      },
      {
        contractAddress: USDT_BNB_SMART_CHAIN.contractAddress,
        decimals: 18,
        network: "bnb_smart_chain",
      },
    );
    assert.deepEqual(mapped, {
      toAddress: to,
      amount: "1",
      txHash: "0xbscabc",
      asset: "USDT",
      network: "bnb_smart_chain",
      memoOrTag: undefined,
    });
  });
});

describe("@paymentgate/chain-clients/bnb_smart_chain rpc env", () => {
  const prev = process.env.BSC_RPC_URL;

  before(() => {
    process.env.BSC_RPC_URL = "https://bsc-dataseed.binance.org";
  });

  after(() => {
    if (prev === undefined) delete process.env.BSC_RPC_URL;
    else process.env.BSC_RPC_URL = prev;
  });

  it("healthCheck reports bsc-rpc when BSC_RPC_URL set", async () => {
    const h = await healthCheck();
    assert.equal(h.mode, "bsc-rpc");
    assert.equal(h.rpcConfigured, true);
  });
});
