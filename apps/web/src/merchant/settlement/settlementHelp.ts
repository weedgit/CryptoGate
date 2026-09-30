/** Merchant-facing tooltip copy for the Settlement tab. */

export const SETTLEMENT_HELP = {
  mfa:
    "Changing a wallet address or public key asks for your authenticator code first, so a stolen password alone cannot redirect your payments.",

  addresses:
    "The wallet on each network where customers send payments. Funds go straight to your wallet — PaymentGate only watches the chain and never holds or moves money. One address covers every token on that network (for example USDT and TRX on Tron). Only the Owner can change it.",

  addressStatus:
    "Active: new orders use this address. Cool-down: a new address was saved and takes over when the countdown ends; until then new orders keep using the current one, so a payment already on its way is not lost. Mixed: tokens on this network point to different addresses — save once to use a single wallet.",

  fulfillment:
    "Decides when staff may hand over goods for a paid order. Payments first show as Verifying (seen on the blockchain) and become Completed once enough confirmations arrive. Changes apply to new orders only.",

  cashierChannel:
    "Controls whether cashiers may create payment orders on the web terminal or only in the POS app. Owners and admins can always charge on the web. Sites follow the parent merchant's choice.",

  cashierWebAndPos:
    "Cashiers can create orders from the browser terminal and from the POS app. Good when staff use a shared computer or tablet at the counter.",

  cashierPosOnly:
    "Cashiers can create orders only in the POS app. On the web they still see their shift and past orders. Use this when all charging should happen on the POS app.",

  pricing:
    "Invoices are usually priced in USD or EUR, but customers pay in crypto. This decides which exchange rate turns the invoice into the token amount the customer pays. Rates come from several exchanges and the middle value (median) is used. Changes apply to new quotes only.",

  pricingPegged:
    "For stablecoins (USDT, USDC): 1 token = $1.00 as long as the market price stays close to $1 (within the platform's depeg limit). If a stablecoin drifts further, the live rate is used instead so you are not underpaid. ETH and TRX always use the live rate.",

  pricingMarket:
    "Every token, including stablecoins, uses the live market rate at the moment the customer is quoted. Customers may pay, for example, 100.12 USDT for a $100 invoice.",

  pricingUsdToToken:
    "You enter the price in USD and the customer is asked for the matching token amount. Priced the same way as Always market: the live rate when the quote is made.",

  pricingTokenToUsd:
    "Priced the same way as Always market: the live rate when the quote is made, which also gives the USD value of what the customer paid.",

  quoteLock:
    "How long the quoted token amount stays valid, counted from when the order is created or re-quoted. If the customer pays within this time the amount is guaranteed even if the market moves. The payment window closes when the lock ends (or earlier if the order's validity is shorter); an open order can be re-quoted at the new rate before then.",

  hdPool:
    "Used only by Smart address matching. You register a watch-only public key (xPub) from your wallet; PaymentGate derives extra receive addresses from it when two open orders need the same amount at the same time. The addresses belong to your wallet — PaymentGate cannot spend from them.",

  hdXpub:
    "Configured: extra addresses can be created for this token and network. Cool-down: a new key was saved and takes over when the countdown ends. Not set: Smart address uses only your main address, like Standard matching.",

  hdFree: "Derived addresses ready to be given to the next order that needs one.",

  hdInUse: "Addresses currently assigned to an open order and waiting for its payment.",

  hdCooldown:
    "Addresses whose order has ended. They rest for a while so a late payment is still matched to the right order, then return to Free.",

  hdRotate:
    "Paste the watch-only extended public key from your wallet. Replacing an existing key starts a cool-down: the current key stays in use until the countdown ends. Your authenticator code is required. Never paste spend keys or seed phrases.",
} as const;
