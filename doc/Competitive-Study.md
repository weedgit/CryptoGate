# Competitive Study — Non-custodial / merchant collection platforms

Refresh: August 2026. Goal: keep PaymentGate Phase 1 on a **true watch-only** fund flow; steal invoice, matching, webhook, role, and fee patterns; do not copy products that *market* non-custody while generating platform-controlled deposit addresses.

Phase 1 target (locked in [Business-Model.md](Business-Model.md)): **payer → merchant wallet (100%)**; platform watches; **service bill** (subscription + volume fee in a min/max band) is a separate rail. Matching modes B / C / D / S: [Phase1-Project-Plan.md](Phase1-Project-Plan.md) Section II.

---

## Three fund-flow models (do not mix the labels)

The market still uses “non-custodial” for three different architectures. PaymentGate copy must only claim **watch-only**.

| Model | What the payer pays | Who can move the coins | How the platform gets paid | Phase 1? |
| --- | --- | --- | --- | --- |
| **Watch-only** | Merchant-controlled address (fixed, memo, or HD from merchant xPub) | Merchant only | Separate bill / prepaid credit / subscription | **Yes — this is Phase 1** |
| **Forwarding** | One-time address the **platform** controls | Platform, then auto-send to merchant minus fee | Skim on the hop | **No** — brief custody |
| **Custody / settlement** | Platform deposit or balance | Platform (withdraw later; often fiat) | Deducted from settlement | **No** — Phase 3 partner territory |

A fourth pattern is **wallet-connect / smart-contract checkout** (payer signs a transfer to the merchant). Funds can still land in the merchant wallet, but checkout is Web3, not hotel-desk “scan this QR from any wallet.” Useful later; not the Phase 1 POS default.

---

## Summary matrix

| Platform | Touches funds? | Headline fee | KYC | Matching | Closest use for PaymentGate |
| --- | --- | --- | --- | --- | --- |
| **BTCPay Server** | No (xPub watch) | 0% (grants; hosts may charge) | No (self-host) | Unique address per invoice | Best **Bitcoin logic** reference |
| **Bitcart** | No (watch / xPub) | 0% (self-host) | No (self-host) | Unique addresses; native USDT ERC-20 / TRC-20 / BEP-20 | Best **open-source USDT** twin |
| **Blockonomics** | No | **1%**, billed monthly (first ~10–20 txs free) | Light / none typical | BTC: xPub unique; **USDT ERC-20: one fixed store address** + amount jitter / `monitor_tx` | Closest **hosted watch-only SaaS** twin |
| **Zaprite** | No (your node / wallet) | **$25/mo** + 1% on API/Woo (capped) | Light | BTC / Lightning / Liquid invoices | SaaS packaging of BTCPay-class watch-only |
| **Paymento** | Claims xPub unique-address; fee via **prepaid top-up** (docs also say fee deducted from payments — **verify hop**) | **0.5%** after ~$3k free | Markets no KYC | Unique HD per chain, including USDT on Tron | Closest **multi-chain hosted** competitor; confirm they do not forward |
| **Shieldz** | No (public key / xPub / view key) | **$0** platform fee | No KYC to start | Fresh address per invoice; optional DEX swap still to merchant wallet | Tiny; steal **verifiable derivation** messaging |
| **CryptAPI** | **Yes** — unique *platform* address, then **auto-forward minus fee** | **0.25–1%** by volume | No account required | Unique pay-in for matching | Features only — **wrong fund flow** |
| **NOWPayments** | **Yes**. **Custody is default (2026)**; “non-custodial” is still deposit → process → payout | ~0.5% same-coin / ~1% convert | Tiered | Unique platform deposit address | Features only — **wrong fund flow** |
| **MoonPay Commerce (Helio)** | Claims no custody; **wallet-connect / DeFi** path to merchant | ~**1–2%** | Merchant KYC/AML | On-chain P2P / contract, not hotel QR | Steal **modern checkout UX**; not Phase 1 POS |
| **Sphere** | Yes (custodial SaaS) | **0.5% + $0.05** | Full merchant KYC | API-first stablecoin | Modern API contrast only |
| **CoinGate** | Yes + fiat settlement | ~1% | Required (licensed) | Platform rails + ledger | **Phase 3** contrast |
| **Plisio** | Yes (`pending internal` move) | 0.5% API / 1.5% white-label | Often none on standard | Invoice addresses + statuses | **Price** competitor |
| **BitPay** | Yes + fiat settlement | ~1–2% + $0.25 | Required | Invoice states + auto refunds | **Enterprise / fiat** contrast |
| **Coinbase Commerce** | Was self-custodial; **shutting down 31 Mar 2026** → **Coinbase Business (custodial)** | was ~1% | Required | Onchain Payments / plugins | Market signal: big brand **exited** watch-only merchant SKU |

