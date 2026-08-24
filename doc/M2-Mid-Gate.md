# M2 mid-gate — Kevin smoke (create → guest pay)

**Date:** 2026-08-24 (updated)  
**Depends on:** OpenAPI v0.2.2, Andrew PR #30 (`assignOnCreate`), PR #33 (CORS + order expiry), payment page PR #22/#25.

Guest pay polls `GET /v1/orders/{id}/payment` (public). With CORS configured, the live payload wins over the create `sessionStorage` snapshot.

## Services

```bash
# API (Andrew) — include CORS_ALLOWED_ORIGINS from .env.example
pnpm --filter @cryptogate/api start   # :3000

# Guest pay (Kevin) — open the same host you listed in CORS (localhost vs 127.0.0.1)
pnpm --filter @cryptogate/payment-page dev   # :5173
```

Log in on the **API origin** first so `POST /v1/orders` can send the session cookie (create still needs credentials). Configure settlement for USDT + tron and matching mode.

Create UI: http://localhost:5173/create-order.html (or `http://127.0.0.1:5173/...` if that origin is in `CORS_ALLOWED_ORIGINS`).

## Offline demos (no API)

These do **not** count as M2-T01.

| Check | URL |
| --- | --- |
| Mode B pending | `/?state=pending` |
| Mode C exact payable | `/?mode=C&amount=245.01` |
| Mode D hidden (USDT Tron) | `/?mode=D&memo=CG-0847` — no memo banner |
| Mode D shown (override) | `/?mode=D&memo=CG-0847&memoSupported=1` |
| States | `/?state=verifying\|completed\|expired\|anomaly\|failed` |

## Live path (counts for mid-gate)

Prereq: merchant has a Tron USDT settlement address. Prefer opening the pay page with **empty** sessionStorage (incognito or different browser) to prove live GET.

| ID | Mode | Expect |
| --- | --- | --- |
| Smoke-B | matching-mode `B`, create 245.00 USDT tron | Network TRON TRC-20, address = settlement, amount 245.00, no exact banner, no memo; **no** CORS fallback banner |
| Smoke-C | matching-mode `C`, create 245.00 | Exact payable (+ warning); fingerprint may bump amount |
| Smoke-D | matching-mode `D` on USDT tron | Create **422** `matching_mode_unavailable` |
| Smoke-S | matching-mode `S` without xPub | Main settlement when no conflict; conflict without HD → 422 |
| Smoke-settle | No settlement address | Create **422** `settlement_address_required` |
| Smoke-expire | Pending past `expires_at` | Expiry job → `expired`; pay page shows Expired (poll or refresh) |
| Smoke-QR | Any successful B/C pay page | QR + copy address/amount + share |

## Formal M2 tests (Kevin)

| ID | Status | Notes |
| --- | --- | --- |
| M2-T01 | ready to run | Live GET `/payment` shows network + address |
| M2-T05 | ready to run | Mode C fingerprint + warning |
| M2-T06 | ready | Mode D hidden / create rejected on USDT Tron |

T02–T04, T07–T08 stay Andrew/Bruce.

## Andrew remaining (not P0 for pay page)

| Priority | Ask |
| --- | --- |
| P1 | Settlement PUT: MFA + cool-down (M2-16) |
| P1 | xPub registration API (M2-20) — Kevin adds OpenAPI after |
