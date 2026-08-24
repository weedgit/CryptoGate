# M5-01 — Reference POS device confirmation

**Owner:** Kevin (doc). **Hardware / SDK:** Bruce (M5-02–M5-03).  
**Milestone:** M5-01 · Phase1-Project-Plan §VI item 3 · M1-44 device class note.

Company A must confirm the **handheld Android POS** make, model, Android version, and vendor SDK **in writing** before Milestone 5 printer/second-screen acceptance. Until signed, Phase 1 accepts the **generic Android APK** ([M5-T05](Milestone-Task-List.md)).

---

## 1. Fill-in (Company A → Kevin)

| Field | Value |
| --- | --- |
| Make / manufacturer | |
| Model | |
| Android version (device) | |
| Target SDK / vendor build | |
| Thermal printer SDK name + version | |
| Customer display / second screen SDK | |
| MDM in use (if any) | |
| Quantity for pilot | |
| Primary contact | |
| Signed / date | |

**Attachment:** product datasheet or vendor integration guide (PDF).

---

## 2. CryptoGate impact

| Feature | Generic APK (now) | Reference device (after M5-01) |
| --- | --- | --- |
| Login, create order, QR | ✓ | ✓ |
| Status poll incl. anomaly | ✓ | ✓ |
| Thermal receipt on Completed | Screen only | M5-02 (Bruce) |
| Customer-facing display | N/A | M5-03 (Bruce) |
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
