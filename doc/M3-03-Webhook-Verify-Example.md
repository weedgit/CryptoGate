# M3-03 — Worked webhook verify example

**Owner:** Kevin. **Pairs with:** [M3-02-Integration-Guide.md](M3-02-Integration-Guide.md).  
**Runnable:** `doc/examples/webhook-verify.mjs` (Node 20+, no deps).

Matches Andrew’s outbound signer in `apps/api/src/webhooks/webhook-deliver-rules.mjs`:

- Signature = hex HMAC-SHA256(`signingSecret`, **raw body UTF-8**)  
- Headers: `X-CryptoGate-Signature`, `X-CryptoGate-Timestamp`, `X-CryptoGate-Event-Id`, `X-CryptoGate-Delivery-Id`  
- Ignore replays by remembering `X-CryptoGate-Event-Id` (retries keep the same event id)

---

## Run the sample

```bash
# From repo root — self-test (signs then verifies, then simulates a replay)
node doc/examples/webhook-verify.mjs

# Or as a tiny HTTP listener (set WEBHOOK_SIGNING_SECRET to the secret shown once on POST /webhooks)
WEBHOOK_SIGNING_SECRET=your_hex_secret PORT=8787 node doc/examples/webhook-verify.mjs --listen
```

Then:

```bash
curl -sS -X POST http://127.0.0.1:8787/hook \
  -H 'Content-Type: application/json' \
  -H "X-CryptoGate-Signature: $(…)" \
  -H 'X-CryptoGate-Timestamp: 1710000000' \
  -H 'X-CryptoGate-Event-Id: e1' \
  -H 'X-CryptoGate-Delivery-Id: d1' \
  --data-binary '{"id":"e1","type":"webhook.test","createdAt":"2026-08-24T00:00:00.000Z","data":{"orgId":"o1"}}'
```

Self-test exit codes: `0` pass, `1` verify failure. Listener returns **401** on bad HMAC, **200** `{ "ok": true, "duplicate": true }` on replayed event id, **200** `{ "ok": true }` on first good delivery.

---

## Merchant checklist (M3-T08)

1. Read the **raw** request body bytes (do not re-serialize JSON before HMAC).  
2. Compare `X-CryptoGate-Signature` with `timingSafeEqual` against HMAC-SHA256(secret, body).  
3. If `X-CryptoGate-Event-Id` was already processed → return 2xx and do nothing.  
4. Only then fulfill / update your order store.  
5. Optional: reject if `|now - X-CryptoGate-Timestamp|` is large (CryptoGate does not bind timestamp into the webhook HMAC).
