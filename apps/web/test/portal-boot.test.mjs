import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("portal boot splash", () => {
  it("uses shell boot chrome instead of auth marketing during refresh", () => {
    const shellBoot = readFileSync(
      join(root, "src/auth/PortalShellBoot.tsx"),
      "utf8",
    );
    assert.doesNotMatch(shellBoot, /AuthLayout/);
    assert.doesNotMatch(shellBoot, /AuthBackground/);
    assert.match(shellBoot, /portal-shell-boot/);

    const app = readFileSync(join(root, "src/App.tsx"), "utf8");
    assert.match(app, /PortalShellBoot/);

    const platform = readFileSync(
      join(root, "src/platform/PlatformApp.tsx"),
      "utf8",
    );
    assert.match(platform, /PortalShellBoot/);
    assert.doesNotMatch(platform, /PortalBootScreen/);
  });

  it("restores session from cache and prefetches the current route", () => {
    const boot = readFileSync(join(root, "src/auth/usePortalBoot.ts"), "utf8");
    assert.match(boot, /readCachedSession/);
    assert.match(boot, /writeCachedSession/);
    assert.match(boot, /prefetchCurrentPortalRoute/);

    const cache = readFileSync(
      join(root, "src/auth/sessionCache.ts"),
      "utf8",
    );
    assert.match(cache, /sessionStorage/);
    assert.match(cache, /getPortal/);
  });

  it("keeps branded auth boot screen for sign-in flows", () => {
    const boot = readFileSync(
      join(root, "src/auth/PortalBootScreen.tsx"),
      "utf8",
    );
    assert.match(boot, /AuthLayout/);
    assert.match(boot, /login-card--boot/);
  });
});
