package com.paymentgate.cashier.hardware

import android.graphics.Bitmap
import com.paymentgate.cashier.api.AssetNetworkCatalog
import com.paymentgate.cashier.api.OrderStatusUi
import com.paymentgate.cashier.api.PaymentDetails
import com.paymentgate.cashier.ui.ConfirmationPhase
import com.paymentgate.cashier.ui.confirmationProgress

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

    data class Failed(val detail: String): CustomerDisplayOutcome()
}

data class CustomerPayContent(
    val amountLine: String,
    val networkLabel: String,
    val wrongNetworkWarning: String,
    val qrPayload: String,
    /** When true, still show QR but emphasize not completed. */
    val isAnomaly: Boolean = false,
    val statusHint: String? = null,
    /** V3 confirmation strip — Requested / Detected / Confirming / Paid. */
    val phaseTitle: String = "PAYMENT REQUESTED",
    val progressLabel: String = "Waiting for transaction",
    val confirmations: Int = 0,
    val requiredConfirmations: Int = 0,
    val hideQr: Boolean = false,
)

object CustomerScreen {
    /** Z108S ~3.95″ customer panel — design target square. */
    const val WIDTH_PX = 480
    const val HEIGHT_PX = 480
}

fun PaymentDetails.toCustomerPayContent(): CustomerPayContent {
    val progress =
        confirmationProgress(
            status = status,
            confirmations = confirmations,
            requiredConfirmations = requiredConfirmations.coerceAtLeast(1),
        )
    val shortNet =
        AssetNetworkCatalog.find(asset, network, null)?.shortNetworkLabel
            ?: network.uppercase()
    val phaseTitle =
        when (progress.phase) {
            ConfirmationPhase.Paid -> "PAYMENT CONFIRMED"
            ConfirmationPhase.Anomaly -> "PAYMENT ANOMALY"
            ConfirmationPhase.Expired -> "PAYMENT EXPIRED"
            ConfirmationPhase.Detected -> "PAYMENT DETECTED"
            ConfirmationPhase.Confirming -> "CONFIRMING PAYMENT"
            else -> "PAYMENT REQUESTED"
        }
    return CustomerPayContent(
        amountLine = "${payableAmount.amount} $asset",
        networkLabel = shortNet,
        wrongNetworkWarning =
            wrongNetworkWarning.ifBlank {
                "Send on ${shortNet.substringBefore(" ·").ifBlank { network.uppercase() }} only"
            },
        qrPayload = qrPayload,
        isAnomaly = OrderStatusUi.isAnomaly(status),
        statusHint = progress.detail.ifBlank { null },
        phaseTitle = phaseTitle,
        progressLabel =
            when (progress.phase) {
                ConfirmationPhase.Confirming -> "Confirming payment"
                ConfirmationPhase.Detected -> "Transaction found"
                ConfirmationPhase.Paid -> "Paid"
                ConfirmationPhase.Anomaly -> "Do not treat as paid"
                ConfirmationPhase.Expired -> progress.title
                else -> "Waiting for transaction"
            },
        confirmations = progress.confirmations,
        requiredConfirmations = progress.requiredConfirmations,
        hideQr = OrderStatusUi.showsCompleted(status) || OrderStatusUi.isAnomaly(status),
    )
}
