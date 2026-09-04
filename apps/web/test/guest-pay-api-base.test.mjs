import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("guest payment page api base", () => {
  it("normalizes PAYMENTGATE_API_BASE and legacy CRYPTOGATE alias", () => {
    const apiBase = readFileSync(
      join(root, "apps/payment-page/public/api-base.js"),
      "utf8",
    );
    assert.match(apiBase, /PAYMENTGATE_API_BASE/);
    assert.match(apiBase, /CRYPTOGATE_API_BASE/);

    const index = readFileSync(
      join(root, "apps/payment-page/public/index.html"),
      "utf8",
    );
    assert.match(index, /api-base\.js/);
    assert.match(index, /config\.js/);
    assert.doesNotMatch(index, /245\.00/);
    assert.doesNotMatch(index, /CG-2026-0847/);
    assert.doesNotMatch(index, /TX7s39gK1p9ZqR5mY8bV2wXn5uH4kP9qR2/);
    assert.match(index, /data-live-field/);
    assert.match(index, /dataset\.payMode/);

    const mock = readFileSync(
      join(root, "apps/payment-page/public/mock-order.js"),
      "utf8",
    );
    assert.match(mock, /PAYMENTGATE_API_BASE/);
  });
});
