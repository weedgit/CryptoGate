# M3-32 — USDT / Ethereum go-live

**Registry:** `USDT_ETHEREUM` in `@paymentgate/domain` is **`enabled: true`**. Create-order accepts the pair; completion still requires watcher `ETH_RPC_URL` + confirmations.

Do **not** treat “enabled” as “ops go-live.” Staging / funded-wallet smoke (§2 live rows) must pass before promising ETH to merchants. Until smoked, put `ethereum` in Platform → Networks maintenance if needed.

**Solo helper:** `node scripts/eth-smoke.mjs` (hermetic). With `ETH_RPC_URL` set, also probes `eth_blockNumber`.

---

## 1. Staging prerequisites

| # | Item | Owner |
| --- | --- | --- |
| 1 | `ETH_RPC_URL` set on watcher (HTTPS JSON-RPC; Infura/Alchemy/self-hosted) | Ops |
| 2 | Optional `ETH_API_KEY` if provider requires header auth | Ops |
| 3 | Watcher + API on **test** DB with migrate **052**+ | Solo / ops |
| 4 | Ethereum chain client + watcher tick on `main` | Done |

`.env.example` documents `ETH_RPC_URL` / `ETH_BLOCK_LOOKBACK`.

---

## 2. Smoke checklist

### Automated (CI / local — no RPC)

```bash
node scripts/eth-smoke.mjs
# or:
pnpm --filter @paymentgate/domain build
node --test packages/chain-clients/test/ethereum.test.mjs apps/watcher/test/ethereum-tick.test.mjs
```

| # | Check | Pass |
| --- | --- | --- |
| A1 | Hermetic ethereum chain-client + watcher tick tests | ☑ **2026-09-10** (`scripts/eth-smoke.mjs`) |
| A2 | Guest pay catalog includes **Ethereum ERC-20** + `0xdAC17…` | ☑ `apps/payment-page/public/mock-order.js` |
| A3 | Create **USDT/ethereum** accepted when registry enabled (create-order path) | ☑ registry `enabled: true` — confirm 201 against local API after deploy |

### Live (needs `ETH_RPC_URL` + funded test wallet)

| # | Check | Pass |
| --- | --- | --- |
| L1 | `ETH_RPC_URL` health — `eth_blockNumber` succeeds | ☐ `ETH_RPC_URL=… node scripts/eth-smoke.mjs` |
| L2 | Create **Tron** order still works (regression) | ☐ local/staging 201 |
| L3 | Create **USDT/ethereum** order returns **201** | ☐ |
| L4 | Order receives ERC-20 USDT on assigned address (test wallet) | ☐ |
| L5 | Watcher binds tx → `verifying` → `completed` at **12** confirmations | ☐ |
| L6 | Wrong-network / underpay → **payment_anomaly** (not Completed) | ☐ |

---

## 3. Enable status (done on main)

1. `packages/domain/src/index.ts` — `USDT_ETHEREUM.enabled: true` ☑  
2. [M3-04-Asset-Networks.md](M3-04-Asset-Networks.md) — keep Live section accurate  
3. [Phase1-Implementation-Plan.md](Phase1-Implementation-Plan.md) §6 — Wave 4 = registry enabled, live smoke open  
4. `node scripts/check.mjs` green  

Remaining gate for Wave 4 close: **§2 live rows L1–L6**.

---

## 4. Post-smoke

| Surface | Action |
| --- | --- |
| Payment page | Already includes `USDT:ethereum` |
| Merchant create order | Asset/network picker shows enabled pairs |
| Watcher | Ingest Tron + Ethereum when both RPCs set |
| M4-05 env matrix | Document prod `ETH_RPC_URL` |

---

## Related

- [M3-04-Asset-Networks.md](M3-04-Asset-Networks.md)  
- [M4-05-Env-Matrix.md](M4-05-Env-Matrix.md)  
- [X-07-E2E-Smoke.md](X-07-E2E-Smoke.md) — `--live` after deploy
