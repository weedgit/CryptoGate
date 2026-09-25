import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("payment order list pagination", () => {
  it("store returns total/limit/offset with OFFSET", () => {
    const store = readFileSync(
      join(root, "src/orders/order-store.mjs"),
      "utf8",
    );
    assert.match(store, /OFFSET \$\$/);
    assert.match(store, /return \{ rows, total, limit, offset \}/);
  });

  it("routes respond with pagination fields", () => {
    const routes = readFileSync(
      join(root, "src/orders/order-list-routes.mjs"),
      "utf8",
    );
    assert.match(routes, /total: result\.total/);
    assert.match(routes, /offset: parsed\.offset/);
  });
});
