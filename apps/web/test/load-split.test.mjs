import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("web load split", () => {
  it("lazy-loads portal apps and non-dashboard routes", () => {
    const app = readFileSync(join(root, "src/App.tsx"), "utf8");
    assert.match(app, /lazyNamed/);
    assert.match(app, /import\("\.\/platform\/PlatformApp"\)/);
    assert.match(app, /Suspense/);

    const platform = readFileSync(
      join(root, "src/platform/PlatformApp.tsx"),
      "utf8",
    );
    assert.match(platform, /import\("\.\/DashboardPage"\)/);
    assert.match(platform, /import\("\.\/AuditLogPage"\)/);
    assert.doesNotMatch(
      platform,
      /import \{ DashboardPage \} from "\.\/DashboardPage"/,
    );

    const vite = readFileSync(join(root, "vite.config.ts"), "utf8");
    assert.match(vite, /manualChunks/);
  });
});
