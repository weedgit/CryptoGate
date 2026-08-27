# M4-T01 — Functional + regression (Phase1-Requirement §V)

**Owner:** Kevin. **Date:** 2026-08-27 (local).  
**Scope:** Requirement §V items 1–11 on this repo. Item 12 (independent pen test) remains **external** ([M4-T05](Milestone-Task-List.md)).

Evidence is `node scripts/check.mjs` plus the live local stack used for [M1-T05](M1-T05-Prototype-Walkthrough.md). Company A staging re-run is still required before official release.

---

## Mapping (Requirement §V)

| # | Requirement | Local result | Evidence |
| --- | --- | --- | --- |
| 1 | Functional + regression | **Pass (CI gate)** | `scripts/check.mjs` — domain, matching §2.8, API unit, watcher, web needles, M4-12 load |
| 2 | API + authorization | **Pass** | `apps/api/test/authz-regression.test.mjs`, `role-policy.test.mjs`; cashier settlement 403 on live stack |
| 3 | Identity + access control | **Pass** | `auth-http.test.mjs`, MFA `401 mfa_required`, Owner enroll gate |
| 4 | Database + critical data | **Pass (local)** | Postgres via compose; migrations through **030** (site inherit unique); restore drill [M4-T04](M4-T04-Restore-Drill-Report.md) |
| 5 | Private key / API key / system key | **Pass (design)** | Watch-only; xPub GET is presence-only; webhook secrets not logged; `.env` gitignored |
| 6 | General web vulns | **Partial** | Accepted Vite 5 / react-router 6 advisories in M4-T04 §4 (dev-server / SPA). Revisit at Company A cutover |
| 7 | Re-run / duplicate order / duplicate notification | **Pass** | Idempotency-Key 409; nonce_replay; webhook Event-Id replay (`webhook-verify.mjs`) |
| 8 | Chain monitoring + confirmations | **Pass (tests)** | `apps/watcher/test/confirmations.test.mjs`, `inbound-match.test.mjs`; live Tron ingest when TronGrid set |
| 9 | Abnormal payment + outage | **Pass (tests)** | `anomaly-paths.test.mjs`; matching Mode B collision → anomaly |
| 10 | Stress, stability, recovery | **Partial** | M4-12 in-process load ~1ms p95; HTTP load + Company A restore still open. Local restore drill done |
| 11 | Third-party / OSS vulns | **Recorded** | `pnpm audit` 2026-08-27 — 1 high Vite (Windows dev), 5 moderate; no API/watcher prod packages |
| 12 | Independent pen test | **Blocked** | M4-T05 — client |

---

## Commands (re-run)

```bash
node scripts/check.mjs
node scripts/e2e-smoke.mjs --live   # needs API up; E2E_API_BASE=http://127.0.0.1:3000
node --test packages/matching/test/acceptance-2.8.test.mjs
node --test apps/api/test/authz-regression.test.mjs
node --test apps/watcher/test/anomaly-paths.test.mjs
```

---

## Gaps before official release

- Company A hostnames / TLS (M3-T09) — re-run this checklist on staging
- M4-T05 pen test
- HTTP `--db` load numbers (M4-12) on test DB
- Do not treat this local pass as prod go-live

---

## Related

- [Phase1-Requirement.md](Phase1-Requirement.md) §V  
- [M3-Acceptance.md](M3-Acceptance.md)  
- [M4-T04-Restore-Drill-Report.md](M4-T04-Restore-Drill-Report.md)
