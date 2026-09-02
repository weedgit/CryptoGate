# M3-32 — USDT / Ethereum go-live (Kevin)

**Owner:** Kevin flips registry + docs. **Ingest:** Bruce — PR #90 (`packages/chain-clients/ethereum/`).  
**Registry:** `USDT_ETHEREUM` in `@paymentgate/domain` (currently **`enabled: false`**).

Do **not** set `enabled: true` until staging smoke passes — create-order must stay **422** until ingest is ready.

---

## 1. Staging prerequisites

| # | Item | Owner |
| --- | --- | --- |
| 1 | `ETH_RPC_URL` set on watcher (HTTPS JSON-RPC; Infura/Alchemy/self-hosted) | Company A / ops |
| 2 | Optional `ETH_API_KEY` if provider requires header auth | Ops |
| 3 | Watcher + API on **test** DB with migrate **018**+ | Andrew |
| 4 | Bruce M3-32 merged and deployed to staging | Bruce |

`.env.example` documents `ETH_RPC_URL` / `ETH_BLOCK_LOOKBACK`.

---

## 2. Staging smoke (Bruce + Kevin)

### Automated (CI / local — no RPC)

```bash
pnpm --filter @paymentgate/domain build
pnpm --filter @paymentgate/watcher test
```

Includes `apps/watcher/test/ethereum-tick.test.mjs` — watcher tick with `DEFAULT_NETWORK=ethereum` and mock `ETH_RPC_URL`.

| # | Check | Pass |
| --- | --- | --- |
| 1 | Watcher tick logs ethereum health when `ETH_RPC_URL` set | ☐ staging RPC — **local stub tick 2026-08-27:** `DEFAULT_NETWORK=ethereum` → `chain.ethereum.mode=stub`, heartbeat persisted |
| 2 | Create **Tron** order still works (regression) | ☑ local 201 |
| 3 | Create **USDT/ethereum** order returns **201** only after enable — **422 before** | ☑ local 422 `asset_network_disabled` |
| 4 | After enable: order receives ERC-20 USDT on assigned address (test wallet) | ☐ |
| 5 | Watcher binds tx → `verifying` → `completed` at **12** confirmations | ☐ |
| 6 | Wrong-network / underpay → **payment_anomaly** (not Completed) | ☐ |
| 7 | Guest pay shows **Ethereum ERC-20** label + contract `0xdAC17…` | ☐ |

---

## 3. Kevin enable PR (single file + doc)

1. `packages/domain/src/index.ts` — `USDT_ETHEREUM.enabled: true`
2. `doc/M3-04-Asset-Networks.md` — move row to **Live** section; shrink **Next**
3. [Phase1-Implementation-Plan.md](Phase1-Implementation-Plan.md) §6 — wave 4 status
4. Run domain tests + `node scripts/check.mjs`

**Coordinate:** merge enable PR **after** Bruce confirms staging smoke §2. Announce in standup so Andrew/Bruce rebase before prod.

---

## 4. Post-enable

| Surface | Action |
| --- | --- |
| Payment page | `ASSET_NETWORK_UI` already includes `USDT:ethereum` |
| Merchant create order | Asset/network picker when UI adds multi-network |
| Watcher | Ingest both Tron + Ethereum open orders |
| M4-05 env matrix | Document prod `ETH_RPC_URL` |

---

## Related

- [M3-04-Asset-Networks.md](M3-04-Asset-Networks.md)  
- [M4-05-Env-Matrix.md](M4-05-Env-Matrix.md)  
- [X-07-E2E-Smoke.md](X-07-E2E-Smoke.md) — `--live` after deploy
