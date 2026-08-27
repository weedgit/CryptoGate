package com.cryptogate.cashier.api

/**
 * POS status copy from OpenAPI OrderStatus. Never invent "paid".
 * Anomaly must not be shown as Completed (M3-71 / M3-72).
 */
object OrderStatusUi {
    const val PENDING = "pending_payment"
    const val VERIFYING = "verifying"
    const val CONFIRMED = "confirmed"
    const val COMPLETED = "completed"
    const val EXPIRED = "expired"
    const val ANOMALY = "payment_anomaly"
    const val FAILED = "failed"
    const val CANCELLED = "cancelled"

    fun label(status: String): String =
        when (status) {
            PENDING -> "Pending Payment"
            VERIFYING -> "Verifying"
            CONFIRMED -> "Confirmed"
            COMPLETED -> "Completed"
            EXPIRED -> "Expired"
            ANOMALY -> "Payment Anomaly"
            FAILED -> "Failed"
            CANCELLED -> "Cancelled"
            else -> status.replace('_', ' ')
        }

    fun isTerminal(status: String): Boolean =
        status == COMPLETED ||
            status == EXPIRED ||
            status == ANOMALY ||
            status == FAILED ||
            status == CANCELLED

    fun isAnomaly(status: String): Boolean = status == ANOMALY

    /** Completed is only the completed enum — never anomaly. */
    fun showsCompleted(status: String): Boolean = status == COMPLETED
}
