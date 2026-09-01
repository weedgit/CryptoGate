# Chain clients (Bruce)

Package path: `packages/chain-clients`

One module per network. Do not put Tron/ETH/BTC switches in a single watcher file — `apps/watcher` only selects the package by `network` id.

| Module | Network id | Status |
| --- | --- | --- |
| `tron/` | `tron` / `tron_nile` | Live ingest — `TRON_RPC_URL` (mainnet) + `TRON_NILE_RPC_URL` (Nile) |
| `ethereum/` | `ethereum` | Client ready — enable after M3-32 staging smoke (`ETH_RPC_URL`) |
| `bnb_smart_chain/` | `bnb_smart_chain` | Client ready (X-06) — stub until `BSC_RPC_URL`; create-order 422 until registry `enabled: true` |

Shared EVM log polling lives in `ethereum/rpc.mjs` and accepts a parameterized `runtimeConfig` so BSC reuses Transfer-topic decode without a mega network switch. BSC USDT uses **18 decimals** and **15** confirmations from `USDT_BNB_SMART_CHAIN`.
