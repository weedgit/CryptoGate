# CryptoGate

Phase 1 merchant collection: hotels, travel, transport, and retail take crypto (starting with USDT) without giving CryptoGate their keys.

The payer sends from their own wallet to the **merchant’s** address. CryptoGate creates the **payment order**, shows QR and payment link, watches the chain, and marks the order paid. It does not hold coins, does not convert to fiat, and does not take a cut of the on-chain payment. Platform revenue is a separate **service bill** (subscription + volume fee).

This is B2B software. The guest or shopper is not a Phase 1 account.

Later phases (wallet, licensed fiat, token) are out of scope here.

## Status

Folder scaffold only. Language and framework are not frozen. Product and architecture notes live in `doc/` locally and are not on GitHub.

## Repository layout

```
apps/api              HTTP: auth, orgs, payment orders, webhooks, service bills
apps/watcher          Chain ingest and matching (separate process)
apps/web              Platform / agent / merchant shells (reserved)
apps/payment-page     Public pay URL (reserved)
apps/cashier-apk      Cashier Android POS client (reserved)
packages/api-spec     OpenAPI contract
packages/domain       Shared types
packages/matching     Modes B / C / D / S
packages/chain-clients
```

API and watcher stay separate processes in this repo. Do not merge them.

## Invariants

- Receive address is merchant-controlled. The platform has no spend keys.
- Volume fee is billed on the service rail, never skimmed from the payer payment.
- Cashiers cannot change settlement address, xPub, matching mode, or fees.
- Agent accounts do not create merchant payment orders.
- Signed webhooks only; do not fulfill on browser redirect.

## Local docs

Product, business, and planning files live in `doc/` on a local checkout. That folder is gitignored and is not on GitHub.
