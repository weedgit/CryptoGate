import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chainFetchTimeoutMs,
  DEFAULT_CHAIN_FETCH_TIMEOUT_MS,
  fetchWithTimeout,
} from "../fetch-timeout.mjs";

describe("chainFetchTimeoutMs", () => {
  it("defaults when unset", () => {
    assert.equal(chainFetchTimeoutMs(undefined), DEFAULT_CHAIN_FETCH_TIMEOUT_MS);
    assert.equal(chainFetchTimeoutMs(""), DEFAULT_CHAIN_FETCH_TIMEOUT_MS);
  });

  it("parses positive ms and caps", () => {
    assert.equal(chainFetchTimeoutMs("8000"), 8000);
    assert.equal(chainFetchTimeoutMs("999999"), 120_000);
    assert.equal(chainFetchTimeoutMs("-1"), DEFAULT_CHAIN_FETCH_TIMEOUT_MS);
  });
});

describe("fetchWithTimeout", () => {
  it("returns response when fetch completes", async () => {
    const res = await fetchWithTimeout(
      async () =>
        /** @type {Response} */ ({
          ok: true,
          status: 200,
        }),
      "https://example.test",
      {},
      1000,
    );
    assert.equal(res.status, 200);
  });

  it("aborts hanging fetch", async () => {
    await assert.rejects(
      () =>
        fetchWithTimeout(
          (_url, init) =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => {
                const err = new Error("Aborted");
                err.name = "AbortError";
                reject(err);
              });
            }),
          "https://example.test/hang",
          {},
          50,
        ),
      /chain fetch timeout after 50ms/,
    );
  });
});
