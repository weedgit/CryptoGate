# M3-04 — Connected assets and networks

**Owner:** Kevin. **Enabled pairs:** `@cryptogate/domain` `ASSET_NETWORK_REGISTRY`.  
**Plan list:** [Phase1-Project-Plan.md](Phase1-Project-Plan.md) §VI.  
**API enums:** OpenAPI `AssetCode` / `NetworkId` include the same strings; **create-order is 422** only when the pair is missing / `enabled: false` or filtered out by `CRYPTOGATE_CHAIN_ENV`.

Watcher, API, and payment page must take confirmations, decimals, min amount, Mode C step, and Mode D visibility from the registry — not from local constants.

---

## What is an RPC? Do we buy private keys?

**RPC** = Remote Procedure Call endpoint for a blockchain node (or a hosted node API). CryptoGate uses it **read-only** to:

- List recent transfers to merchant receive addresses
- Count confirmations on a tx hash

| Need | Required? | Notes |
| --- | --- | --- |
| **RPC / provider URL** per live network | **Yes** for real ingest | e.g. TronGrid, Infura, Alchemy, public BSC/Polygon endpoints, Blockstream Esplora, TonAPI |
| **Provider API key** | Often yes (free tier OK) | Rate limits — TronGrid / Infura / Alchemy keys. Still **not** a wallet key |
| **Merchant settlement / payout private keys** | **Never** | Platform is watch-only; merchants (or their wallets) hold spend keys |
| **Platform billing / commission treasury keys** | Outside watcher | Ops send rebills/commissions from their own wallets; slip UI shows destination only |

Empty `*_RPC_URL` → chain client stays in **stub** mode (health OK, no live transfers). Set the URL (and optional API key) in `.env` for production. Open orders on a stub network will not complete; watcher ticks may emit `rpcGapWarning: rpc_not_configured_open_orders_will_not_complete`.

**Timeouts (ops friction):** every chain HTTP call uses `CHAIN_FETCH_TIMEOUT_MS` (default **15000**). Each watcher asset+network scope is also capped by `WATCHER_SCOPE_TIMEOUT_MS` (default **60000**) so one hanging RPC cannot stall the whole multi-network loop. Narrow work with `WATCHER_NETWORKS` / `WATCHER_ASSETS` when testing.

---

## Phase 1 access list (Plan §VI) — all enabled

All fifteen mainnet pairs below are **`enabled: true`** in `ASSET_NETWORK_REGISTRY`.  
Local/staging only: `USDT` + `tron_nile` when `CRYPTOGATE_CHAIN_ENV=testnet` (never on product mainnet builds).

| Asset | Network id | Guest label | Registry | Env URL |
| --- | --- | --- | --- | --- |
| USDT | `tron` | TRON TRC-20 | `USDT_TRON` | `TRON_RPC_URL` (+ optional `TRON_API_KEY`) |
| USDT | `tron_nile` | TRON Nile (testnet) | `USDT_TRON_NILE` | `TRON_NILE_RPC_URL` (or Nile companion when `TRON_RPC_URL` is mainnet) |
| USDT | `ethereum` | Ethereum ERC-20 | `USDT_ETHEREUM` | `ETH_RPC_URL` |
| USDT | `bnb_smart_chain` | BNB Smart Chain BEP-20 | `USDT_BNB_SMART_CHAIN` | `BSC_RPC_URL` |
| USDT | `polygon` | Polygon PoS | `USDT_POLYGON` | `POLYGON_RPC_URL` |
| USDT | `arbitrum_one` | Arbitrum One | `USDT_ARBITRUM_ONE` | `ARBITRUM_RPC_URL` |
| USDT | `solana` | Solana | `USDT_SOLANA` | `SOLANA_RPC_URL` |
| USDT | `ton` | TON | `USDT_TON` | `TON_RPC_URL` |
| USDC | `ethereum` | Ethereum ERC-20 | `USDC_ETHEREUM` | `ETH_RPC_URL` |
| USDC | `polygon` | Polygon PoS | `USDC_POLYGON` | `POLYGON_RPC_URL` |
| USDC | `arbitrum_one` | Arbitrum One | `USDC_ARBITRUM_ONE` | `ARBITRUM_RPC_URL` |
| USDC | `base` | Base | `USDC_BASE` | `BASE_RPC_URL` |
| USDC | `solana` | Solana | `USDC_SOLANA` | `SOLANA_RPC_URL` |
| BTC | `bitcoin` | Bitcoin | `BTC_BITCOIN` | `BITCOIN_RPC_URL` |
| ETH | `ethereum` | Ethereum | `ETH_ETHEREUM` | `ETH_RPC_URL` |
| TRX | `tron` | Tron (native) | `TRX_TRON` | `TRON_RPC_URL` |

