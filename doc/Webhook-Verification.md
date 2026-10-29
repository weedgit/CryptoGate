# Webhook verification (short guide)

PaymentGate POSTs signed JSON to your endpoint. Verify the HMAC before acting; never fulfill on browser redirect alone.

## Headers

| Header | Meaning |
| --- | --- |
| `X-PaymentGate-Signature-V2` | Lowercase hex **HMAC-SHA256(signingSecret, `{timestamp}.{eventId}.{raw body}`)** — use this |
| `X-PaymentGate-Signature` | Legacy: HMAC over the raw body only (timestamp and event id are not covered) |
| `X-PaymentGate-Timestamp` | Unix seconds (signed by v2) |
| `X-PaymentGate-Event-Id` | Stable event id — use as idempotency key |
| `X-PaymentGate-Delivery-Id` | This delivery attempt (retries / resend get a new id) |

## Verify steps

1. Read the **raw** request body bytes (do not re-serialize JSON before HMAC).
2. Build `{X-PaymentGate-Timestamp}.{X-PaymentGate-Event-Id}.{rawBody}` and compute
   `HMAC-SHA256(signingSecret, that string)` as lowercase hex.
3. Compare to `X-PaymentGate-Signature-V2` with a constant-time equality check.
4. Reject when `|now - X-PaymentGate-Timestamp|` is over 5 minutes (the timestamp is signed,
   so a captured request cannot be replayed later with a fresh one).
5. If `X-PaymentGate-Event-Id` was already processed → return 2xx and do nothing.

Integrations built on the body-only `X-PaymentGate-Signature` keep working; move to v2 so the
timestamp and event id you rely on for replay protection are authenticated.

## Resend

`POST /v1/webhooks/{webhookId}/deliveries/{deliveryId}/resend` clones a **failed** or **success** delivery as a new **pending** row with the **same body** and event id. Replay uses a **new** `X-PaymentGate-Delivery-Id`. Handlers must stay idempotent on event id.

## Sample

See `doc/M3-03-Webhook-Verify-Example.md` and `doc/examples/webhook-verify.mjs`.
