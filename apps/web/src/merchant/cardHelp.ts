/** Merchant-facing tooltip copy for cards outside the Settlement tab. */

export const CARD_HELP = {
  // Dashboard KPIs
  totalTransactions:
    "Orders that were paid and fully confirmed on the blockchain in the selected period. The arrow compares with the period before.",
  openOrders:
    "Orders still in progress: Pending (waiting for the customer to pay) plus Verifying (payment seen on the blockchain, waiting for confirmations).",
  attention:
    "Orders where a payment could not be matched automatically — for example a wrong amount, a payment after the order expired, or two open orders with the same amount. Open the order to review and resolve it.",
  expiringSoon:
    "Open orders whose payment window ends shortly. If the customer has not paid yet, they may need a new QR code.",
  platformFee:
    "An estimate of this month's PaymentGate fee: your monthly subscription plus the volume fee on confirmed payment volume. The final amount appears on your service bill.",

  // Dashboard panels
  networkStatus:
    "Whether each blockchain can take payments right now. Online: working normally. Paused: maintenance or a slow connection — new orders may be blocked until it clears. Down: PaymentGate cannot read the chain at the moment. Off: not enabled.",
  openAttention:
    "The most recent orders that need a person to look at them. Each shows why it was flagged.",
  sites:
    "Orders and payment volume for each of your sites (branches or stores) in the selected period.",
  channels:
    "Where orders were created: POS app, web terminal, or API (your own system). Share is the percentage of orders.",
  cashiers:
    "Sales per cashier in the selected period. Cashiers without a POS PIN cannot sign in to the POS app.",
  networksAssets:
    "Which tokens you can accept on which blockchains, with their status and minimum amounts.",
  recentOrders: "Your latest payment orders. Open one to see its payment and confirmation details.",

  // Service bills
  serviceBills:
    "Service bills are PaymentGate's invoices to you — separate from your customers' payments. Each month you pay a subscription plus a volume fee on confirmed payment volume.",
  nextBill:
    "An estimate of your next monthly bill and the date it will be issued. The amount can still change with this month's volume.",
  dueNow:
    "Unpaid bills you can pay now. Bills left unpaid past the payment window pause your account until they are paid.",
  yourPlan:
    "Your monthly subscription. The volume fee is added on top, based on confirmed payment volume.",

  // Networks
  networks:
    "Blockchains available to your account. The status light shows whether each can take payments right now.",
  confirmations:
    "How many blockchain blocks must follow a payment before the order is Completed. More confirmations are safer but slower. PaymentGate sets a minimum; you can require more, never less. Applies to new orders.",
  minAmounts:
    "The smallest order PaymentGate accepts for each token on this network. Set by PaymentGate.",

  // Team
  team:
    "People who can sign in to this account. Owner: full control, including wallets and team. Administrator: runs daily operations but cannot add or remove members or change the wallet. Viewer: read-only. Cashier: creates and manages only their own orders.",
  teamRole:
    "What this person can do. Owner and Administrator manage the account, Viewer can only look, and Cashier works the counter with their own orders only.",
  teamMfa:
    "Whether the person has set up an authenticator app. It is needed for sensitive actions such as changing wallets.",

  // Alerts
  alerts:
    "Choose how you are told about each event: by email, in the app, or both. These settings are yours only — each teammate picks their own.",

  // Order detail
  orderTimeline:
    "Each step this order went through, with times. Pending: waiting for payment. Verifying: payment seen on the blockchain. Completed: fully confirmed. It may also end as Expired, Cancelled, or Attention.",
  chainConfirmations:
    "How many blocks have been added after the payment. Once the required number is reached the order is Completed and it is safe to hand over goods (unless your fulfillment policy allows earlier release).",
  webhookDeliveries:
    "Messages PaymentGate sent to your own system about this order (for example when it was paid). Failed deliveries are retried automatically, and admins can resend one manually.",
  orderAttention:
    "This payment could not be matched automatically. Check the reason and the transaction, then resolve the order.",

  // Cashier shift
  shiftCompleted: "Total of your orders completed today, in USD.",
  shiftOpen:
    "Your orders still waiting for the customer to pay or for blockchain confirmations.",
  shiftAttention:
    "Your orders with a payment problem, such as a wrong amount. Ask a manager to review them.",
} as const;
