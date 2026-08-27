#!/usr/bin/env node
/**
 * X-07 — E2E integration smoke orchestrator.
 *
 *   node scripts/e2e-smoke.mjs              # tier A (offline samples)
 *   node scripts/e2e-smoke.mjs --check      # A + scripts/check.mjs
 *   E2E_API_BASE=https://api-test.example node scripts/e2e-smoke.mjs --live
 *
 * Optional machine tier (signed order + webhook listener):
 *   E2E_API_KEY_ID / E2E_API_SECRET — mint locally via scripts/e2e-mint-api-key.mjs
 *
 * See doc/X-07-E2E-Smoke.md
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runLiveMachineTier } from "./e2e-live-machine.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const withCheck = args.has("--check") || args.has("--ci");
const withLive = args.has("--live");

function runNode(relPath, nodeArgs = []) {
  const r = spawnSync(process.execPath, [join(root, relPath), ...nodeArgs], {
    cwd: root,
    stdio: "inherit",
  });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

function normalizeApiBase(raw) {
  return raw.replace(/\/+$/, "").replace(/\/v1$/i, "");
}

async function liveSmoke() {
  const base = normalizeApiBase(process.env.E2E_API_BASE ?? "");
  if (!base) {
    console.error("E2E_API_BASE required for --live (origin without /v1)");
    process.exit(1);
  }

  const healthUrl = `${base}/health`;
  const res = await fetch(healthUrl, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    console.error(`live health failed: ${res.status} ${healthUrl}`);
    process.exit(1);
  }
  const body = await res.json();
  if (body.status !== "ok" || body.db !== "ok") {
    console.error("live health unexpected payload:", body);
    process.exit(1);
  }
  console.log(`e2e live: health ok (${healthUrl})`);

  const genRes = await fetch(`${base}/v1/service-bills/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(15_000),
  });
  if (genRes.status !== 401) {
    console.error(
      `live generate expected 401 unauthenticated, got ${genRes.status}`,
    );
    process.exit(1);
  }
  console.log("e2e live: generate service bills 401 without session");

  const ovRes = await fetch(`${base}/v1/orgs/00000000-0000-0000-0000-000000000001/setting-overrides`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      settingKind: "matching_mode",
      payload: { matchingMode: "C" },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (ovRes.status !== 401) {
    console.error(
      `live setting-overrides expected 401 unauthenticated, got ${ovRes.status}`,
    );
    process.exit(1);
  }
  console.log("e2e live: site setting-overrides 401 without session");

  const unsignedOrder = await fetch(`${base}/v1/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "e2e-unsigned-probe-key-01",
    },
    body: JSON.stringify({
      amount: "1.00",
      asset: "USDT",
      network: "tron",
      validitySeconds: 600,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (unsignedOrder.status !== 401) {
    console.error(
      `live unsigned POST /orders expected 401, got ${unsignedOrder.status}`,
    );
    process.exit(1);
  }
  console.log("e2e live: unsigned POST /orders 401 without session/key");

  const orderId = (process.env.E2E_PAYMENT_ORDER_ID ?? "").trim();
  if (orderId) {
    const payUrl = `${base}/v1/orders/${encodeURIComponent(orderId)}/payment`;
    const payRes = await fetch(payUrl, { signal: AbortSignal.timeout(15_000) });
    if (!payRes.ok) {
      console.error(`live payment GET failed: ${payRes.status} ${payUrl}`);
      process.exit(1);
    }
    const pay = await payRes.json();
    if (!pay.receiveAddress || !pay.payableAmount) {
      console.error("live payment missing receiveAddress/payableAmount");
      process.exit(1);
    }
    console.log(`e2e live: guest payment ok (order ${orderId})`);
  }

  await runLiveMachineTier(base);
}

console.log("e2e tier A: signing + webhook samples");
runNode("doc/examples/api-signing-smoke.mjs");
runNode("doc/examples/webhook-verify.mjs");

if (withCheck && process.env.E2E_SKIP_CHECK !== "1") {
  console.log("e2e tier B: contract gate (check.mjs)");
  runNode("scripts/check.mjs");
}

if (withLive) {
  console.log("e2e tier C: live API");
  await liveSmoke();
}

console.log("e2e-smoke: ok");
