import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePaidMonth } from "../src/service-bills/service-bill-routes.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("service bills paidMonth filter (commission fee base review)", () => {
  it("maps YYYY-MM to the UTC paid_at month", () => {
    const r = parsePaidMonth(new URL("http://x/v1/service-bills?paidMonth=2026-04"));
    assert.deepEqual(r, {
      ok: true,
      paidMonth: {
        startIso: "2026-04-01T00:00:00.000Z",
        endIso: "2026-05-01T00:00:00.000Z",
      },
    });
    const dec = parsePaidMonth(new URL("http://x/?paidMonth=2025-12"));
    assert.equal(dec.ok && dec.paidMonth?.endIso, "2026-01-01T00:00:00.000Z");
  });

  it("is optional and rejects bad months", () => {
    assert.deepEqual(parsePaidMonth(new URL("http://x/")), { ok: true, paidMonth: null });
    assert.equal(parsePaidMonth(new URL("http://x/?paidMonth=2026-13")).ok, false);
    assert.equal(parsePaidMonth(new URL("http://x/?paidMonth=2026-4")).ok, false);
  });

  it("uses the same bill rules as the commission generator", () => {
    const store = readFileSync(join(root, "src/service-bills/service-bill-store.mjs"), "utf8");
    assert.match(store, /status = 'paid' AND COALESCE\(bill_kind, 'monthly'\) = 'monthly'/);
    assert.match(store, /paid_at >= \$\$\{params\.length - 1\}::timestamptz AND paid_at < /);
  });
});