---

## 1. BTCPay Server

**What:** Self-hosted open-source Bitcoin (+ Lightning) invoice processor. Still the gold standard for watch-only **logic**. Altcoin / USDT via community plugins and a separate altcoin build — not a first-class multi-USDT hotel product.

**Fund flow:** Merchant xPub → unique address per invoice → funds in merchant wallet. Watch-only recommended.

**Revenue:** Software fee **$0**. Project funded by donations/grants. Hosts may charge for hosting; instance admins can sell subscriptions — not a global % from BTCPay.org.

**Roles:** Store-scoped users + fine-grained API permissions; wallet view/sign/broadcast split. No hotel Agent / Merchant (site) / Cashier tree.

**Steal:** Dual status (`status` + `additionalStatus`); expiry; partial/over/late; underpay tolerance %; seen → confirming → settled; HMAC webhooks; least-privilege API keys; never fulfill on redirect alone.

**Avoid / gaps:** BTC-first; free model ≠ PaymentGate SaaS; always-unique addresses imply a consolidation story on account-model tokens (USDT).

---

## 2. Bitcart (new vs prior study)

**What:** Self-hosted open-source processor in the BTCPay family, **built for many coins** (Bitcoin, ETH, Tron, BSC, Monero, ERC-20 / TRC-20 / BEP-20 USDT, etc.). Optional admin, store, and merchant API. Keys never required on the server (xPub or watched address list).

**Fund flow:** Watch-only. Funds go to the merchant wallet.

**Revenue:** **0%**. Open-source project, not a SaaS company.

**Steal:** Same API shape across coins; USDT on **Tron** as a first-class self-host path; “watch a list of addresses” when xPub is awkward; Lightning optional.

**Avoid / gaps:** Self-host ops; no agent tree, no cashier POS, no service-bill SaaS. PaymentGate is not competing with Bitcart on price — it is competing with merchants who would otherwise run Bitcart themselves.

**Lesson:** For USDT-on-Tron watch-only, Bitcart is a better **engineering** reference than BTCPay. Mode A (always unique HD) in Phase 2 is this model; Mode S is the Phase 1 subset.

---

## 3. Blockonomics

**What:** Hosted non-custodial API + plugins (BTC, BCH, **USDT ERC-20 since late 2025**). Still the closest **SaaS** twin: they watch, they bill **1% monthly**, they never hold keys.

**Fund flow:** BTC/BCH via merchant xPub (unique address). **USDT: one linked ERC-20 address per store** — not regenerated per order. Fee **not** taken from the on-chain payment. USDT checkout increasingly uses **wallet-connect** plus `POST /api/monitor_tx` (server must register the tx hash). **No TRC-20** merchant payments in current docs.

**Revenue:** First ~10–20 txs free, then flat **1%**, billed **monthly** (credit balance in BTC). Address-watcher product is a separate subscription.

**Roles:** Account / store / wallet / API — thin vs PaymentGate org tree.

**Steal:** Separate software bill (aligns with **service bill**); BTC unique-address matching; WebSocket for UX + callback for fulfill; USDT **amount jitter** (Mode C); callback secret; gap-limit awareness; “do not mix personal and merchant traffic on the same watched wallet.”

**Avoid / gaps:** Narrow assets; USDT fixed address (collision risk); no Tron; callback auth weaker than full-body HMAC; wallet-connect as the happy path is a poor fit for hotel guests paying from exchange apps.

**Lesson (reconfirmed 2026):** Even a mature watch-only SaaS still uses **fixed address + amount fingerprint** for USDT. That validates Phase 1 Modes **B / C / S** rather than always-on HD for every chain on day one.

---

## 4. Zaprite (new vs prior study)

**What:** Hosted Bitcoin/Lightning invoicing and POS aimed at merchants who want BTCPay-class non-custody without running a server. Connects to the merchant’s own node or wallet.

