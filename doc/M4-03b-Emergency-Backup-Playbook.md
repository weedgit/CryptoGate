# M4-03b — Emergency backup playbook (bad server status)

**Owner:** Kevin (infra). **Companion to:** [M4-03-Backup-Monitoring.md](M4-03-Backup-Monitoring.md).  
**Audience:** Platform / Company A administrators on the self-hosted VPS.

When an admin sees a **bad server** (dashboard **DB Backup** failed/stale, `GET /health` degraded, disk full, Postgres errors), treat it as: **capture a clean copy first, then fix or restore** — do not keep writing into a sick machine.

---

## 0. Decide how bad it is

| Situation | Goal |
| --- | --- |
| App broken, Postgres still answers | **Emergency dump now**, copy off-box |
| Disk almost full / disk errors | Dump if possible, then free space / migrate |
| Postgres won’t start / corrupt | **Stop writing**; use last good dump under `/var/backups/paymentgate/` |
| Whole VPS dying | Pull latest dump + `.env` off-box before reboot/rebuild |

---

## 1. Where backups live on this VPS

| What | Path |
| --- | --- |
| Daily dumps | `/var/backups/paymentgate/` |
| Latest dump | `/var/backups/paymentgate/latest/paymentgate.dump` |
| Status (dashboard KPI) | `/var/backups/paymentgate/status.json` |
| Weekly restore-drill work dirs | `/var/backups/paymentgate-drill/` |

From the repo checkout (symlinks, gitignored):

- `CryptoGate/BACKUPS` → `/var/backups/paymentgate`
- `CryptoGate/BACKUPS-DRILL` → `/var/backups/paymentgate-drill`

**Note:** Dashboard **OK** means the last daily dump succeeded and is newer than ~36 hours. It does **not** mean offsite copy exists (`offsite: false` until `PAYMENTGATE_BACKUP_RCLONE_REMOTE` is set).

---

## 2. Stop the bleeding (optional but often right)

If data looks wrong or disk is failing:

```bash
# Stop writers so the dump is consistent and nothing new is corrupted.
# Use your real unit/container names from M4-01.
sudo systemctl stop paymentgate-api paymentgate-watcher
# or: docker compose stop api watcher
```

Leave Postgres up if you still need to dump it.

---

## 3. Take an emergency backup **now** (don’t wait for cron)

On the VPS (SSH as root/ops):

```bash
cd /root/CryptoGate
sudo ./deploy/backup.sh
```

Verify:

```bash
cat /var/backups/paymentgate/status.json
ls -lh /var/backups/paymentgate/latest/paymentgate.dump
# or:
ls -lh /root/CryptoGate/BACKUPS/latest/paymentgate.dump
```

Expect `"ok": true` and a non-tiny `.dump` file.

**Example:** at `2026-10-03T11:30:00Z` you run the script → new folder  
`/var/backups/paymentgate/20261003T113000Z/paymentgate.dump`  
and `status.json` updates. The platform dashboard **DB Backup** card shows OK after refresh once age is fresh.

---

## 4. Copy the dump **off the sick server**

Same-disk backup is not enough if the VPS is dying.

```bash
# From admin laptop (example)
scp root@YOUR_VPS:/var/backups/paymentgate/latest/paymentgate.dump \
  ~/pg-emergency-$(date -u +%Y%m%dT%H%MZ).dump

# Also copy secrets (needed to run a restored stack — never commit to git)
scp root@YOUR_VPS:/root/CryptoGate/.env ~/pg-emergency.env
```

Or, if rclone is configured:

```bash
export PAYMENTGATE_BACKUP_RCLONE_REMOTE='remote:paymentgate-backups'
sudo -E ./deploy/backup.sh   # sets offsite:true in status.json when copy succeeds
```

---

## 5. Then choose the path

### A. Server salvageable (bad process / config / disk full)

1. Fix the issue (restart API/watcher, free disk, fix nginx).
2. Keep the emergency dump as a safety net.
3. Confirm `GET /health` and the dashboard backup card.

### B. Database needs restore (corruption / bad migration / wiped data)

1. Keep API + watcher **stopped**.
2. Restore from the emergency dump or last good daily dump (`BACKUPS/latest` or an older stamp). See [M4-03](M4-03-Backup-Monitoring.md) §4.2–4.3.
3. Run migrations once if needed.
4. Start **watcher**, then **API**.
5. Smoke: health, open order counts, watcher ticks.

The **weekly** job (`deploy/restore-drill.sh`, Sundays) only *proves* restore works into a sidecar DB. It does **not** replace an emergency dump and does **not** drive the dashboard KPI.

---

## 6. What admin should **not** do

- Don’t reboot a dying disk server before copying `/var/backups/paymentgate/latest/` off-box.
- Don’t restore into live while API/watcher are still writing.
- Don’t assume “DB backup OK” on the dashboard means offsite exists.
- Don’t use the weekly drill as the only backup — it’s a test, not retention.

---

## 7. One-line playbook

**Bad status → stop writers if unsafe → `./deploy/backup.sh` → `scp` dump (+ `.env`) off-box → repair or restore from that file.**

---

## Related

- Daily dump script: `deploy/backup.sh`
- Weekly restore drill: `deploy/restore-drill.sh`
- Full backup/monitoring design: [M4-03-Backup-Monitoring.md](M4-03-Backup-Monitoring.md)
- Ops index: [M4-33-Ops-Runbook-Index.md](M4-33-Ops-Runbook-Index.md)
