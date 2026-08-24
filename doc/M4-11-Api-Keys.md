# M4-11 — API key CRUD / rotation (+ webhook secret handling)

**Owner:** Kevin (contract). **Implementer:** Andrew (`apps/api`).  
**OpenAPI:** `0.3.1`. **Domain:** `ApiKey`, `API_KEY_MAX_PER_ORG`, `ApiKeyColumn`.  
**Unblocks:** M4-11 API routes + merchant D14 integrations UI.

Do not return `secret` on GET/list. Do not log secrets. Cashier **403** on every path below.

---

## 1. Paths

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/v1/api-keys` | Active keys only; never `secret`. Viewer OK. |
| `POST` | `/v1/api-keys` | Create; `secret` **once** on 201. Owner/Admin. |
| `DELETE` | `/v1/api-keys/{apiKeyId}` | Soft revoke (`revoked_at`). Owner/Admin. |
| `POST` | `/v1/api-keys/{apiKeyId}/rotate` | Revoke + create replacement; `secret` once. |

`apiKeyId` = row UUID. Public header value is `keyId` (prefix `cgk_`) → `X-Api-Key`.

Max **10** active keys per merchant org (`API_KEY_MAX_PER_ORG`). Create when full → **409**. Rotate keeps net active count the same.

Agent accounts cannot manage merchant keys (**403**). Session cookie or signed API key auth (same as webhooks).

---

## 2. Schema (list / create)

```json
{
  "id": "<uuid>",
  "orgId": "<uuid>",
  "keyId": "cgk_live_…",
  "label": "Production",
  "createdAt": "<iso>",
  "lastUsedAt": null,
  "expiresAt": null
}
```

Create/rotate **add** `secret` (min 32 chars) on the 201 body only.

Create body: `{ "label": "…", "expiresAt"?: "<iso>" }`.  
Rotate body (optional): `{ "expiresAt"?: "<iso>" }` — omit to keep previous expiry.

HMAC signing is unchanged from [M3-01-Signed-Api.md](M3-01-Signed-Api.md) — secret is the HMAC key.

---

## 3. DB (Andrew)

Extend `012_api_keys` (or a follow-up migration):

| Column | Notes |
| --- | --- |
| `label` | TEXT NOT NULL |
| `last_used_at` | TIMESTAMPTZ NULL — update on successful HMAC auth |
| `expires_at` | TIMESTAMPTZ NULL — reject auth when past |

`secret` at rest: hash preferred; if stored encrypt-at-rest, never write plaintext to logs/audit payloads.

Audit: create, revoke, rotate (append-only).

---

## 4. Webhook secret handling (docs only — no new path)

Phase 1 has **no** `POST /webhooks/{id}/rotate-secret`. To rotate a webhook signing secret:

1. `DELETE /v1/webhooks/{webhookId}`
2. `POST /v1/webhooks` with the same URL/events → new `signingSecret` once
3. Update the merchant handler before traffic resumes

`GET /webhooks` never returns `signingSecret`. Same Cashier / agent rules as M3-13.

---

## 5. Acceptance (Andrew)

- [ ] Cashier → 403 on list/create/revoke/rotate
- [ ] Create returns secret once; subsequent list has no secret
- [ ] Revoked `keyId` → HMAC `signature_invalid` (or equivalent 401)
- [ ] Rotate invalidates old `keyId` immediately
- [ ] 11th active create → 409
- [ ] Agent membership cannot CRUD merchant keys
