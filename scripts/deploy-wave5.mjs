#!/usr/bin/env node
/**
 * Wave 5 — local / staging deploy orchestrator (M4-01 §5, M3-T09 §5).
 *
 *   node scripts/deploy-wave5.mjs                 # prepare + up + smoke
 *   node scripts/deploy-wave5.mjs --prepare       # postgres + install + migrate
 *   node scripts/deploy-wave5.mjs --up            # start API + watcher (background)
 *   node scripts/deploy-wave5.mjs --down          # stop background processes
 *   node scripts/deploy-wave5.mjs --smoke         # health + e2e live
 *   node scripts/deploy-wave5.mjs --restore-drill # pg_dump restore exercise (local)
 *   node scripts/deploy-wave5.mjs --web            # start web dev server (port 5174)
 *   node scripts/deploy-wave5.mjs --local          # prepare + API + watcher + web + seed
 */
import { spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_PLATFORM_OWNER_EMAIL } from "./seed-constants.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const deployDir = join(root, ".deploy");
const pidFile = join(deployDir, "pids.json");
const dumpFile = join(deployDir, "restore-drill.dump");

const flags = new Set(process.argv.slice(2));
const doLocal = flags.has("--local");
const runAll = flags.size === 0;
const doPrepare = runAll || flags.has("--prepare") || doLocal;
const doUp = runAll || flags.has("--up") || doLocal;
const doDown = flags.has("--down");
const doSmoke = (runAll || flags.has("--smoke")) && !doLocal;
const doRestore = flags.has("--restore-drill");
const doAudit = flags.has("--audit");
const doWeb = flags.has("--web") || doLocal;
const doSeed = flags.has("--seed") || doLocal;

const webPort = process.env.WEB_PORT || "5174";
const webOrigin = `http://127.0.0.1:${webPort}`;

const payPort = process.env.PAYMENT_PAGE_PORT || "5173";
const payOrigin = `http://127.0.0.1:${payPort}`;

const apiPort = process.env.API_PORT || "3000";
const apiBase =
  process.env.API_PUBLIC_BASE_URL?.replace(/\/+$/, "") ||
  `http://127.0.0.1:${apiPort}`;

function log(step, msg) {
  console.log(`[wave5:${step}] ${msg}`);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, {
    cwd: root,
    stdio: "inherit",
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
  });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

function pnpm(args) {
  run("npx", ["pnpm@9.15.0", ...args]);
}

function parseEnvLines(text, { override = false } = {}) {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (override || !process.env[key]) {
      process.env[key] = trimmed.slice(eq + 1).trim();
    }
  }
}

function loadEnvFile() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) {
    copyFileSync(join(root, ".env.example"), envPath);
    log("env", "created .env from .env.example");
  }
  parseEnvLines(readFileSync(envPath, "utf8"));

  const productionEnv = "/etc/cryptogate/api.env";
  if (existsSync(productionEnv)) {
    parseEnvLines(readFileSync(productionEnv, "utf8"), { override: true });
    log("env", "applied production overrides from /etc/cryptogate/api.env");
  }

  ensureWebCors();
}

function isSystemdApiActive() {
  const r = spawnSync(
    "systemctl",
    ["is-active", "--quiet", "cryptogate-api.service"],
    { stdio: "pipe" },
  );
  return r.status === 0;
}

function ensureWebCors() {
  const need = [`http://localhost:${webPort}`, `http://127.0.0.1:${webPort}`];
  const raw = process.env.CORS_ALLOWED_ORIGINS ?? "";
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  let changed = false;
  for (const origin of need) {
    if (!parts.includes(origin)) {
      parts.push(origin);
      changed = true;
    }
  }
  if (changed) {
    process.env.CORS_ALLOWED_ORIGINS = parts.join(",");
  }
}

function dockerComposeUp() {
  log("postgres", "starting docker compose postgres");
  run("docker", ["compose", "up", "-d", "postgres"]);
  for (let i = 0; i < 30; i++) {
    const r = spawnSync(
      "docker",
      [
        "compose",
        "exec",
        "-T",
        "postgres",
        "pg_isready",
        "-U",
        "paymentgate",
        "-d",
        "paymentgate",
      ],
      { cwd: root, stdio: "pipe" },
    );
    if (r.status === 0) {
      log("postgres", "ready");
      return;
    }
    sleep(1000);
  }
  console.error("postgres did not become ready in 30s");
  process.exit(1);
}

function prepare() {
  dockerComposeUp();
  pnpm(["install", "--frozen-lockfile"]);
  run(process.execPath, [join(root, "scripts/link-workspace.mjs")]);
  run(process.execPath, [join(root, "scripts/check.mjs")]);
  loadEnvFile();
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
      "postgres://paymentgate:paymentgate@localhost:5432/paymentgate";
  }
  run(process.execPath, [join(root, "apps/api/scripts/migrate.mjs")]);
  log("prepare", "ok");
}

