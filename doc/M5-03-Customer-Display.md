# M5-03 — Customer second screen (Z108S / SmartPos)

**Owner:** Bruce (`apps/cashier-apk`). **Depends:** [M5-01](M5-01-Reference-Device.md). **Related:** [M5-02-Cashier-Printer.md](M5-02-Cashier-Printer.md).

## Goal

Show **G5** on the customer-facing LCD while a payment order is active:

- Amount + asset  
- Network  
- Wrong-network warning  
- QR (`qrPayload` from payment API)  
- No staff controls, no Mark paid  

Z108S panel ~**3.95″**; design bitmap **480×480**.

## Scaffold

| Piece | Path |
| --- | --- |
| Interface | `hardware/CustomerDisplay.kt` |
| Bitmap renderer | `hardware/CustomerPayBitmap.kt` |
| ZCS impl | `src/zcs/.../ZcsCustomerDisplay.kt` → `Sys.showBitmapOnSecondaryScreen` |
| Stub | `src/noZcs/.../ZcsCustomerDisplay.kt` |
| Wire-up | `MainActivity` `LaunchedEffect` on Pay screen status / QR |

Same `HAS_SMARTPOS` / AAR rules as M5-02.

## Behaviour

| Cashier state | Second screen |
| --- | --- |
| Pay · Pending / Verifying / Confirmed | Pay bitmap |
| Pay · Completed / Payment Anomaly | Same layout + status hint (anomaly header) |
| Leave Pay / Expired / Cancelled / Failed | Idle “PaymentGate · Ready” |
| No AAR / generic phone | No-op (`isAvailable() == false`) |

## Device smoke

1. Create order on Z108S → customer LCD shows amount, network, warning, QR matching cashier.  
2. Complete order → status hint updates; after New order → idle.  
3. Anomaly → coral **PAYMENT ANOMALY** title; never “Paid”.
