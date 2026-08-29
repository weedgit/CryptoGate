# M4-T04 — Restore drill report & dependency review

**Owner:** Kevin. **Milestone:** M4-T04 ([Milestone-Task-List.md](Milestone-Task-List.md)).  
**Procedure:** [M4-03-Backup-Monitoring.md](M4-03-Backup-Monitoring.md) §4.1 · **Smoke:** §4.3  
**When:** Test environment **before prod go-live** (after [M3-T09](M3-T09-Company-A-Handoff.md) deploy).

This doc is the **sign-off artifact** for the restore drill plus the **CVE / load** slice of M4-T04. Fill one report per drill; store in Company A ticket system (not git).

---

## 1. Restore drill — execution checklist

Copy to the drill ticket and tick during the window.

| Step | Action | Done | Notes |
| --- | --- | --- | --- |
| 1 | Announce drill; confirm **test** env only | ☐ | |
| 2 | Baseline `GET {API}/health` → `db: ok` | ☐ | |
| 3 | Record latest migration: `SELECT id FROM schema_migrations ORDER BY applied_at DESC LIMIT 1` | ☐ | Expect through **041** on current `main` |
| 4 | Note open order count + pending webhooks ([monitoring-queries.sql](examples/monitoring-queries.sql)) | ☐ | |
| 5 | Backup: provider snapshot **or** `pg_dump` ([M4-03](M4-03-Backup-Monitoring.md) §2.2) | ☐ | |
| 6 | **Stop** API + watcher | ☐ | |
| 7 | Restore DB (new instance or in-place per provider) | ☐ | Start timer (RTO) |
| 8 | Update `DATABASE_URL` if hostname changed | ☐ | |
| 9 | `node apps/api/scripts/migrate.mjs` (or `pnpm --filter @cryptogate/api migrate`) | ☐ | |
| 10 | Start **watcher**, then **API** | ☐ | Stop timer |
| 11 | Run smoke §2 below | ☐ | |
| 12 | Complete §3 report; attach monitoring query output | ☐ | |

**Pass:** health OK, schema current, sample order readable, watcher ticks, webhook backlog not exploding.

---

## 2. Post-restore smoke (required)

| Check | Command / action | Pass |
| --- | --- | --- |
| API health | `curl -sS "{API}/health"` | ☐ 200, `"db":"ok"` |
| Schema version | SQL on `schema_migrations` | ☐ |
| Watcher | Log JSON tick within 2× poll interval | ☐ |
| Guest payment (optional) | `GET {API}/v1/orders/{id}/payment` on known order | ☐ 200, no session |
| Webhook test | `POST /v1/webhooks/test` (platform auth) | ☐ delivery logged |
| Open orders | Pre/post count within expected drift | ☐ |

**Chain reconcile:** Do not manually set orders to Completed. Watcher re-polls Tron for `verifying` rows ([M4-03](M4-03-Backup-Monitoring.md) §3).

---

## 3. Drill report (fill-in)

| Field | Value |
| --- | --- |
| Environment | test / staging |
| Drill date (UTC) | |
| Incident commander / owner | |
| Backup method | snapshot / pg_dump / PITR exercise |
| Restore target | same instance / new instance |
| **RTO achieved** (stop API → health OK) | ___ minutes |
| **RPO** (backup age at restore point) | ___ minutes |
| Migration id after restore | |
| Issues / gaps | |
| Follow-up tickets | |
| Sign-off (Company A ops) | |

---

## 4. Dependency & CVE review (M4-T04)

Run before **prod release** and after major dependency bumps. Record output in the same ticket or release notes.

```bash
# Monorepo (requires pnpm install)
npx pnpm@9.15.0 audit --audit-level=moderate

# OSS inventory (Kevin)
node scripts/licenses-report.mjs
```

| Check | Pass | Notes |
| --- | --- | --- |
| No **high/critical** npm advisories without accepted risk | ☐ with exceptions | **2026-08-27 local:** 1 high + 5 moderate (below). No prod API/watcher packages. |
| [M4-34](M4-34-Third-Party-Licenses.md) updated if new deps | ☑ | Regenerated 2026-08-27 (90 packages, no new copyleft) |
| Android Gradle CVE scan (Cashier APK) | ☐ | Company A / Bruce before prod APK |
| Postgres / OS patches current on DB host | ☐ | Company A |

**Accepted risk (2026-08-27 local review — revisit at Company A cutover):**

| Advisory | Package | Why deferred | Compensating control | Review |
| --- | --- | --- | --- | --- |
| [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) high | `vite@5.4.21` | Fix is Vite ≥6.4.3; Phase 1 web stays on Vite 5 | Windows-only `server.fs.deny` bypass; portals are Linux/macOS Vite **dev**, not a public Vite server | Cutover |
| [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) moderate | `esbuild@0.21.5` (via Vite) | Transitive; Vite 5 pin | Dev-server only, not production API/watcher | Cutover |
| [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9) moderate | `vite@5.4.21` | Vite 6 major | Optimized-deps `.map` path traversal on **dev** server | Cutover |
| [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) moderate | `vite` / launch-editor | Windows NTLM | N/A on Linux operators | Cutover |
| [GHSA-wrjc-x8rr-h8h6](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6) moderate | `react-router@6.30.6` | v7 is a breaking portal upgrade | Open redirect in `<Link>`/`useNavigate`; app links are first-party routes | Cutover |
| [GHSA-337j-9hxr-rhxg](https://github.com/advisories/GHSA-337j-9hxr-rhxg) moderate | `react-router@6.30.6` | SSR hydration only | Portals are Vite SPA, no SSR | Cutover |

---

## 5. Load smoke (M4-T04 / M4-12)

Optional in test after restore — proves API path under light concurrency.

```bash
# No DB — mapper + fan-out gates (CI default)
node apps/api/scripts/load-m4-12.mjs

# Live DB
DATABASE_URL=... node apps/api/scripts/load-m4-12.mjs --db

# HTTP router
DATABASE_URL=... node apps/api/scripts/load-m4-12.mjs --http
```

| Mode | Pass | p95 create (ms) | p95 status (ms) |
| --- | --- | --- | --- |
| in-process | ☑ | ~1 | ~1 |
| `--db` / `--http` (test) | ☐ | | Company A test |

---

## 6. Handoff status

| Deliverable | Status |
| --- | --- |
| Drill procedure | **Done** — [M4-03](M4-03-Backup-Monitoring.md) §4.1 |
| Report template (this doc) | **Done** |
| Executed drill on Company A test | **Pending** — blocked on M3-T09 deploy |
| Local dry-run (`node scripts/deploy-wave5.mjs --restore-drill`) | **Done 2026-08-27** — docker `pg_dump`/`pg_restore`, health + e2e smoke after restore. Dump at `.deploy/restore-drill.dump` (gitignored). |
| CVE review on prod release | **Pending** — run at cutover; local npm review recorded in §4 |

---

## Related

- Ops index: [M4-33-Ops-Runbook-Index.md](M4-33-Ops-Runbook-Index.md)  
- E2E gate: [X-07-E2E-Smoke.md](X-07-E2E-Smoke.md)  
- Company A handoff: [M3-T09-Company-A-Handoff.md](M3-T09-Company-A-Handoff.md)
