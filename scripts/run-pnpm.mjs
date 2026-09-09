#!/usr/bin/env node
/**
 * Run the pinned workspace pnpm (`.tools/pnpm-9.15.0`) or fall back to PATH.
 * Use from root package.json so scripts work when `pnpm` is not on PATH.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pinned = join(root, ".tools/pnpm-9.15.0/bin/pnpm.cjs");
const args = process.argv.slice(2);

let status;
if (existsSync(pinned)) {
  status = spawnSync(process.execPath, [pinned, ...args], {
    stdio: "inherit",
    cwd: root,
    env: process.env,
  }).status;
} else {
  status = spawnSync("pnpm", args, {
    stdio: "inherit",
    cwd: root,
    env: process.env,
    shell: true,
  }).status;
}

process.exit(status ?? 1);
