import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertWatchOnlyEnv,
  isWatchOnlyXpub,
  looksLikeSpendKey,
} from "../src/security/spend-material.mjs";

describe("watch-only spend material", () => {
  it("rejects xprv, hex keys, and mnemonics", () => {
    assert.equal(looksLikeSpendKey("xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4fbQkV5Y"), true);
    assert.equal(
      looksLikeSpendKey("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
      true,
    );
    assert.equal(
      looksLikeSpendKey(
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
      ),
      true,
    );
    assert.equal(looksLikeSpendKey("TPlatformWallet1234567890123456789012"), false);
  });

  it("accepts watch-only xpub prefixes only", () => {
    assert.equal(isWatchOnlyXpub("xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKpovv"), true);
    assert.equal(isWatchOnlyXpub("xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4fbQkV5Y"), false);
  });

  it("refuses spend-key process env", () => {
    assert.throws(
      () => assertWatchOnlyEnv({ MNEMONIC: "abandon abandon abandon" }),
      /Watch-only invariant/,
    );
    assert.doesNotThrow(() =>
      assertWatchOnlyEnv({ TRON_API_KEY: "quota-key-not-a-spend-key" }),
    );
  });
});
