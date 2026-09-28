# Chain clients (Bruce)

Package path: `packages/chain-clients`

One module per network. Do not put Tron/ETH/Solana switches in a single watcher file — `apps/watcher` only selects the package by `network` id.

Phase 1 rails are **Ethereum, Tron and Solana** only. No other network client exists.

| Module | Network id | Status |
| --- | --- | --- |
| `tron/` | `tron` / `tron_nile` | Live ingest — `TRON_RPC_URL` (mainnet) + `TRON_NILE_RPC_URL` (Nile) |
| `ethereum/` | `ethereum` | Live ingest — `ETH_RPC_URL` (USDT / USDC ERC-20 + native ETH) |
| `solana/` | `solana` | Live ingest — `SOLANA_RPC_URL` (USDT / USDC SPL) |
