# CryptoGate / PaymentGate — Designer Brief (Phase 1)

**Audience:** UI/UX designer  
**Product:** Non-custodial crypto payment gateway  
**Goal of redesign:** Clearer, simpler screens — less “ops ERP”, more “payment product”

---

## 1. What the platform is

Merchants collect crypto from customers into **their own wallet**.  
CryptoGate does **not** hold private keys and does **not** move customer or merchant funds.

We provide:
1. Create payment request (order)
2. Show QR / pay link / amount / network / address
3. Watch the blockchain and match payment → order
4. Update dashboards
5. Send signed webhooks to merchant systems
6. Bill platform fees separately (**service bills**, not taken from customer payments)

---

## 2. Org types vs user roles (do not mix)

| Org account (company/node) | Who it is |
| --- | --- |
| **Platform** | CryptoGate operator |
| **Agent** | Partner who brings merchants |
| **Merchant** | Business that collects payments |
| **Merchant (site)** | Store / outlet under a multi-location merchant |

| User role (person inside an org) | What they do |
| --- | --- |
| **Owner** | Full control in that org |
| **Administrator** | Day-to-day ops |
| **Viewer** | Read-only |
| **Cashier** | Create/manage own payment orders only (merchant/site) |

**Phase 1 redesign preference (pending client lock):**
- Keep tree simple: Platform → Agent → Merchant → Cashier  
- Keep **Merchant (site)** as **branches/locations only** (same wallet & billing as parent)  
- Avoid deep **sub-agent** complexity in new UI  
- Do **not** design full KYC/KYB or Memo/Tag matching as primary flows yet  

---

## 3. Apps / surfaces to design

| Surface | Users | Priority |
| --- | --- | --- |
| Merchant portal | Merchant O/A/V + Cashier | **P0** |
| Public payment page | Payer (no login) | **P0** |
| Platform portal | Platform staff | **P1** |
| Agent portal | Agent O/A/V | **P1** |
| Cashier APK / POS | Cashier on device | **P2** |
| Service bill checkout | Merchant paying platform fees | **P2** |

**Suggested start order:** Design system → Merchant dashboard → Create order → Order detail → Payment page → Platform/Agent dashboards.

---

## 4. Key screens (must get right)

### Merchant
- Login / forgot password / MFA  
- Dashboard (simple KPIs — payments, open issues)  
- Orders list + create order + order detail  
- Settlement / receive address (Owner/Admin only; cool-down UX)  
- Team (invite roles)  
- API keys & webhooks (not for Cashier/Agent)  
- Service bills (amber rail — separate from payment orders)

### Payment page (guest)
- Merchant name  
- Amount + asset + network (loud, equal weight)  
- QR + countdown  
- Address + copy  
- Wrong-network warning always visible  
- Statuses: Pending → Verifying → Completed / Expired / Anomaly  
- **Never** label status as “Paid”  
- Footer: Powered by PaymentGate  

### Platform
- Overview dashboard  
- Merchants / Agents onboarding  
- Anomalies / attention queue  
- Networks catalog + maintenance  
- Fee tiers / billing settings  
- Audit log  

### Agent
- Dashboard for their merchants  
- Onboard merchants  
- Commissions (not taken from customer payment)  
- **Cannot** create payment orders or change merchant receive wallet  

---

## 5. Visual / product rules (locked)

From current style lock — redesign may refresh look, but keep these product rules:

- Dark institutional base; teal accent for **payment orders**; amber for **service bills**  
- No purple meme-crypto look, no confetti on Completed  
- Amounts/addresses: monospace  
- Hide unavailable actions in UI (don’t only block in API)  
- Cashier: no settlement / xPub / matching / API secrets  
- Agent: no merchant API secrets; no receive-address edit  

---

## 6. Do / Don’t

| Do | Don’t |
| --- | --- |
| Use terms: payment order, service bill, merchant, site, cashier | Say guest invoice, sub-merchant, branch (prefer “site”), Mark paid |
| Make create-order and pay-page dead simple | Overwhelm dashboards with every metric |
| Design for multi-location as light sites under one merchant | Design deep agent→sub-agent→sub-agent trees |
| Show wrong-network / expiry risk clearly on pay page | Promise “payment impossible after expiry” or “all wrong networks detected” |
| Separate payment rail vs platform billing rail | Mix customer payment and platform fee in one checkout |

---

## 7. Source documents

| Doc | Use for |
| --- | --- |
| `doc/UI-Page-Spec.md` | Full screen inventory |
| `doc/UI-Figma-Prompt.md` | Figma AI prompts + terminology |
| `doc/UI-Style-Lock.md` / `UI-Tokens.md` | Current visual tokens |
| `doc/Business-Model.md` | Roles, money flow, boundaries |
| Existing Figma | https://www.figma.com/design/VjnnzGqWIo1q2aLRLdA89p/Untitled |

---

## 8. Out of scope for this redesign pass

- Full KYC/KYB onboarding forms  
- Phone/SMS OTP (unless product confirms)  
- Memo/Tag matching UI as default  
- Full multi-chain wallet URI certification screens  
- Exchange / custody / fiat settlement features  

---

**One-line product promise for every screen:**  
*Customer pays the merchant’s wallet on-chain; CryptoGate watches, matches, and notifies — it never holds the money.*
