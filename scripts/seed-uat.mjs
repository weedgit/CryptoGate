#!/usr/bin/env node
/**
 * Minimal UAT stack: platform owner + Kevin Nile wallet org tree.
 *
 * Usage: node scripts/seed-uat.mjs
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const steps = [
  "seed-local.mjs",
  "seed-kevin-uat.mjs",
  "seed-kevin-uat-rich.mjs",
  "seed-kevin-uat-client-demo.mjs",
];

for (const script of steps) {
  console.log(`\n=== ${script} ===`);
  const result = spawnSync(process.execPath, [join(root, "scripts", script)], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\nUAT seed stack complete.");