**Fund flow:** Watch-only. Coins never sit on Zaprite.

**Revenue:** **Account fee ~$25/month** (or annual). Transaction fee **1%** on API, WooCommerce, event tickets; **capped at $15** per tx. Payment requests / invoices / virtual POS often included in the account fee. Fiat rails stay with the existing card processor.

**Steal:** Subscription **plus** volume fee, billed separately — same two-part structure as PaymentGate, at a lower headline %. Cap is a nice enterprise talking point PaymentGate could offer later for Mid/Enterprise.

**Avoid / gaps:** BTC-centric; not a USDT hotel collection rail; no agent nesting.

---

## 5. Paymento (new vs prior study)

**What:** Hosted gateway that markets itself as “the first non-custodial crypto payment gateway.” Multi-chain, plugins (Woo, WHMCS), payment links, invoices. Strong USDT-on-Tron messaging.

**Fund flow (claimed):** Merchant xPub per chain → unique receive address **inside the merchant wallet** → webhook. That is the PaymentGate Mode A / S story.

**Fee:** ~**$3,000** volume free, then **0.5%**. Merchants **top up** a credit balance (USDT/BTC/ETH; future PMO token for 0.4%). Docs also say fees are “automatically deducted from the processed payments.” Those two sentences cannot both be true for a pure xPub watcher — **verify in a test payment** whether the pay-in address is merchant-derived or a platform forwarder.

**Steal if verified watch-only:** Multi-chain unique address including TRC-20; prepaid **service-credit** instead of skimming; optional customer email.

**Avoid:** Native-token fee discount (PMO) — that is Phase 4 territory. Do not copy “non-custodial” marketing until the hop is proven.

**Lesson:** 0.5% hosted watch-only (if real) is the **price** competitor. PaymentGate’s small-tier ceiling of **2%** only works if the product is ops (org tree, cashier POS, matching modes, agent channel), not “cheapest checkout.”

---

## 6. Shieldz (new, small)

**What:** Hosted watch-only checkout (USDT/USDC on Base, Arbitrum, Optimism, Polygon, Ethereum; BTC; shielded Zcash). **$0** platform fee. Public derivation, signed webhooks, plugins.

**Steal:** “We only store a public key” as a **verifiable** claim; optional swap still settles to the merchant wallet (not a platform balance).

**Avoid:** Zero-fee is not PaymentGate’s model. EVM + BTC, not Tron-first hotel USDT. Early-stage vendor.

---

## 7. CryptAPI (new vs prior study)

**What:** No-account API. Merchant passes a destination address + callback URL; CryptAPI returns `address_in`.

**Fund flow:** Customer → **CryptAPI-controlled unique address** → **automatic forward** to merchant **minus service fee**. Unique address solves matching. That is **forwarding**, not watch-only.

**Revenue:** Volume-tiered **~1% down to 0.25%**.

**Steal:** Unique pay-in for matching; callback `nonce`; underpay/overpay handling.

**Avoid:** Platform keys on the invoice address; fee skim on the hop; “non-custodial” used to mean “we don’t keep it long.”

---

## 8. NOWPayments

**What:** Multi-coin hosted gateway. **2026 change:** official copy now says **NOWPayments is a custodial gateway; custody is enabled by default** for new accounts. “Non-custodial” remains an optional path: customer → **one-time NOWPayments deposit** → internal processing → merchant payout wallet (merchant pays extra network hops).

**Revenue:** ~**0.5%** same-coin, ~**1%** convert / fixed-rate; fee taken in processing.

**Steal:** Unique pay-in for matching; payment covering 0–10%; HMAC-SHA512 IPN; manual IPN resend.

**Avoid:** Deposit-and-forward as Phase 1 architecture; custody default; auto-conversion (Phase 3+). Do not use NOWPayments’ definition of “non-custodial” in PaymentGate sales copy.

---

## 9. MoonPay Commerce (formerly Helio)

**What:** Creator / online checkout acquired by MoonPay (2025). Wallet-connect, subscriptions, Shopify/Woo plugins. Positions as technology provider, not MSB: **peer-to-peer**, funds never held by the platform. Refunds are merchant-to-payer.

**Fund flow:** Payer signs in a wallet; coins go to the merchant. Not a watch-an-address hotel QR for guests who only have an exchange app.

**Revenue:** On the order of **1–2%** (reviews cite ~2% base).

