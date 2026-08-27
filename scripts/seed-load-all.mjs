#!/usr/bin/env node
/**
 * Run the full local load-test seed stack for UI review.
 *
 * Order: seed-local → seed-load-orgs → seed-load-accounts-rich →
 *        seed-load-accounts-bulk → seed-load-bills →
 *        seed-load-platform-logic
 *
 * Usage: node scripts/seed-load-all.mjs
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const steps = [
  "seed-local.mjs",
  "seed-load-orgs.mjs",
  "seed-load-accounts-rich.mjs",
  "seed-load-accounts-bulk.mjs",
  "seed-load-bills.mjs",
  "seed-load-platform-logic.mjs",
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

console.log("\nLoad seed stack complete.");
