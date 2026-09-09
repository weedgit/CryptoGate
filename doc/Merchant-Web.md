# Merchant web (apps/web/src/merchant)

**Owner:** Bruce  
**Milestone:** M2-60 create order (first slice)

## Run

```bash
npx pnpm@9.15.0 --filter @cryptogate/web install
npx pnpm@9.15.0 --filter @cryptogate/web dev
```

Dev server: `http://127.0.0.1:5174` (proxies `/v1` → API `:3000`).

## Routes (this PR / M2-60+)

| Route | Status |
| --- | --- |
| `/merchant/orders/new` | **M2-60** create order |
| `/merchant/orders/:id` | Minimal post-create detail |
| `/merchant/settings/settlement` | **M2-61/62/63** matching + address book + xPub/HD |
| `/merchant` | Dashboard placeholder |
| other `/merchant/*` | Shell placeholders |

Settlement: Owner/Admin only. Cashier gets a clear 403 message. Matching save confirms “new orders only”. Address/xPub changes require MFA. GET xPub is presence-only.

## Product rules applied

- Institutional Ink dark theme (`doc/UI-Style-Lock.md`)
- Matching mode **read-only** on create (merchant default); labels Standard / Amount fingerprint / Memo tag / Smart address
- No pink Figma animation sticky in product UI
- No “Mark paid”
- Create uses `POST /v1/orders` + `Idempotency-Key`; never sends matchingMode / receiveAddress

Figma map: `doc/UI-Handoff.md` (d4 `29:2023`).
