#!/usr/bin/env node
/**
 * Wave 4 / M3-32 — Ethereum smoke helper (solo).
 *
 *   node scripts/eth-smoke.mjs           # hermetic tests only
 *   ETH_RPC_URL=https://… node scripts/eth-smoke.mjs   # + live health
 *
 * Live create-order / pay / confirm still need API+watcher+DB
 * (node scripts/deploy-wave5.mjs --local) and a funded test wallet.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: false });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log("eth-smoke: hermetic chain-client + watcher ethereum-tick…");
run(process.execPath, [
  "--test",
  "packages/chain-clients/test/ethereum.test.mjs",
  "apps/watcher/test/ethereum-tick.test.mjs",
]);
console.log("eth-smoke: hermetic ok");

const rpc = process.env.ETH_RPC_URL?.trim() || "";
if (!rpc) {
  console.log(`
eth-smoke: ETH_RPC_URL not set — skipping live health.

Next (ops / local):
  1. Copy .env.example → .env and set ETH_RPC_URL (Infura/Alchemy/self-hosted)
  2. node scripts/deploy-wave5.mjs --local
  3. Create USDT/ethereum order in merchant portal (expect 201)
  4. Send ERC-20 USDT to the assigned address; wait 12 confirmations
  5. Confirm guest pay shows "Ethereum ERC-20" + contract 0xdAC17…

See doc/M3-32-Ethereum-Go-Live.md §2.
`);
  process.exit(0);
}

console.log(`eth-smoke: probing ETH_RPC_URL (${rpc.replace(/\/\/.*@/, "//***@")})…`);
const ethMod = await import(
  pathToFileURL(join(root, "packages/chain-clients/ethereum/index.mjs")).href
);
const rpcMod = await import(
  pathToFileURL(join(root, "packages/chain-clients/ethereum/rpc.mjs")).href
);
const health = await ethMod.healthCheck();
console.log("eth-smoke: health", health);
if (!health?.ok) {
  console.error("eth-smoke: healthCheck failed — fix ETH_RPC_URL / provider");
  process.exit(1);
}
if (health.mode === "stub" || !health.rpcConfigured) {
  console.error("eth-smoke: still stub mode — RPC URL not picked up");
  process.exit(1);
}
const hex = await rpcMod.jsonRpcCall(rpc, "eth_blockNumber", [], {
  apiKey: process.env.ETH_API_KEY?.trim() || undefined,
});
const block = Number.parseInt(String(hex), 16);
if (!Number.isFinite(block) || block <= 0) {
  console.error("eth-smoke: eth_blockNumber unexpected:", hex);
  process.exit(1);
}
console.log(`eth-smoke: live eth_blockNumber ok (block ${block})`);
console.log("eth-smoke: live RPC health ok — proceed with deploy + create-order smoke");
