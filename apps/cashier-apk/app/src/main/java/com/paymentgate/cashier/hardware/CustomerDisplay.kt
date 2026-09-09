package com.paymentgate.cashier.hardware

import android.graphics.Bitmap
import com.paymentgate.cashier.api.OrderStatusUi
import com.paymentgate.cashier.api.PaymentDetails

/**
 * Customer-facing second screen (M5-03 / G5).
 * QR + amount + network + wrong-network warning only — no staff controls.
 */
interface CustomerDisplay {
    fun isAvailable(): Boolean

    /** Blocking — call off main thread. */
    fun showPay(content: CustomerPayContent): CustomerDisplayOutcome

    /** Idle / clear after order leaves active pay state. */
    fun showIdle(): CustomerDisplayOutcome
}

sealed class CustomerDisplayOutcome {
    data object Ok : CustomerDisplayOutcome()

    data class Failed(val detail: String) : CustomerDisplayOutcome()
}

data class CustomerPayContent(
    val amountLine: String,
    val networkLabel: String,
    val wrongNetworkWarning: String,
    val qrPayload: String,
    /** When true, still show QR but emphasize not completed. */
    val isAnomaly: Boolean = false,
    val statusHint: String? = null,
)

object CustomerScreen {
    /** Z108S ~3.95″ customer panel — design target square. */
    const val WIDTH_PX = 480
    const val HEIGHT_PX = 480
}

fun PaymentDetails.toCustomerPayContent(): CustomerPayContent =
    CustomerPayContent(
        amountLine = "${payableAmount.amount} $asset",
        networkLabel = network.uppercase(),
        wrongNetworkWarning = wrongNetworkWarning,
        qrPayload = qrPayload,
        isAnomaly = OrderStatusUi.isAnomaly(status),
        statusHint =
            when {
                OrderStatusUi.isAnomaly(status) -> OrderStatusUi.label(status)
                OrderStatusUi.showsCompleted(status) -> OrderStatusUi.label(status)
                status == OrderStatusUi.VERIFYING -> OrderStatusUi.label(status)
                else -> null
            },
    )
