# M3-04 — Connected assets and networks

**Owner:** Kevin. **Enabled pairs:** `@cryptogate/domain` `ASSET_NETWORK_REGISTRY`.  
**Plan list:** [Phase1-Project-Plan.md](Phase1-Project-Plan.md) §VI.  
**API enums:** OpenAPI `AssetCode` / `NetworkId` include later codes; **create-order is 422** until the pair is `enabled: true` in the registry.

Watcher, API, and payment page must take confirmations, decimals, min amount, Mode C step, and Mode D visibility from the registry — not from local constants.

---

## Live (Phase 1)

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

## Next (M3-32 — Bruce chain client; not checkout yet)

Source row: `USDT_ETHEREUM` in `ASSET_NETWORK_REGISTRY` with **`enabled: false`**.

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

**Go-live:** Kevin sets `enabled: true` on `USDT_ETHEREUM` only after ingest + watcher smoke on staging (coordinate so create-order does not open before ingest).

**Alternate queue:** USDT / `bnb_smart_chain` (BEP-20) is next after Ethereum unless client reprioritizes.

---

## Planned (enums only — not in registry)

Do not watch, assign, or show checkout for these until Kevin adds a registry row and sets `enabled: true` (contract, confirmations, `memoSupported`).

Network ids must match `NetworkId` / OpenAPI:

| Asset | Network id | Plan §VI name |
| --- | --- | --- |
| USDT | `bnb_smart_chain` | BNB Smart Chain |
| USDT | `polygon` | Polygon PoS |
| USDT | `arbitrum_one` | Arbitrum One |
| USDT | `solana` | Solana |
| USDT | `ton` | TON |
| USDC | `ethereum` | Ethereum |
| USDC | `polygon` | Polygon PoS |
| USDC | `arbitrum_one` | Arbitrum One |
| USDC | `base` | Base |
| USDC | `solana` | Solana |
| BTC | `bitcoin` | Bitcoin |
| ETH | `ethereum` | Ethereum |
| TRX | `tron` | Tron (native) |

Native `TRX` on `tron` is not USDT TRC-20 — do not treat them as interchangeable. `base` is in the enum for USDC-on-Base (§VI); it is not a live USDT network.

---

## Wrong-network

Guest copy and cashier QR must name **USDT on TRON TRC-20**. USDT sent on Ethereum/BSC/etc. against a Tron order is a payment anomaly, not Completed.

---

## Enabling a later pair

1. Add an `AssetNetworkConfig` with `enabled: true` to `ASSET_NETWORK_REGISTRY`.
2. Bruce: `packages/chain-clients/{network}/` ingest; confirmation count from that row.
3. Andrew: no OpenAPI bump if `AssetCode` / `NetworkId` already include the strings; still 422 until the registry enables the pair.
4. Kevin: mark the row **live** in this file.
