# M2 mid-gate — Kevin smoke (create → guest pay)

**Date:** 2026-08-24  
**Depends on:** OpenAPI v0.2.2, Andrew PR #30 (`assignOnCreate` on `POST /v1/orders`), payment page PR #22/#25.

Guest pay still **polls** `GET /v1/orders/{id}/payment`. Without CORS, the browser falls back to the create `sessionStorage` snapshot (banner on the pay page). Matching fields on that snapshot come from the create response once assign is wired.

## Services

```bash
# API (Andrew) — session + settlement + matching mode + orders
pnpm --filter @cryptogate/api start   # :3000

# Guest pay (Kevin)
pnpm --filter @cryptogate/payment-page dev   # :5173
```

Log in on the **API origin** first so `POST /v1/orders` sends the session cookie. Configure settlement for USDT + tron (`PUT /v1/orgs/{orgId}/settlement`) and matching mode (`PUT /v1/orgs/{orgId}/matching-mode`).

Create UI: http://127.0.0.1:5173/create-order.html

## Offline demos (no API)

Use when the API is down. These do **not** count as M2-T01.

| Check | URL |
| --- | --- |
| Mode B pending | `/?state=pending` |
| Mode C exact payable | `/?mode=C&amount=245.01` |
| Mode D hidden (USDT Tron) | `/?mode=D&memo=CG-0847` — no memo banner |
| Mode D shown (override) | `/?mode=D&memo=CG-0847&memoSupported=1` |
| States | `/?state=verifying\|completed\|expired\|anomaly\|failed` |

## Live path (counts for mid-gate)

Prereq: merchant has a Tron USDT settlement address.

| ID | Mode | Expect |
| --- | --- | --- |
| Smoke-B | `PUT matching-mode` = `B`, then create 245.00 USDT tron | Pay page: network TRON TRC-20, receive address = settlement, amount 245.00, no exact-amount banner, no memo |
| Smoke-C | matching-mode `C`, create 245.00 | Pay page: **Exact payable** may differ (fingerprint), exact-amount warning visible, copy amount = payable |
| Smoke-D | matching-mode `D`, create on USDT tron | API **422** `matching_mode_unavailable` (memo not supported). Do not treat as pay-page bug |
| Smoke-S | matching-mode `S` without xPub | Create should still assign **main** settlement when no same-amount conflict (Andrew/Bruce). Conflict + no HD pool → 422 |
| Smoke-settle | No settlement address | Create **422** `settlement_address_required` |
| Smoke-CORS | Open `/pay/{id}` from another origin with empty sessionStorage | Live GET `/payment` **or** invalid-link. Banner “create snapshot / CORS” means CORS still missing |
| Smoke-QR | Any successful B/C pay page | QR renders; copy address / amount / share work |

## Formal M2 tests (after CORS)

From `doc/Milestone-Task-List.md`:

| ID | Status | Notes |
| --- | --- | --- |
| M2-T01 | wait CORS | Pay page network + address match order (live GET) |
| M2-T05 | wait CORS + Mode C order | Fingerprint amount + warning on pay page |
| M2-T06 | can run now (demo + 422) | Mode D hidden / create rejected on USDT Tron |

T02–T04, T07–T08 stay Andrew/Bruce.

## Andrew remaining (P0)

CORS: allow `PAYMENT_PAGE_BASE_URL` (see `.env.example` `CORS_ALLOWED_ORIGINS`) so `:5173` can call `:3000` `GET /v1/orders/{id}/payment` without a merchant session.
