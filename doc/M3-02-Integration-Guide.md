# M3-02 — Merchant integration guide

**Owner:** Kevin. **Implements against:** OpenAPI `0.3.0`, `doc/M3-01-Signed-Api.md`, live `apps/api` (signing #53, webhooks #55/#57).  
**Sample handler:** [M3-03-Webhook-Verify-Example.md](M3-03-Webhook-Verify-Example.md) + `doc/examples/webhook-verify.mjs`.

Do not fulfill payment orders from browser redirect or payment-page status alone. Use signed webhooks (or re-GET the order with a signed API call).

---

## 1. Environments

| | Local / test | Production |
| --- | --- | --- |
| Base URL | `http://localhost:3000/v1` (or `API_PUBLIC_BASE_URL`) | HTTPS merchant API host |
| Session cookie | `cg_session` for portals / cashier APK | Same |
| Machine auth | `X-Api-Key` + HMAC headers | Same |
| Webhook URL | HTTPS, or `http://127.0.0.1` / `http://localhost` when `NODE_ENV !== production` | **HTTPS only** |
| Assets | Only **USDT / `tron`** enabled — [M3-04-Asset-Networks.md](M3-04-Asset-Networks.md) | Same until Kevin enables another registry row |

Provision API keys via `POST /v1/api-keys` (OpenAPI **v0.3.1** — [M4-11-Api-Keys.md](M4-11-Api-Keys.md)). Secret once on create/rotate; never on GET. Never log API secrets or webhook signing secrets.

---

## 2. Authentication

### Session (browser / cashier APK)

1. `POST /v1/auth/login` with email + password → session cookie.  
2. Subsequent portal calls send `Cookie: cg_session=…`.  
3. **No** HMAC headers.

### Machine client (server-to-server)

Every request that uses `X-Api-Key` must also send:

| Header | Rule |
| --- | --- |
| `X-Api-Key` | Public key id |
| `X-Timestamp` | Unix seconds (10–12 digits) |
| `X-Nonce` | 16–64 chars `[A-Za-z0-9_-]`, unique per key for 600s |
| `X-Signature` | Lowercase hex HMAC-SHA256 |

**Canonical string** (five lines, LF-separated — matches `apps/api/src/signing/signing-rules.mjs`):

```
{timestamp}\n{nonce}\n{METHOD}\n{pathAndQuery}\n{sha256Hex(rawBody)}
```

- `METHOD` — uppercase  
- `pathAndQuery` — `req.url` as Node sees it (e.g. `/v1/orders?limit=10`), no host  
- Empty body → SHA-256 of empty bytes (`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`)  
- Signature = hex HMAC-SHA256(apiSecret, canonical UTF-8)

**401 `code` values** (message stays generic): `signature_invalid`, `timestamp_skew` (±300s default), `nonce_replay`.

Guest `GET /v1/orders/{id}/payment` stays public (`security: []`) — do not send API keys there.

---

## 3. Replay prevention

| Surface | Mechanism |
| --- | --- |
| API key requests | Nonce consumed per key for `API_SIGNING_NONCE_TTL_SECONDS` (600). Reuse → `nonce_replay`. |
| Timestamps | Skew window `API_SIGNING_MAX_SKEW_SECONDS` (300). |
| Order create | Header `Idempotency-Key` (8–128 chars). Same key + same body → original 201. Same key + different body → **409**. |
| Webhooks | Treat `X-CryptoGate-Event-Id` as idempotency key. Retries reuse the same event id with a new `X-CryptoGate-Delivery-Id`. |

---

## 4. Rate limits

Defaults from `@cryptogate/domain` `RateLimitPerMinute` (overridable via `.env.example`):

| Scope | Per 60s |
| --- | --- |
| API key | 120 |
| Source IP | 300 |
| Login | 10 |
| Guest payment GET | 60 |

Exceeded → **429**, `Error.code = rate_limited`, `Retry-After` (seconds).

---

## 5. Payment orders (machine)

Typical flow:

1. `POST /v1/orders` with `Idempotency-Key` + signed headers + JSON body (`amount`, `asset`, `network`, `validitySeconds`). Do **not** send `matchingMode` / receive address / fees.  
2. Show guest `paymentPageUrl` / QR from `GET /v1/orders/{id}/payment` (unsigned, public).  
3. Poll `GET /v1/orders/{id}` (signed or session) **or** wait for webhooks.  
4. Optional: `GET /v1/orders/{id}/on-chain` for watcher facts (`txHash` null until matched).

Matching modes **B / C / S** on USDT Tron. Mode **D** is rejected (`memoSupported: false`). Wrong network / underpay / overpay → `payment_anomaly`, never silent Completed.

---

## 6. Webhooks

### Register

- `POST /v1/webhooks` → `{ url, events? }`  
- `signingSecret` returned **once** on 201. Store hashed at rest on your side if you must persist it; CryptoGate never returns it on GET.  
- Max 5 endpoints per merchant org. Cashier **403**. HTTPS (localhost HTTP only outside production).  
- Default `events`: all `payment_order.*` (not `webhook.test`).

### Delivery

Worker POSTs JSON (`body_raw` — exact bytes signed). Shape matches OpenAPI `WebhookEvent`:

```json
{
  "id": "<event-uuid>",
  "type": "webhook.test",
  "createdAt": "<iso>",
  "data": { "orgId": "<merchant-org-id>" }
}
```

`POST /v1/webhooks/test` enqueues that payload today. Payment-order status events use the same envelope with `type` like `payment_order.completed` and `data` carrying `orderId` / `orderNumber` / `status` when the API fans them out (OpenAPI `WebhookEvent`).

Outbound headers:

| Header | Meaning |
| --- | --- |
| `Content-Type` | `application/json` |
| `X-CryptoGate-Signature` | hex HMAC-SHA256(**signingSecret**, **raw body only**) |
| `X-CryptoGate-Timestamp` | Unix seconds (not part of the HMAC input) |
| `X-CryptoGate-Event-Id` | Stable event id (dedupe / ignore replay) |
| `X-CryptoGate-Delivery-Id` | This attempt |

Success = HTTP **2xx** within 10s (`WEBHOOK_HTTP_TIMEOUT_MS`). Retries after 1, 5, 25, 125, 625 seconds then fail. Same `eventId` on every retry. Enable the delivery job via `WEBHOOK_DELIVERY_INTERVAL_MS` / `WEBHOOK_DELIVERY_ENABLED` in `.env.example`.

**Verify + ignore replay:** see M3-03.

---

## 7. Service bills

Separate rail: `/v1/service-bills`. USD amounts, not crypto `Money`. Cashier **403**. Platform issues; merchants pay via `GET /service-bills/{id}/checkout` — **not** `apps/payment-page` / `GET /orders/{id}/payment`.

---

## 8. Matching modes (merchant setting)

Locked onto each order at create. Changing the merchant default does not rewrite open orders. Cashiers cannot change matching mode, settlement, xPub, or fees.

| Mode | Behavior (USDT Tron) |
| --- | --- |
| B | Fixed main address; same-amount collision → anomaly (no FIFO) |
| C | Amount fingerprint; guest must send exact payable |
| D | Unavailable on USDT Tron |
| S | Main unless same-amount conflict → HD pool |

---

## 9. Acceptance hooks

| ID | What merchants / Kevin check |
| --- | --- |
| M3-T07 | Unsigned/replayed API calls rejected |
| M3-T08 | Sample handler verifies HMAC; duplicate `Event-Id` ignored |

Gate doc: [M3-Acceptance.md](M3-Acceptance.md) (CI evidence for T02–T08).
