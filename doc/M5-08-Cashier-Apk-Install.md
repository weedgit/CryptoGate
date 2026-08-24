# M5-08 — Cashier APK install, MDM & release checksum

**Owner:** Kevin (doc + checksum script). **Build:** Bruce (`apps/cashier-apk`).  
**Milestone:** M5-08 · Phase1-Project-Plan §III.3.3.  
**Related:** [Cashier-Apk.md](Cashier-Apk.md) · [M4-05-Env-Matrix.md](M4-05-Env-Matrix.md) · [M4-02-Secrets-TLS.md](M4-02-Secrets-TLS.md)

Phase 1 delivers a **signed release APK** and source — **not** a Google Play listing. Company A or the merchant IT team installs via **USB sideload**, file share, or **MDM**. This doc is the operator handoff.

---

## 1. Artifacts per release

| Artifact | Path / name | Notes |
| --- | --- | --- |
| **Staging APK** | `app-staging-release.apk` | `applicationId` **`com.cryptogate.cashier.staging`** — test API only |
| **Production APK** | `app-prod-release.apk` | `applicationId` **`com.cryptogate.cashier`** — prod API only |
| **SHA-256 manifest** | `apk-release-sha256.txt` | From `node scripts/apk-checksum.mjs` — attach to release notes |
| **Mapping** | `mapping.txt` (when R8/minify enabled) | Optional Phase 1 — currently minify off |
| **Source** | Repo tag on `main` | Requirement §III.3.3 — APK without source is not delivery |

**Never mix environments:** staging APK → staging API; prod APK → prod API ([M4-05](M4-05-Env-Matrix.md)).

---

## 2. Build (release)

Prerequisites: Android SDK 35, JDK 17, release keystore ([M4-02](M4-02-Secrets-TLS.md) §2).

1. Copy `apps/cashier-apk/keystore.properties.example` → `keystore.properties` (gitignored).
2. Set Company A / release signing values — **do not commit**.
3. From `apps/cashier-apk` (Android Studio **Build → Generate Signed Bundle/APK** or Gradle):

```bash
# Override API bases at build time (recommended for Company A):
# -Pcryptogate.stagingApi=https://api-test.example.com/v1
# -Pcryptogate.prodApi=https://api.example.com/v1

./gradlew :app:assembleStagingRelease :app:assembleProdRelease
```

Output (default Gradle layout):

| Flavor | APK path |
| --- | --- |
| staging | `app/build/outputs/apk/staging/release/app-staging-release.apk` |
| prod | `app/build/outputs/apk/prod/release/app-prod-release.apk` |

If `gradlew` is missing, open the folder in Android Studio and use **Build → Select Build Variant** (`stagingRelease` / `prodRelease`) then **Build APK(s)**.

**Version:** `versionName` in `app/build.gradle.kts` (e.g. `0.1.0-m4-23-staging`). Bump per release; record in checksum manifest.

---

## 3. Checksum manifest (integrity)

After build, from repo root:

```bash
node scripts/apk-checksum.mjs \
  apps/cashier-apk/app/build/outputs/apk/staging/release/app-staging-release.apk \
  apps/cashier-apk/app/build/outputs/apk/prod/release/app-prod-release.apk \
  > apk-release-sha256.txt
```

Publish `apk-release-sha256.txt` with the release (ticket, secure share, or MDM release notes). Operators verify before install:

```bash
sha256sum -c apk-release-sha256.txt
```

Example line format:

```
a1b2c3…  app-staging-release.apk
```

---

## 4. Install methods

### 4.1 USB / developer sideload (pilot, single device)

1. Enable **Developer options** on the POS/tablet.
2. Enable **Install via USB** / **USB debugging** (vendor menus vary).
3. Connect USB; install with `adb`:

```bash
adb install -r app-staging-release.apk
```

`-r` replaces same `applicationId` + signature. Different flavor (staging vs prod) = different app IDs — both may coexist for UAT.

4. Launch **CryptoGate POS (Test)** or **CryptoGate POS**; confirm API base in About/settings if exposed, or verify login hits the intended host (network log / proxy).

### 4.2 File sideload (no MDM)

1. Copy APK to device storage (secure link, not public HTTP without auth).
2. Open the file; allow **Install unknown apps** for the file manager when prompted.
3. Verify SHA-256 matches manifest before opening the file on device (optional: MDM or IT script).

### 4.3 MDM (recommended for production fleet)

Typical flow (Intune, VMware Workspace ONE, Samsung Knox, vendor POS MDM):

| Step | Action |
| --- | --- |
| 1 | Upload **prod** APK + checksum to MDM catalog |
| 2 | Assign to **Cashier device group** only |
| 3 | Set **managed config** if MDM supports URL injection — otherwise bake `-Pcryptogate.prodApi` at build |
| 4 | Enforce **single app kiosk** optional (merchant policy) |
| 5 | Block uninstall without admin PIN |

**Staging fleet:** separate MDM assignment with **staging** APK; restrict to test Wi‑Fi/VPN if possible.

### 4.4 Reference POS SKU (M5-01)

When Company A confirms make/model/Android/SDK, repeat install on the **reference device** and attach vendor printer/second-screen SDK notes to M5-01. Until then, generic Android sideload satisfies Phase 1 fallback ([Milestone-Task-List.md](Milestone-Task-List.md) M5-T05).

---

## 5. Post-install smoke

| # | Check |
| --- | --- |
| 1 | App title matches flavor (Test vs prod) |
| 2 | Cashier login with test merchant **Cashier** user |
| 3 | MFA-required Owner → APK shows block message (MFA on web only) |
| 4 | Create order → QR matches `GET /v1/orders/{id}/payment` |
| 5 | Status poll reaches Completed / Expired / **Payment anomaly** — never local “paid” |
| 6 | Airplane mode → create blocked; graceful error (M2-74) |
| 7 | Settlement / matching settings **not** visible; API 403 if forced |

Full acceptance: [M3-Acceptance.md](M3-Acceptance.md) M3-T10 · merchant POS chapter [M4-32](M4-32-Merchant-Manual.md) §11.

---

## 6. Upgrade & rollback

| Scenario | Action |
| --- | --- |
| **New release, same signing key** | MDM push or `adb install -r` |
| **Rotated signing key** | Uninstall old APK first (data loss: local session only) |
| **Wrong API flavor installed** | Uninstall; install correct flavor; do not reuse prod credentials on staging |
| **Compromised APK** | Revoke MDM package; rotate Cashier passwords; audit `audit_log` |

Session cookies are device-local (`SessionStore`); uninstall clears login.

---

## 7. Security notes

- APK is **session client only** — no merchant keys ([ARCHITECTURE.md](ARCHITECTURE.md) invariants).
- Release keystore lives in Company A secret store — not in git.
- Distribute APK over **HTTPS** or MDM; verify checksum.
- Cashiers cannot change settlement, xPub, matching mode, or fees (server + UI).

---

## Related

- Daily dev reference: [Cashier-Apk.md](Cashier-Apk.md)  
- Deploy context: [M4-01-Deploy-Runbook.md](M4-01-Deploy-Runbook.md)  
- Ops index: [M4-33-Ops-Runbook-Index.md](M4-33-Ops-Runbook-Index.md)
