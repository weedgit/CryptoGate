#!/usr/bin/env node
/**
 * Sprint 0 / contract freeze local check (no pnpm filter required).
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
run(tsc, ["-p", "packages/domain/tsconfig.json"]);
run("node", ["--test", "packages/domain/test/domain.test.mjs"]);
run(tsc, ["-p", "packages/matching/tsconfig.json"]);
run("node", ["--test", "packages/matching/test/matching.test.mjs"]);
run("node", ["apps/watcher/src/main.mjs"]);
run("node", ["apps/api/src/health.mjs"]);
console.log("Sprint 0 check: ok (contract freeze v0.1)");
