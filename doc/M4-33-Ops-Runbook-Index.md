# M4-33 — Operations runbook index

**Owner:** Kevin (infra). **Implements:** Milestone M4-33.  
**Depends on:** [M4-01-Deploy-Runbook.md](M4-01-Deploy-Runbook.md) and follow-on ops docs.

Single entry point for **Company A operators** and **Company B assist** — links deployment, secrets, backup, access, integration, and merchant-facing manuals. Detail lives in the linked docs; this page is the daily ops map.

---

## 1. Document map

| Topic | Doc | Owner |
| --- | --- | --- |
| Deploy sequence, processes, rollback | [M4-01-Deploy-Runbook.md](M4-01-Deploy-Runbook.md) | Kevin |
| TLS surfaces, secrets, rotation | [M4-02-Secrets-TLS.md](M4-02-Secrets-TLS.md) | Kevin |
| Backup, restore drill, alerts | [M4-03-Backup-Monitoring.md](M4-03-Backup-Monitoring.md) | Kevin |
| Jump host, vendor access, logging | [M4-04-Admin-Host-Vendor-Access.md](M4-04-Admin-Host-Vendor-Access.md) | Kevin |
| Local / test / prod matrix | [M4-05-Env-Matrix.md](M4-05-Env-Matrix.md) | Kevin |
| Merchant integrator API | [M3-02-Integration-Guide.md](M3-02-Integration-Guide.md) | Kevin |
| Webhook HMAC verify | [M3-03-Webhook-Verify-Example.md](M3-03-Webhook-Verify-Example.md) | Kevin |
| Merchant product manual | [M4-32-Merchant-Manual.md](M4-32-Merchant-Manual.md) | Kevin |
| OSS / npm licenses | [M4-34-Third-Party-Licenses.md](M4-34-Third-Party-Licenses.md) | Kevin |
| DB schema reference | [M4-35-Database-Schema.md](M4-35-Database-Schema.md) | Kevin |
| Watcher ↔ order status | [Watcher-Order-Status-Contract.md](Watcher-Order-Status-Contract.md) | Bruce |
| Live asset/network | [M3-04-Asset-Networks.md](M3-04-Asset-Networks.md) | Kevin |
| M3 acceptance / CI gate | [M3-Acceptance.md](M3-Acceptance.md) | Kevin |
| Company A test handoff (M3-T09) | [M3-T09-Company-A-Handoff.md](M3-T09-Company-A-Handoff.md) | Kevin |
| Cashier APK install / MDM / checksum (M5-08) | [M5-08-Cashier-Apk-Install.md](M5-08-Cashier-Apk-Install.md) | Kevin |
| Reference POS device sign-off (M5-01) | [M5-01-Reference-Device.md](M5-01-Reference-Device.md) | Kevin |
| M1 prototype walkthrough (M1-T05) | [M1-T05-Prototype-Walkthrough.md](M1-T05-Prototype-Walkthrough.md) | Kevin |

**Platform portal ops UI** (audit review, system health B17): Andrew — M4-30. **Cashier APK dev reference:** [Cashier-Apk.md](Cashier-Apk.md) — Bruce.

---

## 2. Daily operations checklist

| Task | Frequency | Reference |
| --- | --- | --- |
| Confirm API `GET /health` green | Automated (60s) | [M4-03](M4-03-Backup-Monitoring.md) §5.1 |
| Confirm watcher ticks in logs | Automated | [M4-03](M4-03-Backup-Monitoring.md) §5.3 |
| Webhook pending backlog query | Automated / daily | [monitoring-queries.sql](examples/monitoring-queries.sql) |
| Review P1/P2 alerts | On page | [M4-03](M4-03-Backup-Monitoring.md) §6 |
| Spot-check `audit_log` (platform) | Weekly | [M4-04](M4-04-Admin-Host-Vendor-Access.md) §5.2 |
| Verify backup snapshot age | Daily (prod) | [M4-03](M4-03-Backup-Monitoring.md) §2 |
| `pnpm audit` / CVE scan | Weekly pre-release | [M4-34](M4-34-Third-Party-Licenses.md) |
| Tron RPC quota / errors | Weekly | Watcher logs; [M4-02](M4-02-Secrets-TLS.md) Tron key |

---

## 3. Common procedures (quick links)

| Scenario | Go to |
| --- | --- |
| First deploy to test/prod | [M4-01](M4-01-Deploy-Runbook.md) §5 |
| Rotate session secret | [M4-02](M4-02-Secrets-TLS.md) §6 |
| Restore DB after incident | [M4-03](M4-03-Backup-Monitoring.md) §4.2 |
| Test restore drill (M4-T04) | [M4-03](M4-03-Backup-Monitoring.md) §4.1 |
| Grant vendor break-glass | [M4-04](M4-04-Admin-Host-Vendor-Access.md) §7 |
| Roll back bad API release | [M4-01](M4-01-Deploy-Runbook.md) §7 |
| Merchant integration handoff | [M4-05](M4-05-Env-Matrix.md) §Company A fill-in + [M3-02](M3-02-Integration-Guide.md) |
| Payment anomaly triage | [M4-32](M4-32-Merchant-Manual.md) + [Watcher contract](Watcher-Order-Status-Contract.md) |

---

## 4. Contract gate (pre-release)

From repo root after install:

```bash
npx pnpm@9.15.0 install --frozen-lockfile
npx pnpm@9.15.0 check
node scripts/licenses-report.mjs   # refresh M4-34 if lockfile changed
```

OpenAPI freeze: [CONTRACT-FREEZE.md](CONTRACT-FREEZE.md).

---

## 5. Handoff status

| Deliverable | Status |
| --- | --- |
| Ops index (this doc) | **Done** |
| Administrator UI manual (platform screens) | Pending M4-30 (Andrew) |
| Cashier operator chapter | Pending M5-09 |

---

## Related

- Team board: [TEAM-BOARD.md](../TEAM-BOARD.md)  
- Requirement deliverable §IV.12: deployment + daily O&M documentation