function readPids() {
  if (!existsSync(pidFile)) return null;
  try {
    return JSON.parse(readFileSync(pidFile, "utf8"));
  } catch {
    return null;
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function stopProcesses() {
  const pids = readPids();
  if (!pids) {
    log("down", "no pid file");
    return;
  }
  for (const [name, pid] of Object.entries(pids)) {
    if (typeof pid === "number" && isAlive(pid)) {
      log("down", `stopping ${name} (pid ${pid})`);
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        /* ignore */
      }
    }
  }
  rmSync(pidFile, { force: true });
}

async function waitForHealth() {
  const healthUrl = `${apiBase}/health`;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const body = await res.json();
        if (body.status === "ok" && body.db === "ok") {
          log("up", `health ok (${healthUrl})`);
          return;
        }
      }
    } catch {
      /* retry */
    }
    sleep(500);
  }
  console.error("API health did not pass — check .deploy/api.log");
  process.exit(1);
}

function up() {
  loadEnvFile();
  stopProcesses();
  mkdirSync(deployDir, { recursive: true });

  const apiLog = join(deployDir, "api.log");
  const watcherLog = join(deployDir, "watcher.log");

  if (isSystemdApiActive()) {
    log(
      "up",
      "cryptogate-api.service is already active — skipping background API start (use: systemctl restart cryptogate-api.service)",
    );
    return;
  }

  const apiOut = openSync(apiLog, "a");
  const apiChild = spawn(process.execPath, [join(root, "apps/api/src/server.mjs")], {
    cwd: root,
    env: process.env,
    detached: true,
    stdio: ["ignore", apiOut, apiOut],
  });
  apiChild.unref();

  const watcherOut = openSync(watcherLog, "a");
  const watcherChild = spawn(
    process.execPath,
    [join(root, "apps/watcher/src/main.mjs"), "--loop"],
    {
      cwd: root,
      env: process.env,
      detached: true,
      stdio: ["ignore", watcherOut, watcherOut],
    },
  );
  watcherChild.unref();

  writeFileSync(
    pidFile,
    JSON.stringify({ api: apiChild.pid, watcher: watcherChild.pid }, null, 2),
  );
  log("up", `API pid ${apiChild.pid} → ${apiLog}`);
  log("up", `watcher pid ${watcherChild.pid} → ${watcherLog}`);
}

async function waitForWeb() {
  const url = `${webOrigin}/merchant`;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok || res.status === 404) {
        log("web", `dev server ready (${webOrigin})`);
        return;
      }
    } catch {
      /* retry */
    }
    sleep(500);
  }
  console.error("Web dev server did not start — check .deploy/web.log");
  process.exit(1);
}

function startPaymentPage() {
  loadEnvFile();
  mkdirSync(deployDir, { recursive: true });
  const pids = readPids() ?? {};
  if (pids.paymentPage && isAlive(pids.paymentPage)) {
    log("payment-page", `already running (pid ${pids.paymentPage}) → ${payOrigin}`);
    return;
  }

  const payLog = join(deployDir, "payment-page.log");
  const payOut = openSync(payLog, "a");
  const payChild = spawn(
    "npx",
    ["--yes", "serve@14", "public", "-p", payPort],
    {
      cwd: join(root, "apps/payment-page"),
      env: process.env,
      detached: true,
      stdio: ["ignore", payOut, payOut],
    },
  );
  payChild.unref();

  pids.paymentPage = payChild.pid;
  writeFileSync(pidFile, JSON.stringify(pids, null, 2));
  log("payment-page", `pid ${payChild.pid} → ${payLog}`);
}

async function waitForPaymentPage() {
  const url = `${payOrigin}/`;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok || res.status === 404) {
        log("payment-page", `dev server ready (${payOrigin})`);
        return;
      }
    } catch {
      /* retry */
    }
    sleep(500);
  }
  console.error("Payment-page dev server did not start — check .deploy/payment-page.log");
  process.exit(1);
}

function startWeb() {
  loadEnvFile();
  mkdirSync(deployDir, { recursive: true });
  const pids = readPids() ?? {};
  if (pids.web && isAlive(pids.web)) {
    log("web", `already running (pid ${pids.web}) → ${webOrigin}`);
    return;
  }

  const webLog = join(deployDir, "web.log");
  const webOut = openSync(webLog, "a");
  const webChild = spawn(
    "npx",
    ["pnpm@9.15.0", "--filter", "@paymentgate/web", "dev", "--host", "127.0.0.1", "--port", webPort],
    {
      cwd: root,
      env: process.env,
      detached: true,
      stdio: ["ignore", webOut, webOut],
    },
  );
  webChild.unref();

  pids.web = webChild.pid;
  writeFileSync(pidFile, JSON.stringify(pids, null, 2));
  log("web", `pid ${webChild.pid} → ${webLog}`);
}

