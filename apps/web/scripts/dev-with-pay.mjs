#!/usr/bin/env node
/**
 * Local merchant web + guest payment-page on :5174 / :5173.
 * Guest pay URLs from the API use PAYMENT_PAGE_BASE_URL (default :5173).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(webDir, "../..");
const payPublic = join(repoRoot, "apps/payment-page/public");
const payPort = process.env.PAYMENT_PAGE_PORT || "5173";
const webPort = process.env.WEB_PORT || process.env.VITE_PORT || "5174";

const viteArgs = process.argv.slice(2);
if (!viteArgs.some((a) => a === "--port" || a.startsWith("--port="))) {
  viteArgs.push("--port", webPort);
}

/** @type {import("node:child_process").ChildProcess[]} */
const children = [];

function log(msg) {
  console.log(`[dev-with-pay] ${msg}`);
}

async function isReachable(origin) {
  try {
    await fetch(`${origin}/`, { signal: AbortSignal.timeout(800) });
    return true;
  } catch {
    return false;
  }
}

function spawnTracked(cmd, args, opts) {
  const child = spawn(cmd, args, { ...opts, stdio: "inherit" });
  children.push(child);
  child.on("exit", (code, signal) => {
    if (signal) return;
    if (code && code !== 0) shutdown(code ?? 1);
  });
  return child;
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function main() {
  if (!existsSync(payPublic)) {
    console.error(`[dev-with-pay] missing payment-page public dir: ${payPublic}`);
    process.exit(1);
  }

  const payOrigin = `http://127.0.0.1:${payPort}`;
  if (await isReachable(payOrigin)) {
    log(`guest pay already up → ${payOrigin}`);
  } else {
    log(`starting guest pay → ${payOrigin}`);
    spawnTracked(
      "npx",
      ["--yes", "serve@14", "public", "-p", payPort],
      { cwd: join(repoRoot, "apps/payment-page"), detached: false },
    );
    for (let i = 0; i < 20; i++) {
      if (await isReachable(payOrigin)) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!(await isReachable(payOrigin))) {
      console.error(
        `[dev-with-pay] guest pay did not start on ${payOrigin} — check port ${payPort}`,
      );
      process.exit(1);
    }
  }

  log(`starting merchant web → http://127.0.0.1:${webPort}`);
  spawnTracked("npx", ["vite", ...viteArgs], { cwd: webDir, env: process.env });
}

main().catch((err) => {
  console.error(err);
  shutdown(1);
});
