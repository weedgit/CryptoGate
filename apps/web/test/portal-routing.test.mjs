import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const routing = readFileSync(join(root, "src/shared/portalRouting.ts"), "utf8");
const app = readFileSync(join(root, "src/App.tsx"), "utf8");
const nginx = readFileSync(
  join(root, "..", "..", "deploy", "nginx-paymentgate.conf"),
  "utf8",
);

describe("portal subdomain routing", () => {
  it("defines dedicated host detection and route helpers", () => {
    assert.match(routing, /portalFromHostname/);
    assert.match(routing, /isDedicatedPortalHost/);
    assert.match(routing, /portalRoute/);
    assert.match(routing, /portalHref/);
  });

  it("App mounts portals from hostname with legacy fallback", () => {
    assert.match(app, /portalFromHostname/);
    assert.match(app, /PlatformApp/);
    assert.match(app, /AgentApp/);
    assert.match(app, /MerchantApp/);
  });

  it("nginx defines platform, agent, and merchant subdomains", () => {
    assert.match(nginx, /platform-cg\.boostbunny\.io/);
    assert.match(nginx, /agent-cg\.boostbunny\.io/);
    assert.match(nginx, /merchant-cg\.boostbunny\.io/);
  });
});