function printLocalUrls() {
  console.log("\n--- Local review URLs ---");
  console.log(`Platform   ${webOrigin}/platform`);
  console.log(`Agent      ${webOrigin}/agent`);
  console.log(`Merchant   ${webOrigin}/merchant`);
  console.log(`Guest pay  ${payOrigin}/pay/{orderId}`);
  console.log(`API health ${apiBase}/health`);
  console.log(`Login: ${SEED_PLATFORM_OWNER_EMAIL} / User1234567890! (platform owner)`);
  console.log("Stop:  node scripts/deploy-wave5.mjs --down\n");
}

async function smoke() {
  loadEnvFile();
  const healthUrl = `${apiBase}/health`;
  const res = await fetch(healthUrl, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    console.error(`smoke: health ${res.status} ${healthUrl}`);
    process.exit(1);
  }
  const body = await res.json();
  if (body.status !== "ok" || body.db !== "ok") {
    console.error("smoke: unexpected health payload", body);
    process.exit(1);
  }
  log("smoke", `health ok (${healthUrl})`);

  run(process.execPath, [join(root, "scripts/e2e-smoke.mjs")]);
  run(process.execPath, [join(root, "scripts/e2e-smoke.mjs"), "--live"], {
    env: { E2E_API_BASE: apiBase },
  });
  run(process.execPath, [join(root, "scripts/demo-walkthrough.mjs")]);
  log("smoke", "ok");
}

async function restoreDrill() {
  loadEnvFile();
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("localhost") && !url.includes("127.0.0.1")) {
    console.error("restore-drill: refuse non-local DATABASE_URL");
    process.exit(1);
  }

  mkdirSync(deployDir, { recursive: true });
  try {
    await smoke();
  } catch {
    log("restore", "API not up — starting before dump");
    up();
    await waitForHealth();
    await smoke();
  }

  log("restore", `pg_dump (docker postgres stdout) → ${dumpFile}`);
  const dumpFd = openSync(dumpFile, "w");
  const dumpRun = spawnSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "pg_dump",
      "-U",
      "paymentgate",
      "-d",
      "paymentgate",
      "-Fc",
    ],
    { cwd: root, stdio: ["ignore", dumpFd, "inherit"] },
  );
  closeSync(dumpFd);
  if (dumpRun.status !== 0) {
    process.exit(dumpRun.status ?? 1);
  }

  stopProcesses();
  run("docker", [
    "compose",
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    "paymentgate",
    "-d",
    "postgres",
    "-c",
    "DROP DATABASE IF EXISTS paymentgate WITH (FORCE);",
  ]);
  run("docker", [
    "compose",
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    "paymentgate",
    "-d",
    "postgres",
    "-c",
    "CREATE DATABASE paymentgate;",
  ]);

  log("restore", "pg_restore (docker postgres stdin)");
  const restoreFd = openSync(dumpFile, "r");
  const restoreRun = spawnSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "pg_restore",
      "-U",
      "paymentgate",
      "-d",
      "paymentgate",
      "--no-owner",
      "--no-privileges",
    ],
    { cwd: root, stdio: [restoreFd, "inherit", "inherit"] },
  );
  closeSync(restoreFd);
  if (restoreRun.status !== 0 && restoreRun.status !== 1) {
    // pg_restore exits 1 on warnings (e.g. comments); fail only on hard errors.
    process.exit(restoreRun.status ?? 1);
  }
  run(process.execPath, [join(root, "apps/api/scripts/migrate.mjs")], {
    env: { MIGRATE_REPAIR_CHECKSUMS: "1" },
  });
  up();
  await waitForHealth();
  await smoke();
  log("restore", "drill complete");
}

function audit() {
  pnpm(["audit", "--audit-level=moderate"]);
  run(process.execPath, [join(root, "scripts/licenses-report.mjs")]);
  log("audit", "record in M4-T04 ticket");
}

async function main() {
  if (doDown) {
    stopProcesses();
    return;
  }

  if (doPrepare) prepare();
  if (doUp) {
    up();
    await waitForHealth();
  }
  if (doWeb) {
    startPaymentPage();
    await waitForPaymentPage();
    startWeb();
    await waitForWeb();
  }
  if (doSeed) {
    loadEnvFile();
    run(process.execPath, [join(root, "scripts/seed-local.mjs")]);
  }
  if (doSmoke) await smoke();
  if (doRestore) await restoreDrill();
  if (doAudit) audit();
  if (doLocal || (doWeb && !doSmoke)) printLocalUrls();

  if (!doPrepare && !doUp && !doSmoke && !doRestore && !doAudit && !doWeb && !doSeed) {
    console.error("Unknown flags");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
