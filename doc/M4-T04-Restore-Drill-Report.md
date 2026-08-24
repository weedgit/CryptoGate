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
| 3 | Record latest migration: `SELECT id FROM schema_migrations ORDER BY applied_at DESC LIMIT 1` | ☐ | Expect through **018** (+ **019** when X-01 lands) |
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
| No **high/critical** npm advisories without accepted risk | ☐ | Fix or document exception |
| [M4-34](M4-34-Third-Party-Licenses.md) updated if new deps | ☐ | |
| Android Gradle CVE scan (Cashier APK) | ☐ | Company A / Bruce before prod APK |
| Postgres / OS patches current on DB host | ☐ | Company A |

**Accepted risk template:** advisory ID, package, why deferred, compensating control, review date.

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
| in-process | ☐ | | |
| `--db` / `--http` (test) | ☐ | | |

---

## 6. Handoff status

| Deliverable | Status |
| --- | --- |
| Drill procedure | **Done** — [M4-03](M4-03-Backup-Monitoring.md) §4.1 |
| Report template (this doc) | **Done** |
| Executed drill on Company A test | **Pending** — blocked on M3-T09 deploy |
| CVE review on prod release | **Pending** — run at cutover |

---

## Related

- Ops index: [M4-33-Ops-Runbook-Index.md](M4-33-Ops-Runbook-Index.md)  
- E2E gate: [X-07-E2E-Smoke.md](X-07-E2E-Smoke.md)  
- Company A handoff: [M3-T09-Company-A-Handoff.md](M3-T09-Company-A-Handoff.md)
