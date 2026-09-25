import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("commission payout list query (status/limit/offset)", () => {
  it("store filters by status ANY and returns total/limit/offset", () => {
    const store = readFileSync(
      join(root, "src/commercial/commission-payout-store.mjs"),
      "utf8",
    );
    assert.match(store, /payout_status = ANY\(\$/);
    assert.match(store, /normalizeStatusFilter/);
    assert.match(store, /return \{ rows, total, limit, offset \}/);
    assert.match(store, /Math\.min\(Math\.max\(Number\(filter\.limit\) \|\| 200/);
  });

  it("route accepts status/limit/offset and responds with pagination fields", () => {
    const routes = readFileSync(
      join(root, "src/commercial/commission-payout-routes.mjs"),
      "utf8",
    );
    assert.match(routes, /searchParams\.get\("status"\)/);
    assert.match(routes, /searchParams\.get\("limit"\)/);
    assert.match(routes, /searchParams\.get\("offset"\)/);
    assert.match(routes, /items: result\.rows\.map\(toCommissionPayout\)/);
    assert.match(routes, /total: result\.total/);
    assert.match(routes, /limit must be an integer 1–500/);
  });
});
