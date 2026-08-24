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

## Planned (enums only — not enabled)

Do not watch, assign, or show checkout for these until Kevin adds an `enabled: true` registry row (contract, confirmations, `memoSupported`).

Network ids must match `NetworkId` / OpenAPI:

| Asset | Network id | Plan §VI name |
| --- | --- | --- |
| USDT | `ethereum` | Ethereum |
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
