# M3 acceptance — Kevin gate

**Date:** 2026-08-24  
**OpenAPI:** v0.3.1 · **Handoffs:** [M3-01](M3-01-Signed-Api.md), [M3-02](M3-02-Integration-Guide.md), [M3-03](M3-03-Webhook-Verify-Example.md), [M3-04](M3-04-Asset-Networks.md)

Kevin owns the gate; evidence is automated where noted. Matching slices (T02–T06) are covered by Bruce’s §2.8 suite in CI. Signing/webhook slices (T07–T08) are Kevin’s focus here.

## Run (repo root)

```bash
node scripts/check.mjs
node scripts/e2e-smoke.mjs          # tier A — signing + webhook samples
node scripts/e2e-smoke.mjs --check  # tier A + full contract gate
# or focused:
node --test apps/api/test/signing.test.mjs apps/api/test/auth-http.test.mjs apps/api/test/api-key-rules.test.mjs
node doc/examples/api-signing-smoke.mjs
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
| M3-T07 | **pass (CI)** | Unsigned `X-Api-Key` → 401 `signature_invalid` (`auth-http.test.mjs`). Canonical/HMAC/skew (`signing.test.mjs`). Nonce replay mapping + HMAC sample (`doc/examples/api-signing-smoke.mjs`). Live DB path: `consumeApiKeyNonce` after migrate `017_api_keys_mgmt` + create key. |
| M3-T08 | **pass (CI)** | Outbound HMAC = raw body (`webhook-deliver.test.mjs`). Sample merchant verify + Event-Id replay ignore (`doc/examples/webhook-verify.mjs` / M3-03). |
| M3-T09 | **pack ready** | [M3-T09-Company-A-Handoff.md](M3-T09-Company-A-Handoff.md) — send when Company A fills DNS/TLS/DB; then §5 smoke |
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
