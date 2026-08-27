# M3-04 — Connected assets and networks

**Owner:** Kevin. **Enabled pairs:** `@cryptogate/domain` `ASSET_NETWORK_REGISTRY`.  
**Plan list:** [Phase1-Project-Plan.md](Phase1-Project-Plan.md) §VI.  
**API enums:** OpenAPI `AssetCode` / `NetworkId` include later codes; **create-order is 422** until the pair is `enabled: true` in the registry.

Watcher, API, and payment page must take confirmations, decimals, min amount, Mode C step, and Mode D visibility from the registry — not from local constants.

---

## Phase 1 access list (Plan §VI)

All fifteen pairs below are **in** `ASSET_NETWORK_REGISTRY`. Checkout and watcher ingest only for `enabled: true`.

| Asset | Network id | Guest label | Registry | Status |
| --- | --- | --- | --- | --- |
| USDT | `tron` | TRON TRC-20 | `USDT_TRON` | **Live** |
| USDT | `ethereum` | Ethereum ERC-20 | `USDT_ETHEREUM` | Catalogued — M3-32 go-live |
| USDT | `bnb_smart_chain` | BNB Smart Chain BEP-20 | `USDT_BNB_SMART_CHAIN` | Catalogued — X-06 client ready |
| USDT | `polygon` | Polygon PoS | `USDT_POLYGON` | Catalogued |
| USDT | `arbitrum_one` | Arbitrum One | `USDT_ARBITRUM_ONE` | Catalogued |
| USDT | `solana` | Solana | `USDT_SOLANA` | Catalogued |
| USDT | `ton` | TON | `USDT_TON` | Catalogued |
| USDC | `ethereum` | Ethereum ERC-20 | `USDC_ETHEREUM` | Catalogued |
| USDC | `polygon` | Polygon PoS | `USDC_POLYGON` | Catalogued |
| USDC | `arbitrum_one` | Arbitrum One | `USDC_ARBITRUM_ONE` | Catalogued |
| USDC | `base` | Base | `USDC_BASE` | Catalogued |
| USDC | `solana` | Solana | `USDC_SOLANA` | Catalogued |
| BTC | `bitcoin` | Bitcoin | `BTC_BITCOIN` | Catalogued |
| ETH | `ethereum` | Ethereum | `ETH_ETHEREUM` | Catalogued |
| TRX | `tron` | Tron (native) | `TRX_TRON` | Catalogued |

Native `TRX` on `tron` is **not** USDT TRC-20 — do not treat them as interchangeable.

---

## Live (enabled)

Source row: `USDT_TRON`. Default create-order pair: `DEFAULT_ASSET_NETWORK`.

| Field | Value |
| --- | --- |
| Asset | `USDT` |
| Network id | `tron` |
| Guest label | TRON TRC-20 |
| Contract | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` |
| Decimals | 6 |
| Min amount | `0.01` |
| Mode C step | `0.01` |
| Confirmations | 19 |
| Mode D | **off** (`memoSupported: false`) |

- Matching on this pair: **B, C, S**. Hide Mode D in merchant UI; reject Mode D assign (plan §2.4).
- Ingest: TronGrid when `TRON_RPC_URL` is set (`.env.example`). Empty URL → watcher stub only. Optional `TRON_API_KEY`.
- `.env.example` defaults: `DEFAULT_ASSET=USDT`, `DEFAULT_NETWORK=tron`.

---

## Next go-live (M3-32 — Bruce chain client)

Source row: `USDT_ETHEREUM` with **`enabled: false`**.

| Field | Value |
| --- | --- |
| Asset | `USDT` |
| Network id | `ethereum` |
| Guest label | Ethereum ERC-20 |
| Contract | `0xdAC17F958D2ee523a2206206994597C13D831ec7` |
| Decimals | 6 |
| Min amount | `0.01` |
| Mode C step | `0.01` |
| Confirmations | 12 |
| Mode D | **off** (`memoSupported: false`) |

**Why Ethereum before BSC:** Phase1-Project-Plan §VI lists USDT / Ethereum first after Tron.

**Bruce (M3-32):** implement `packages/chain-clients/ethereum/` ingest against this row; use `USDT_ETHEREUM.requiredConfirmations` — do not hardcode. Matching modes **B, C, S** only (same as Tron).

**Go-live:** Kevin sets `enabled: true` on `USDT_ETHEREUM` only after ingest + watcher smoke on staging — see [M3-32-Ethereum-Go-Live.md](M3-32-Ethereum-Go-Live.md).

**Then queue:** remaining §VI rows in registry order (BSC USDT → … → native TRX), each with its own `packages/chain-clients/{network}/` module before enable.

### X-06 — BNB Smart Chain USDT (scaffolded 2026-08-27)

Source row: `USDT_BNB_SMART_CHAIN` with **`enabled: false`**.

| Field | Value |
| --- | --- |
| Asset | `USDT` |
| Network id | `bnb_smart_chain` |
| Guest label | BNB Smart Chain BEP-20 |
| Contract | `0x55d398326f99059fF775485246999027B3197955` |
| Decimals | **18** (not 6) |
| Confirmations | 15 |
| Mode D | **off** |

**Bruce:** `packages/chain-clients/bnb_smart_chain/` + watcher route when `DEFAULT_NETWORK=bnb_smart_chain`. Env: `BSC_RPC_URL` (empty → stub).

**Go-live:** after Ethereum enable; Kevin sets `enabled: true` only after staging smoke — do not skip Ethereum.

---

## Wrong-network

Guest copy and cashier QR must name **USDT on TRON TRC-20** for Tron orders. USDT sent on Ethereum/BSC/etc. against a Tron order is a payment anomaly, not Completed.

---

## Enabling a later pair

1. Confirm contract / decimals / confirmations on the existing `AssetNetworkConfig` row (or add one if missing).
2. Bruce: `packages/chain-clients/{network}/` ingest; confirmation count from that row.
3. Andrew: no OpenAPI bump if `AssetCode` / `NetworkId` already include the strings; still 422 until the registry enables the pair.
4. Kevin: set `enabled: true` and mark the row **Live** in this file.
