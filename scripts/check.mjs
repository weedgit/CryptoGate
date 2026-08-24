#!/usr/bin/env node
/**
 * Contract / package gate (no pnpm filter required).
 * Builds domain before matching (project references), then runs package + watcher tests.
 * Usage: node scripts/check.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tsc = join(root, "node_modules", ".bin", "tsc");

function run(cmd, args, cwd = root) {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: false });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run("node", [join(root, "packages/api-spec/scripts/lint.mjs")]);
if (!existsSync(tsc)) {
  console.error("Missing typescript. Run: npx pnpm@9.15.0 install");
  process.exit(1);
}

// Domain must emit dist/ before matching tsc (workspace + project references).
run(tsc, ["-p", "packages/domain/tsconfig.json"]);
run("node", ["--test", "packages/domain/test/domain.test.mjs"]);

run(tsc, ["-p", "packages/matching/tsconfig.json"]);
run("node", ["--test", "packages/matching/test/matching.test.mjs"]);

run("node", ["--test", "packages/chain-clients/test/tron.test.mjs"]);
run("node", [
  "--test",
  "apps/watcher/test/watcher.test.mjs",
  "apps/watcher/test/inbound-match.test.mjs",
]);
run("node", ["apps/watcher/src/main.mjs", "--once"]);

// API unit tests that do not require Postgres (auth-http spins an in-process server).
run("node", [
  "--test",
  "apps/api/test/role-policy.test.mjs",
  "apps/api/test/order-map.test.mjs",
  "apps/api/test/order-rules.test.mjs",
  "apps/api/test/order-assign.test.mjs",
  "apps/api/test/order-expiry.test.mjs",
  "apps/api/test/matching-mode-rules.test.mjs",
  "apps/api/test/settlement-rules.test.mjs",
  "apps/api/test/cookies.test.mjs",
  "apps/api/test/totp.test.mjs",
  "apps/api/test/org-rules.test.mjs",
  "apps/api/test/membership-rules.test.mjs",
  "apps/api/test/health.test.mjs",
  "apps/api/test/cors.test.mjs",
  "apps/api/test/audit-rules.test.mjs",
]);
run("node", ["apps/api/src/health.mjs"]);

console.log("Check: ok (OpenAPI v0.2.2 + domain/matching/watcher/api unit)");
