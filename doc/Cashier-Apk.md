# Cashier APK (apps/cashier-apk)

**Owner:** Bruce  
**Milestone:** M2-70 scaffold → M2-71 create order → M2-72 QR display → M3-70 status poll → M4-23 flavors → **M5-02 printer** → **M5-03 customer display**

## Invariants

- API client only — no private keys, mnemonics, xPub, or settlement edit screens.
- Session cookie `cg_session` (OpenAPI); never log tokens or passwords.
- Cashier role only on merchant / merchant_site memberships.
- If login returns `mfaRequired: true`, POS blocks with a clear message (MFA stays on web).
- Matching mode / wallet / xPub settings are **not** in the APK (server 403 + UI hide).
- Create order sends only `amount`, `asset`, `network`, `validitySeconds` plus `Idempotency-Key`. Never matchingMode / receiveAddress / fees.
- QR and copy fields come from `GET /v1/orders/{id}/payment` (same payload as the guest page). No “mark paid”.
- Pay screen polls that endpoint every 4s until a terminal status. Anomaly is labeled **Payment anomaly**, never Completed.
- Thermal print (Z108S / SmartPos) is optional hardware — see [M5-02-Cashier-Printer.md](M5-02-Cashier-Printer.md). Generic builds use a no-op printer stub.
- Customer second screen mirrors pay fields only (G5) — see [M5-03-Customer-Display.md](M5-03-Customer-Display.md).

## Open in Android Studio

1. Open folder `apps/cashier-apk` (Gradle project).
2. Set `local.properties` → `sdk.dir=` (Studio usually writes this).
3. Sync Gradle; run **app** on an emulator or handheld (minSdk 26).
4. Debug base URL default: `http://10.0.2.2:3000/v1` (emulator → host API).  
   Override: Gradle flavors **staging** / **prod** (`-Ppaymentgate.stagingApi` / `-Ppaymentgate.prodApi`) — see [M4-05-Env-Matrix.md](M4-05-Env-Matrix.md).

## Release build & install (operators)

Company A / merchant IT: **[M5-08-Cashier-Apk-Install.md](M5-08-Cashier-Apk-Install.md)** — signed APK, SHA-256 manifest (`node scripts/apk-checksum.mjs`), USB / MDM.

Merchant-facing POS chapter: [M4-32-Merchant-Manual.md](M4-32-Merchant-Manual.md) §10.

## Package scripts (monorepo)

```bash
npx pnpm@9.15.0 --filter @paymentgate/cashier-apk test   # scaffold integrity
```

Full APK build requires Android SDK / Studio (not run in CI yet).

## Wireframes

Guest/cashier layout reference: `apps/payment-page/public/pos/index.html`  
Product: `doc/Phase1-Project-Plan.md` §III.
