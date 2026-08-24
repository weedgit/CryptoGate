# M3 acceptance — Kevin gate

**Date:** 2026-08-24  
**OpenAPI:** v0.3.1 · **Handoffs:** [M3-01](M3-01-Signed-Api.md), [M3-02](M3-02-Integration-Guide.md), [M3-03](M3-03-Webhook-Verify-Example.md), [M3-04](M3-04-Asset-Networks.md)

Kevin owns the gate; evidence is automated where noted. Matching slices (T02–T06) are covered by Bruce’s §2.8 suite in CI. Signing/webhook slices (T07–T08) are Kevin’s focus here.

## Run (repo root)

```bash
node scripts/check.mjs
# or focused:
node --test apps/api/test/signing.test.mjs apps/api/test/auth-http.test.mjs
node --test apps/api/test/webhook-deliver.test.mjs
node doc/examples/webhook-verify.mjs
node --test packages/matching/test/acceptance-2.8.test.mjs
node --test apps/watcher/test/anomaly-paths.test.mjs
```

## Checklist

| ID | Status | Evidence |
| --- | --- | --- |
| M3-T01 | ready (Bruce) | Watcher confirmations tests + live Tron ingest (PR #37/#42). Kevin spot-check on staging when env ready. |
| M3-T02 | **pass (CI)** | `packages/matching/test/acceptance-2.8.test.mjs` Mode B collision → anomaly |
| M3-T03 | **pass (CI)** | same suite — Mode C concurrent fingerprints |
| M3-T04 | **pass (CI)** | same suite — Mode D memo / USDT Tron unavailable |
| M3-T05 | **pass (CI)** | same suite — Mode S three orders + pool reuse |
| M3-T06 | **pass (CI)** | matching suite + `apps/watcher/test/anomaly-paths.test.mjs` (under/over/wrong-net/dup) |
| M3-T07 | **pass (CI partial)** | Unsigned `X-Api-Key` → 401 `signature_invalid` (`auth-http.test.mjs`). Canonical/HMAC/skew (`signing.test.mjs`). **Nonce replay** needs DB (`api_signing_nonces`) — live smoke after Andrew provisions a key (M4-11 CRUD or seed). |
| M3-T08 | **pass (CI)** | Outbound HMAC = raw body (`webhook-deliver.test.mjs`). Sample merchant verify + Event-Id replay ignore (`doc/examples/webhook-verify.mjs` / M3-03). |
| M3-T09 | ready (Kevin) | Env matrix published — [M4-05-Env-Matrix.md](M4-05-Env-Matrix.md). Handoff when Company A fills DNS/TLS slots. |
| M3-T10 | ready (Bruce) | APK poll status incl. anomaly (M3-70). Kevin smoke on device when staging URL set. |

## T07 live smoke (optional, after API key exists)

```bash
# Unsigned → 401 signature_invalid
curl -sS -o /dev/null -w "%{http_code}\n" -H "X-Api-Key: cgk_test" \
  http://127.0.0.1:3000/v1/orders

# Signed once OK; same nonce again → 401 nonce_replay
# (use canonical string from M3-01; secret from createApiKey once)
```

## T08 live smoke (optional)

```bash
# Terminal A — sample listener
WEBHOOK_SIGNING_SECRET="<secret-from-POST-/webhooks>" \
  PORT=8787 node doc/examples/webhook-verify.mjs --listen

# Terminal B — enqueue
# POST /v1/webhooks/test (session or signed API key)
# Expect listener 200, then replay same Event-Id → duplicate:true
```

## Gate verdict

| Slice | Verdict |
| --- | --- |
| Matching T02–T06 | **Green in CI** |
| Signing/webhook T07–T08 | **Green in CI** (T07 nonce replay = live follow-up) |
| M3 exit | Env matrix ready (M4-05). Full exit: Company A DNS fill-in (T09) + optional staging T01/T10 spot-check. |

Do **not** treat browser redirect as payment fulfillment — signed webhooks only.
