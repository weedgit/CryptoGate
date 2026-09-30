/** Tooltip copy for the platform and agent dashboard KPI cards. */

export const PLATFORM_KPI_HELP = {
  merchants:
    "All merchant accounts on the platform. The note shows new merchants in the selected period, or how many are active.",
  agents:
    "All agent (channel partner) accounts. The note shows new agents in the selected period, or how many are active.",
  transactions:
    "Payment orders across all merchants that were paid and fully confirmed in the selected period. The arrow compares with the period before.",
  volume:
    "USD value of all confirmed payment orders across merchants in the selected period. This money goes straight to merchant wallets — it is not platform revenue.",
  platformFees:
    "Platform revenue: service bills merchants paid in the selected period, compared with the total billed to them.",
  successfulPayments:
    "Orders completed in the selected period. Success rate = completed orders ÷ all orders created, so expired and cancelled orders lower it.",
  overdueInvoices:
    "Merchant service bills past their payment window and still unpaid. Merchants with overdue bills are paused until they pay.",
  pendingPayouts:
    "Agent commission the platform still owes — invoiced but not yet paid out to agents.",
  flagged:
    "Payment orders in Attention: payments that could not be matched automatically (wrong amount, late payment, same-amount clash) and need review.",
  backup:
    "Result of the latest automatic database backup. Stale means the last good backup is older than expected; Failed means the last run did not complete.",
} as const;

export const AGENT_KPI_HELP = {
  merchants:
    "Merchant accounts in your channel. The note shows new merchants in the selected period, or how many are active.",
  transactions:
    "Payment orders at your merchants that were paid and fully confirmed in the selected period. The arrow compares with the period before.",
  volume:
    "USD value of confirmed payment orders at your merchants in the selected period. Their platform fees, and so your commission, grow with this volume.",
  merchantFees:
    "Service bills your merchants paid in the selected period, compared with the total billed to them. Your commission is based on paid subscription and volume fees.",
  commission:
    "Your commission: a percentage of the subscription and volume fees your merchants have paid. Activation fees and unpaid bills are not counted.",
} as const;