Native `TRX` / `ETH` / `BTC` are **not** interchangeable with USDT/USDC on the same chain.

**Default create-order pair:** `DEFAULT_ASSET_NETWORK` = USDT · `tron`.

---

## Ops details (high signal)

| Pair | Decimals | Confirmations | Mode D (memo) |
| --- | --- | --- | --- |
| USDT Tron (mainnet) / TRX | 6 | 19 | Off |
| USDT Nile (testnet) | 6 | 19 (same as mainnet Tron) | Off |
| USDT Ethereum / Polygon / Arbitrum / Solana / TON | 6 | 12–64 | Off |
| USDT BSC | **18** | 15 | Off |
| USDC (all) | 6 | 12–64 | Off |
| BTC | 8 | 3 | Off |
| ETH | 18 | 12 | Off |
| TRX | 6 | 19 | Off |

Matching on these pairs: **B, C, S**. Mode D is rejected while `memoSupported: false`.

---

## Watcher (real multi-network)

One `apps/watcher` process:

1. Health-checks every chain client each tick.
2. With `DATABASE_URL` set and **`WATCHER_MULTI_NETWORK=true` (default)**: discovers distinct open `asset`+`network` scopes from `payment_orders`, then polls **each** scope (match + confirmations). Always includes `DEFAULT_ASSET`/`DEFAULT_NETWORK` as a fallback scope.
3. Empty RPC for a network → that scope returns stub/empty transfers (orders on that chain will not complete until RPC is configured).
4. Pin to a single pair: `WATCHER_MULTI_NETWORK=false` (legacy). Optional filters: `WATCHER_NETWORKS=tron,ethereum`, `WATCHER_ASSETS=USDT,USDC`.

Chain clients live under `packages/chain-clients/{network}/` — one module per network.

---

## Wrong-network

Guest copy must name the exact asset+network for the order. USDT on Ethereum against a Tron order is a **payment anomaly**, not Completed. Same for TRX vs USDT TRC-20, native ETH vs ERC-20.

---

## Go-live checklist (per network)

1. Registry row already enabled (all §VI pairs are).
2. Set `*_RPC_URL` (+ API key if the provider requires it) in the watcher/API host env.
3. Smoke: create a small order on that pair, send a test transfer, confirm watcher tick shows `chainPollMode` live (not `stub`) and order advances after required confirmations.
4. Monitor `watcher_heartbeats` / platform Network catalog for `rpcConfigured`.

---

## Platform Network catalog (B16) — trustworthy values

| UI field | Meaning |
| --- | --- |
| **Orderability lamp** | Single signal: **Open** (green) / **Paused** (amber) / **Down** (red) / **Off** (grey). Combines registry `enabled` + maintenance + watcher ingest. Answers “can this network take payments now?” |
| **Catalog status** (`2/2 enabled`) | How many asset pairs on that network are `enabled: true` in `ASSET_NETWORK_REGISTRY` |
| **Ingest** + bar % | Watcher heartbeat `healthScore` when present; otherwise bar mirrors catalog completeness (not a fake “91%”) |
| **Contract** | Token contract from the domain registry (USDT preferred as primary) |
| **Maintenance Mode** | Persisted in `network_maintenance`. Platform O/A. While active: create-order → `422 network_maintenance`; merchants see banner; lamp → **Paused** |

**Lamp rules**

| Lamp | When |
| --- | --- |
| Open | ≥1 enabled pair, not maintenance, ingest healthy (`live`) |
| Paused | Enabled, but maintenance **or** ingest `degraded` / `stub` |
| Down | Enabled, but ingest `down` / no heartbeat |
| Off | No enabled pairs (catalogued only) |

Same lamp appears on System health “Connected assets & networks”, merchant Blockchain networks, and `GET /v1/networks/status` (any authenticated portal).

**Implemented vs live ingest:** registry + chain client code can be done while RPC is empty. Without `*_RPC_URL`, watcher stays in **stub** — catalog may still show enabled pairs, lamp → **Paused** (stub).