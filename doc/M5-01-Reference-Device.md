# M5-01 — Reference POS device confirmation

**Owner:** Kevin (doc). **Hardware / SDK:** Bruce (M5-02–M5-03).  
**Milestone:** M5-01 · Phase1-Project-Plan §VI item 3 · M1-44 device class note.

Company A must confirm the **handheld Android POS** make, model, Android version, and vendor SDK **in writing** before Milestone 5 printer/second-screen acceptance. Until signed, Phase 1 accepts the **generic Android APK** ([M5-T05](Milestone-Task-List.md)).

---

## 1. Fill-in (Company A → Kevin)

| Field | Value |
| --- | --- |
| Make / manufacturer | ZCS (Shenzhen ZCS) |
| Model | **Z108S** (Company A / ZCS selected reference SKU) |
| Android version (device) | Android **14.0** (vendor datasheet) — verify on unit at install |
| Target SDK / vendor build | SmartPos pack: `ZCS POS -SDK/SmartPos_2.0.6_R260615_SDK` (AAR: `SmartPos_2.0.4_R260318.aar`). **ZCS: Z108S omitted from written guide only — same SmartPos APIs apply.** |
| Thermal printer SDK name + version | `com.zcs.sdk.Printer` via SmartPos AAR; **default paper width 80 mm** (ZCS confirmed) |
| Customer display / second screen SDK | `Sys.showBitmapOnSecondaryScreen` (and related); Z108S ~**3.95″** customer screen |
| MDM in use (if any) | |
| Quantity for pilot | |
| Primary contact | ZCS support (Kevin) |
| Signed / date | **In progress** — model + paper width confirmed; hardware smoke-test still recommended |

**Attachment:** product datasheet or vendor integration guide (PDF). Local vendor pack: `ZCS POS -SDK/` (not for git push of large binaries unless agreed).

**SDK note:** Official `zcs_pos_guide_EN.pdf` lists Z90 / Z91 / Z92 / Z100; ZCS stated **Z108S was simply omitted from documentation** and uses the same SmartPos SDK. Prefer `PAPER_WIDTH_80MM` (576 px) in print layout (see ZcsSdkDemo `PrintFragment`).

---

## 2. PaymentGate impact

| Feature | Generic APK (now) | Reference device (after M5-01) |
| --- | --- | --- |
| Login, create order, QR | ✓ | ✓ |
| Status poll incl. anomaly | ✓ | ✓ |
| Thermal receipt on Completed | Screen only | M5-02 (Bruce) — see [M5-02-Cashier-Printer.md](M5-02-Cashier-Printer.md) |
| Customer-facing display | N/A | M5-03 (Bruce) — see [M5-03-Customer-Display.md](M5-03-Customer-Display.md) |
| Install path | [M5-08](M5-08-Cashier-Apk-Install.md) | Same + OEM notes |

---

## 3. After sign-off

1. Bruce branches `feat-bruce-cashier-apk-m5-printer` (or vendor-specific slug).
2. Kevin records model in this file (archive PDF in Company A secure share — not git).
3. Retest [M5-08](M5-08-Cashier-Apk-Install.md) §4.4 on reference hardware.
4. Update [M4-32](M4-32-Merchant-Manual.md) §10 if merchant-facing printer steps change.

---

## Related

- [M5-08-Cashier-Apk-Install.md](M5-08-Cashier-Apk-Install.md)  
- [Cashier-Apk.md](Cashier-Apk.md)  
- [Phase1-Project-Plan.md](Phase1-Project-Plan.md) §III
