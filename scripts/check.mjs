#!/usr/bin/env node
/**
 * Contract / package gate (no pnpm filter required).
 * Builds domain before matching (project references), then runs package + watcher tests.
 * Usage: node scripts/check.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tsc = join(root, "node_modules", ".bin", "tsc");

function run(cmd, args, cwd = root) {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: false });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

/** Composite incremental + gitignored dist can skip emit; wipe before tsc. */
function cleanTsEmit(pkgRel) {
  rmSync(join(root, pkgRel, "dist"), { recursive: true, force: true });
  rmSync(join(root, pkgRel, "tsconfig.tsbuildinfo"), { force: true });
}

run("node", [join(root, "packages/api-spec/scripts/lint.mjs")]);
if (!existsSync(tsc)) {
  console.error("Missing typescript. Run: npx pnpm@9.15.0 install");
  process.exit(1);
}

// Domain must emit dist/ before matching tsc (workspace + project references).
cleanTsEmit("packages/domain");
run(tsc, ["-p", "packages/domain/tsconfig.json"]);
run("node", ["--test", "packages/domain/test/domain.test.mjs"]);

cleanTsEmit("packages/matching");
run(tsc, ["-p", "packages/matching/tsconfig.json"]);
run("node", [
  "--test",
  "packages/matching/test/matching.test.mjs",
  "packages/matching/test/acceptance-2.8.test.mjs",
]);

run("node", ["--test", "packages/chain-clients/test/tron.test.mjs"]);
run("node", [
  "--test",
  "apps/watcher/test/watcher.test.mjs",
  "apps/watcher/test/inbound-match.test.mjs",
  "apps/watcher/test/confirmations.test.mjs",
  "apps/watcher/test/restart-safety.test.mjs",
  "apps/watcher/test/reorg.test.mjs",
  "apps/watcher/test/anomaly-paths.test.mjs",
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
  "apps/api/test/hd-pool.test.mjs",
  "apps/api/test/signing.test.mjs",
  "apps/api/test/auth-http.test.mjs",
  "apps/api/test/api-key-rules.test.mjs",
  "apps/api/test/rate-limit.test.mjs",
  "apps/api/test/webhook-rules.test.mjs",
  "apps/api/test/webhook-deliver.test.mjs",
  "apps/api/test/webhook-fanout.test.mjs",
  "apps/api/test/service-bill-rules.test.mjs",
  "apps/api/test/authz-regression.test.mjs",
]);
run("node", ["apps/api/src/health.mjs"]);
run("node", ["--test", "apps/cashier-apk/scripts/check-scaffold.mjs"]);
run("node", ["doc/examples/webhook-verify.mjs"]);
run("node", ["doc/examples/api-signing-smoke.mjs"]);

console.log("Check: ok (OpenAPI v0.3.1 + M4-11 api-keys + M3 T07/T08 samples)");
