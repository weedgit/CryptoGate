# X-01 — Platform fee tiers & merchant commercial (OpenAPI v0.3.3)

**Owner:** Kevin (contract). **Implementer:** Andrew (`apps/api` + migration).  
**OpenAPI:** `0.3.3`. **Domain:** `MerchantTier`, `FeeTierBand`, `DEFAULT_FEE_TIER_BANDS`, audit actions.  
**Unblocks:** Platform **B8/B13**; agent **C6/C8**; replace commercial **stubs** on B4/C6 onboard wizards.

Additive to v0.3.2. Payment-order and signing paths unchanged.

---

## 1. Global tier bands — `/platform/settings/fee-tiers`

| Method | Access |
| --- | --- |
| `GET` | Platform / agent / merchant O·A·V (not Cashier) |
| `PUT` | **Platform Owner only** |

**Body (PUT):** `{ tiers: FeeTierBand[3] }` — one row each for `small`, `mid`, `enterprise`.

**Seed:** `DEFAULT_FEE_TIER_BANDS` in `@cryptogate/domain` (matches [Business-Model.md](Business-Model.md) table).

**Rules**

- `volumeFeeMinPercent` ≤ `defaultSignupPercent` ≤ `volumeFeeMaxPercent` per tier.
- Changes apply to **next billing period** only — store `updatedAt`; UI shows banner (B8).
- Audit: `fee_tier_put`.

---

## 2. Org policy — `/platform/settings/org-policy`

| Method | Access |
| --- | --- |
| `GET` | Platform O·A·V |
| `PUT` | **Platform Owner only** |

**Fields:** `maxAgentDepth` (Phase 1 default **2**). Mirrors `org_accounts.max_agent_depth` on platform row.

**Rules**

- Lowering depth must not orphan existing subtree; return **422** if violated.
- Audit: `org_policy_put`.

---

## 3. Merchant commercial — `/orgs/{orgId}/commercial`

| Method | Access |
| --- | --- |
| `GET` | Platform / agent (subtree) / merchant (own org) O·A·V |
| `PUT` | Agent O·A (subtree merchants); Platform O·A (any merchant) |

**Merchant orgs only** — 404 for agent/platform rows.

**PUT body:** optional `tier`, `volumeFeePercent`, optional `reason`.

**Validation**

- `volumeFeePercent` must fall within global band for tier (from fee-tiers GET).
- **Enterprise** rate outside band or tier `enterprise` with custom rate → create **pending approval** (§4) instead of immediate apply.
- Cashier **403**. Merchant roles **403** on PUT (read via GET only).
- Scheduled changes: expose `pendingVolumeFeePercent` + `effectiveFrom`; audit `merchant_commercial_put`.

**Create merchant:** `POST /orgs` accepts optional `commercial` on `CreateOrgRequest` when `type=merchant` (agent onboard C6).

---

## 4. Enterprise approvals — `/platform/enterprise-rate-approvals`

| Method | Access |
| --- | --- |
| `GET` | Platform O·A·V; filter `status` |
| `PATCH …/{approvalId}` | **Platform Owner only** — `decision`: `approve` \| `deny`; `reason` required on deny |

On **approve:** apply requested tier/rate to merchant commercial (next period).  
Audit: `enterprise_rate_decide`.

---

## 5. Suggested migration (Andrew — **019**)

| Table / change | Purpose |
| --- | --- |
| `platform_fee_tiers` | One row per tier; JSON or columns for band fields |
| `merchant_commercial` | `org_id`, `tier`, `volume_fee_percent`, `pending_*`, `effective_from` |
| `enterprise_rate_approvals` | Queue for Platform Owner |
| Optional: seed `platform_fee_tiers` from `DEFAULT_FEE_TIER_BANDS` on migrate |

Service bill issue may read `subscriptionAmountUsd` + confirmed volume × `volumeFeePercent` — out of scope for this contract PR; issue path unchanged in v0.3.3.

---

## 6. UI wiring (Andrew platform / Bruce agent)

| Screen | API |
| --- | --- |
| B8 Fee tiers | GET/PUT `/platform/settings/fee-tiers` |
| B13 Org policy | GET/PUT `/platform/settings/org-policy` |
| B4/C6 commercial step | GET fee tiers + POST `/orgs` with `commercial` |
| C8 Volume fee modal | GET commercial + PUT `/orgs/{id}/commercial` |
| B8 Enterprise table | GET/PATCH enterprise-rate-approvals |

Remove `MERCHANT_TIER_LABELS`-only stubs once routes land.

---

## Related

- [Business-Model.md](Business-Model.md) — tier table & rules  
- [UI-Page-Spec.md](UI-Page-Spec.md) — B8, B13, C6, C8  
- [CONTRACT-FREEZE.md](CONTRACT-FREEZE.md) — v0.3.3  
- Prior: [M4-36-Audit-Bills-v032.md](M4-36-Audit-Bills-v032.md)
