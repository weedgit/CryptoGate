import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function isChunkLoadError(err) {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("loading chunk") ||
    msg.includes("importing a module script failed") ||
    msg.includes("error loading dynamically imported module")
  );
}

describe("lazy chunk recovery", () => {
  it("detects Vite dynamic import failures", () => {
    assert.equal(
      isChunkLoadError(
        new Error(
          "Failed to fetch dynamically imported module: https://example.com/assets/Page-abc.js",
        ),
      ),
      true,
    );
    assert.equal(isChunkLoadError(new Error("Not found")), false);
  });

  it("wraps lazyNamed loaders with loadLazyChunk", () => {
    const lazyNamed = readFileSync(
      join(root, "src/shared/lazyNamed.ts"),
      "utf8",
    );
    assert.match(lazyNamed, /loadLazyChunk/);
  });

  it("guards lazy routes with an error boundary", () => {
    const lazyRoute = readFileSync(
      join(root, "src/shared/LazyRoute.tsx"),
      "utf8",
    );
    assert.match(lazyRoute, /RouteErrorBoundary/);

    const app = readFileSync(join(root, "src/App.tsx"), "utf8");
    assert.match(app, /RouteErrorBoundary/);
  });

  it("reload guard is one-shot per tab session", () => {
    const src = readFileSync(
      join(root, "src/shared/lazyChunkRecovery.ts"),
      "utf8",
    );
    assert.match(src, /cg-chunk-reload/);
    assert.match(src, /sessionStorage\.getItem/);
    assert.match(src, /window\.location\.reload/);
  });
});

describe("nginx SPA cache", () => {
  it("disables caching for index.html and SPA fallbacks", () => {
    const nginx = readFileSync(
      join(root, "../../deploy/nginx-portal-spa.inc"),
      "utf8",
    );
    assert.match(nginx, /location = \/index\.html/);
    assert.match(nginx, /no-cache, no-store, must-revalidate/);
  });
});
