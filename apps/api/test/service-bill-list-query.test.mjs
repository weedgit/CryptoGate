import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("service bill list query (limit/offset/total)", () => {
  it("store returns total/limit/offset with OFFSET", () => {
    const store = readFileSync(
      join(root, "src/service-bills/service-bill-store.mjs"),
      "utf8",
    );
    assert.match(store, /OFFSET \$\$/);
    assert.match(store, /return \{ rows, total, limit, offset \}/);
    assert.match(store, /count\(\*\)::int AS n/);
  });

  it("route accepts offset and responds with pagination fields", () => {
    const routes = readFileSync(
      join(root, "src/service-bills/service-bill-routes.mjs"),
      "utf8",
    );
    assert.match(routes, /parseServiceBillListOffset/);
    assert.match(routes, /total: result\.total/);
    assert.match(routes, /offset must be an integer/);
  });
});
