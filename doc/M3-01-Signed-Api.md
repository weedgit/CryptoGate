# M3-01 — Signed API, rate limits, webhooks, service bills

**Owner:** Kevin (contract). **Implementer:** Andrew (`apps/api`).  
**OpenAPI:** `0.3.0`. **Domain:** `@cryptogate/domain` signing / webhook / service-bill enums.  
**Unblocks:** M3-10, M3-11, M3-13, M3-14, M3-16.

Do not merge payment-order routes with service-bill routes. Do not fulfill merchant orders on browser redirect.

---

## 1. Who signs (M3-10)

| Client | Auth | HMAC |
| --- | --- | --- |
| Merchant / cashier portal, cashier APK | `cg_session` cookie | No |
| Machine integration | `X-Api-Key` | **Yes** — `X-Timestamp` + `X-Nonce` + `X-Signature` |
| Guest pay page | none | No (`GET /orders/{id}/payment` stays `security: []`) |
| `POST /auth/login` | none | No |

API keys are provisioned for M3 (DB/admin). Key CRUD / rotation UI is M4-11. Never log the HMAC secret or a signed payload with the secret.

### Canonical string (byte-stable)

```
{timestamp}\n{nonce}\n{METHOD}\n{pathAndQuery}\n{sha256Hex(rawBody)}
```

- `timestamp` — Unix seconds, ASCII digits (same value as `X-Timestamp`)
- `nonce` — 16–64 chars `[A-Za-z0-9_-]`; unique per API key inside `API_SIGNING_NONCE_TTL_SECONDS` (600)
- `METHOD` — uppercase (`GET`, `POST`, …)
- `pathAndQuery` — path + query as sent, starting with `/v1` (e.g. `/v1/orders?limit=10`); no host
- `rawBody` — exact request bytes; empty body → SHA-256 of empty string
- `X-Signature` — lowercase hex HMAC-SHA256(apiSecret, canonical)

Reject with **401** (do not leak which check failed beyond `code`):

| `code` | When |
| --- | --- |
| `signature_invalid` | Missing headers, bad hex, HMAC mismatch |
| `timestamp_skew` | `|now - timestamp| > API_SIGNING_MAX_SKEW_SECONDS` (300) |
| `nonce_replay` | Nonce already seen for that key inside TTL |

---

## 2. Rate limits (M3-11)

Use the integers in `RateLimitPerMinute`. Exceeded → **429**, `Error.code = rate_limited`, header `Retry-After` (seconds). Apply **both** key and IP limits when an API key is present (whichever hits first).

| Key | Limit / 60s |
| --- | --- |
| `apiKey` | 120 |
| `ip` | 300 (all routes) |
| `login` | 10 (`POST /auth/login` per IP) |
| `guestPayment` | 60 (`GET /orders/{id}/payment` per IP) |

---

## 3. Webhooks (M3-13 / M3-14)

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/v1/webhooks` | List; **never** `signingSecret` |
| `POST` | `/v1/webhooks` | Register; secret returned **once** |
| `DELETE` | `/v1/webhooks/{webhookId}` | Disable |
| `POST` | `/v1/webhooks/test` | Enqueue `webhook.test` |
| `GET` | `/v1/webhooks/{webhookId}/deliveries` | Last attempts (M3-14) |

HTTPS URLs only (except `http://127.0.0.1` / `http://localhost` in non-production). Cashier **403**. Agent cannot register a merchant callback. Max **5** endpoints per merchant org.

**Outbound headers** (merchant handler):

- `X-CryptoGate-Signature` — hex HMAC-SHA256(signingSecret, raw body)
- `X-CryptoGate-Timestamp` — Unix seconds
- `X-CryptoGate-Event-Id` — stable id; retries reuse it (handler must be idempotent)
- `X-CryptoGate-Delivery-Id` — this attempt

Success = HTTP **2xx** within `WEBHOOK_HTTP_TIMEOUT_MS` (10s). Retry delays: `WEBHOOK_RETRY_DELAYS_SECONDS` = 1, 5, 25, 125, 625. Same `eventId` on every retry. Do not fire webhooks for service bills in Phase 1.

Events: `payment_order.created` / `verifying` / `completed` / `expired` / `payment_anomaly` / `failed`, plus `webhook.test`.

---

## 4. Service bills (M3-16 stub)

Separate tag and path prefix `/service-bills`. USD strings, not `Money`/`AssetCode`. Cashier **403**. Platform Owner/Admin **POST** (issue). Merchant Owner/Admin **GET** own org. Agent **GET** subtree (read-only). `GET /service-bills/{id}/checkout` is **not** the guest payment page.

Statuses: `issued` \| `paid` \| `overdue` \| `voided`.
