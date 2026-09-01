import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertWatchOnlyEnv } from "../src/assert-watch-only-env.mjs";

describe("watcher watch-only env", () => {
  it("refuses MNEMONIC / xprv env", () => {
    assert.throws(() => assertWatchOnlyEnv({ MNEMONIC: "secret" }), /Watch-only/);
    assert.throws(
      () => assertWatchOnlyEnv({ EXTRA: "xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4fbQkV5Y" }),
      /Watch-only/,
    );
  });

  it("allows RPC keys", () => {
    assert.doesNotThrow(() => assertWatchOnlyEnv({ TRON_API_KEY: "quota" }));
  });
});
