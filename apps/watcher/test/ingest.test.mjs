import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dedupeTransfersByTxHash } from "@paymentgate/chain-clients/tron";

describe("@paymentgate/watcher tron ingest helpers (M3-40)", () => {
  it("dedupeTransfersByTxHash keeps first of duplicate hashes", () => {
    const out = dedupeTransfersByTxHash([
      { txHash: "0x1", network: "tron", toAddress: "A", amount: "1" },
      { txHash: "0x1", network: "tron", toAddress: "A", amount: "1" },
      { txHash: "0x2", network: "tron", toAddress: "B", amount: "2" },
      { txHash: "", network: "tron", toAddress: "C", amount: "3" },
    ]);
    assert.equal(out.length, 2);
    assert.equal(out[0].txHash, "0x1");
    assert.equal(out[1].txHash, "0x2");
  });
});
