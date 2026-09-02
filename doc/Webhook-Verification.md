# Webhook verification (short guide)

PaymentGate POSTs signed JSON to your endpoint. Verify the HMAC before acting; never fulfill on browser redirect alone.

## Headers

| Header | Meaning |
| --- | --- |
| `X-PaymentGate-Signature` | Lowercase hex **HMAC-SHA256(signingSecret, raw body)** |
| `X-PaymentGate-Timestamp` | Unix seconds (not part of the HMAC input) |
| `X-PaymentGate-Event-Id` | Stable event id — use as idempotency key |
| `X-PaymentGate-Delivery-Id` | This delivery attempt (retries / resend get a new id) |

## Verify steps

1. Read the **raw** request body bytes (do not re-serialize JSON before HMAC).
2. Compute `HMAC-SHA256(signingSecret, rawBody)` as lowercase hex.
3. Compare to `X-PaymentGate-Signature` with a constant-time equality check.
4. If `X-PaymentGate-Event-Id` was already processed → return 2xx and do nothing.
5. Optional: reject large `|now - X-PaymentGate-Timestamp|` skew.

## Resend

`POST /v1/webhooks/{webhookId}/deliveries/{deliveryId}/resend` clones a **failed** or **success** delivery as a new **pending** row with the **same body** and event id. Replay uses a **new** `X-PaymentGate-Delivery-Id`. Handlers must stay idempotent on event id.

## Sample

See `doc/M3-03-Webhook-Verify-Example.md` and `doc/examples/webhook-verify.mjs`.
