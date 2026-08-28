import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { USDT_POLYGON, USDC_POLYGON } from "@cryptogate/domain";
import {
  healthCheck,
  getPolygonConfig,
  listRecentTransfers,
  dedupeTransfersByTxHash,
  mapTransferLog,
  ERC20_TRANSFER_TOPIC,
} from "../polygon/index.mjs";

describe("@cryptogate/chain-clients/polygon stub", () => {
  it("healthCheck returns stub mode without POLYGON_RPC_URL", async () => {
    const h = await healthCheck();
    assert.equal(h.network, "polygon");
    assert.equal(h.mode, "stub");
    assert.equal(h.ok, true);
    assert.equal(h.rpcConfigured, false);
  });

  it("getPolygonConfig reads USDT_POLYGON (64 conf)", () => {
    const cfg = getPolygonConfig("USDT");
    assert.equal(cfg.network, "polygon");
    assert.equal(cfg.asset, "USDT");
    assert.equal(cfg.tokenContractAddress, USDT_POLYGON.contractAddress);
    assert.equal(cfg.requiredConfirmations, 64);
    assert.equal(USDT_POLYGON.enabled, true);
  });

  it("getPolygonConfig resolves USDC on polygon when enabled", () => {
    const cfg = getPolygonConfig("USDC");
    assert.equal(cfg.asset, "USDC");
    assert.equal(cfg.tokenContractAddress, USDC_POLYGON.contractAddress);
    assert.equal(cfg.pairEnabled, true);
  });

  it("listRecentTransfers returns empty stub with watched count", async () => {
    const result = await listRecentTransfers({
      asset: "USDT",
      watchedAddresses: ["0x742d35cc6634c0532925a3b844bc9e7595f0beb0"],
    });
    assert.deepEqual(result.transfers, []);
    assert.equal(result.mode, "stub");
    assert.equal(result.watchedAddressCount, 1);
  });

  it("dedupeTransfersByTxHash drops duplicates", () => {
    const out = dedupeTransfersByTxHash([
      { txHash: "0xa", network: "polygon" },
      { txHash: "0xa", network: "polygon" },
    ]);
    assert.equal(out.length, 1);
  });
});

describe("@cryptogate/chain-clients/polygon map", () => {
  it("mapTransferLog maps ERC-20 Transfer on polygon", () => {
    const to = "0x742d35cc6634c0532925a3b844bc9e7595f0beb0";
    const mapped = mapTransferLog(
      {
        address: USDT_POLYGON.contractAddress,
        transactionHash: "0xpolyabc",
        topics: [
          ERC20_TRANSFER_TOPIC,
          "0x0000000000000000000000001111111111111111111111111111111111111111",
          `0x000000000000000000000000${to.replace(/^0x/, "")}`,
        ],
        data: "0x000000000000000000000000000000000000000000000000000000000f4240",
      },
      {
        contractAddress: USDT_POLYGON.contractAddress,
        decimals: 6,
        asset: "USDT",
        network: "polygon",
      },
    );
    assert.equal(mapped?.toAddress, to);
    assert.equal(mapped?.amount, "1");
    assert.equal(mapped?.network, "polygon");
  });
});

describe("@cryptogate/chain-clients/polygon rpc env", () => {
  const prev = process.env.POLYGON_RPC_URL;

  before(() => {
    process.env.POLYGON_RPC_URL = "https://polygon-rpc.example";
  });

  after(() => {
    if (prev === undefined) delete process.env.POLYGON_RPC_URL;
    else process.env.POLYGON_RPC_URL = prev;
  });

  it("healthCheck reports polygon-rpc when POLYGON_RPC_URL set", async () => {
    const h = await healthCheck();
    assert.equal(h.mode, "polygon-rpc");
    assert.equal(h.rpcConfigured, true);
  });
});
