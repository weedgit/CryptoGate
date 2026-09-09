# M5-02 — Cashier APK thermal printer (Z108S / SmartPos)

**Owner:** Bruce (`apps/cashier-apk`). **Device:** Z108S (see [M5-01-Reference-Device.md](M5-01-Reference-Device.md)).

## Goal

Print customer receipt on Completed (and anomaly template) via `com.zcs.sdk.Printer`. Default paper **80 mm** (576 px). No Mark paid. Watch-only.

## Scaffold (in repo)

| Piece | Path |
| --- | --- |
| Interface | `apps/cashier-apk/.../hardware/ThermalPrinter.kt` |
| 80 mm text layout | `ReceiptLines.kt` (+ unit tests) |
| ZCS impl | `src/zcs/java/.../ZcsSmartPosPrinter.kt` when AAR present |
| Stub | `src/noZcs/java/.../ZcsSmartPosPrinter.kt` when AAR absent |
| Wire-up | Print CTA on `OrderPayScreen` for Completed / Payment Anomaly |

Gradle sets `BuildConfig.HAS_SMARTPOS` and picks the first existing AAR from:

1. `apps/cashier-apk/app/libs/SmartPos*.aar` (gitignored)
2. Vendor pack under `ZCS POS -SDK/SmartPos_2.0.6_…` / `2.0.4_…`

## Device smoke

1. Build staging with AAR on classpath (`HAS_SMARTPOS=true`).
2. Complete a testnet order → **Print customer receipt** (includes **tx hash** when API returns `txHash`).
3. Confirm 80 mm layout; out-of-paper shows clear toast.
4. Anomaly order prints **PAYMENT ANOMALY** header (not Completed).
5. Open order: system Back / Leave asks for confirm (M5-04).

## Out of scope here

- Second screen → [M5-03-Customer-Display.md](M5-03-Customer-Display.md)
- Bluetooth ESC/POS — not needed on Z108S built-in printer