**Steal:** Status honesty (`paid` on-chain is final; platform cannot reverse); team access; modern hosted pay page.

**Avoid:** Making wallet-connect the **only** pay path in Phase 1. Hotel cashiers need a QR that any wallet or exchange withdraw screen can pay.

---

## 10. Sphere, CoinGate, Plisio, BitPay (custodial contrast — unchanged in kind)

**Sphere:** 2024+ Solana/Base/Ethereum stablecoin SaaS. **Custodial.** **0.5% + $0.05**. Steal API/webhook polish only.

**CoinGate:** Licensed EU processor; crypto in, fiat or crypto out. Template for **Phase 3 licensed partner**, not Phase 1 core.

**Plisio:** Invoice → `pending` → **`pending internal`** (move to user wallet) → `completed`. Price competitor at 0.5% / 1.5% white-label. Avoid internal fund move.

**BitPay:** Fiat/crypto settlement; **~2% / 1.5% / 1% + $0.25** deducted from settlement. PaymentGate at a **2% software ceiling** will be compared to BitPay unless the pitch is clearly “ops fee, not settlement.”

---

## 11. Coinbase Commerce — market signal (2026)

Coinbase Commerce (self-custodial merchant checkout) is being **discontinued 31 March 2026**. Successor is **Coinbase Business**, a **custodial** account with monitoring and geographic limits. Some non-US merchants have no migration path.

**Lesson:** Large brands are **retreating from** watch-only merchant SKUs toward licensed custody. That is both a **gap** PaymentGate can occupy (hotels that refuse platform wallets) and a **warning** (banks and app stores still prefer a licensed processor). Stay watch-only in Phase 1; keep Phase 3 as a licensed-partner add-on, not a silent slide into forwarding.

---

## What PaymentGate should steal (consolidated)

1. Watch-only fund flow (BTCPay / Bitcart / Blockonomics / Zaprite).  
2. Status machine + anomaly flags (partial, over, late, wrong network).  
3. HMAC (or verify-hash) webhooks + replay protection + resend + optional re-GET.  
4. Underpay tolerance as a setting (careful with Mode C).  
5. Least-privilege roles; cashiers never change settlement / xPub.  
6. Fee as **service bill** or prepaid credit — never skimmed on-chain. Zaprite’s subscription + capped % is the same shape as PaymentGate’s tier + band.  
7. Mode S for USDT collisions without always sprawling addresses; Bitcart/BTCPay for later Mode A.  
8. Blockonomics USDT: amount jitter + optional wallet-connect `monitor_tx` as an **extra** ERC-20 UX, not the only path.  
9. Honest language: “watch-only.” Do not say “non-custodial” the way NOWPayments and CryptAPI do.

## What PaymentGate must not copy in Phase 1

1. Platform-controlled deposit addresses and auto-forward (CryptAPI, NOWPayments, Plisio internal move).  
2. Custody balances, fiat settlement, platform refunds.  
3. Unsigned webhooks.  
4. Guessing same-amount matches on a shared address.  
5. Wallet-connect-only checkout for counter sales.  
6. Competing on **0%** or **0.5%** against self-host and hosted watch-only SaaS without the org/POS/agent product.

---

## Fee positioning note

| Who | Typical take | What the merchant actually buys |
| --- | --- | --- |
| BTCPay / Bitcart / Shieldz | 0% | Software you run or a tiny hosted watcher |
| Paymento (if truly watch-only) | 0.5% + prepaid | Multi-chain unique address + plugins |
| Blockonomics / Zaprite API | ~1% (+ Zaprite subscription) | Hosted watch-only, BTC-strong |
| PaymentGate small tier | **1.2–2.0%** (default **2%**) + subscription | Hotel org tree, cashier POS, matching modes, agent channel |
| BitPay / Helio-class | ~1–2% | Settlement, compliance, or Web3 checkout |

At the small-tier **2% ceiling**, PaymentGate sits near BitPay’s low-volume **settlement** rate and **above** every true watch-only SaaS in this study. Differentiation must be **true non-custody, USDT matching (especially Mode S), multi-location + cashier POS, and agent-supported onboarding** — not “lowest fee in market.”

Platform Owner still sets global min/max **bands**; agents pick a rate **inside** the band. That is closer to ISO/acquirer pricing than to CryptAPI’s global skim.
