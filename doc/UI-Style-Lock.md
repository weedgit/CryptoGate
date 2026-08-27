# UI style lock

Fill remaining client fields after they pick Option A, B, or C (or hybrid) from Figma page **00 Client Review**. Implementation below follows the **completed product file** (source of truth).

| Field | Value |
| --- | --- |
| **Selected option** | Product file (not A/B/C bake-off). Guest pay = `E1-pending-payment` |
| **Style name** | Institutional Ink (Geometric Ink & Teal) |
| **Layout name** | Guest pay: single-column mobile; Classic SaaS sidebar for merchant/platform |
| **Locked date** | 2026-08-24 |
| **Client sign-off** | UI complete — [Figma file](https://www.figma.com/design/VjnnzGqWIo1q2aLRLdA89p/Untitled?node-id=0-1) |

## LOCKED STYLE ({{LOCKED_STYLE}})

```
Background ink #0B0F14; surfaces #12181F / #1E2A36 border.
Primary accent teal-cyan #00D4C8.
Warn amber #FFB703.
Anomaly / motion-spec note #FF5A6A (do not show spec stickies in product UI).
Muted text #8A9BB0; footer #5A6A7A.
Type: Outfit (headings / merchant), Geist or IBM Plex Mono (amounts, addresses, countdown).
Glass: 8–12% white fill, 12px radius cards.
No purple gradients, emoji, meme crypto, “Mark paid”, or confetti on Completed.
```

## LOCKED LAYOUT ({{LOCKED_LAYOUT}})

```
Public payment (E1): merchant name first; amount + network as loud as each other;
QR center; countdown under QR; truncated address + copy; wrong-network warning
always visible; “Powered by CryptoGate” footer. No login.
Merchant / platform: left sidebar + header (Classic SaaS) unless client later
chooses Payment-first top nav.
POS: large type, 48dp targets, no settlement / xPub / matching.
```

## Product rules (Figma READ ME)

- Statuses: Pending Payment, Verifying, Confirmed, Completed, Expired, Payment Anomaly, Failed — **never Paid**.
- Matching default: Standard (Mode B). Mode A is Phase 2.
- Cashier cannot see settlement / xPub / matching.
- Agent cannot create payment orders.
- Guest pay must show amount, asset, network, contract, address, expiry, wrong-network warning.

## Notes

- Payment order rail: teal. Service bill rail: amber. Never merge.
- Figma file key: `VjnnzGqWIo1q2aLRLdA89p`
- Guest pay pending node: `29:4197` (`E1-pending-payment`)
- CSS token map: [`UI-Tokens.md`](UI-Tokens.md) (`apps/web` + `apps/payment-page`)
