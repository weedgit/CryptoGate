#!/usr/bin/env node
/**
 * Wave D — staging-ready pack (solo, no Company A DNS required).
 *
 * Runs hermetic gates that must be green before a Company A deploy window.
 * Does not start Docker or require ETH_RPC_URL.
 *
 *   node scripts/staging-ready.mjs
 *   node scripts/staging-ready.mjs --skip-check   # eth-smoke + mail only
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const skipCheck = args.has("--skip-check");

function run(label, cmd, cmdArgs) {
  console.log(`\n[staging-ready] ${label}`);
  const r = spawnSync(cmd, cmdArgs, { cwd: root, stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`[staging-ready] FAILED: ${label}`);
    process.exit(r.status ?? 1);
  }
}

console.log("PaymentGate staging-ready pack — hermetic gates");
console.log(`Date: ${new Date().toISOString().slice(0, 10)}`);

if (!skipCheck) {
  run("CI gate (scripts/check.mjs)", process.execPath, [
    join(root, "scripts/check.mjs"),
  ]);
}

run("Ethereum hermetic smoke", process.execPath, [
  join(root, "scripts/eth-smoke.mjs"),
]);

run("SMTP / mail-config unit tests", process.execPath, [
  "--test",
  join(root, "apps/api/test/auth-mail.test.mjs"),
]);

console.log(`
[staging-ready] Hermetic pack: OK

Handoff (blocked on Company A — fill doc/M3-T09-Company-A-Handoff.md §3):
  [ ] Hostnames / TLS / managed Postgres
  [ ] Secrets injected (never commit .env)
  [ ] Migrate through 052
  [ ] API + watcher as two processes
  [ ] GET /health → db ok
  [ ] node scripts/e2e-smoke.mjs --live  (E2E_API_BASE=…)
  [ ] Optional: ETH_RPC_URL=… node scripts/eth-smoke.mjs
  [ ] Optional: MAIL_TRANSPORT=smtp for real invite/reset mail

Local full stack (when Docker available):
  node scripts/deploy-wave5.mjs --local
  node scripts/deploy-wave5.mjs --down

Docs: doc/M3-T09-Company-A-Handoff.md · doc/M4-01-Deploy-Runbook.md · doc/M3-32-Ethereum-Go-Live.md
`);
