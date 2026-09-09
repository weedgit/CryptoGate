package com.paymentgate.cashier.hardware

/**
 * ESC/POS-oriented receipt text for 80 mm (Z108S default).
 * Pure Kotlin — unit-testable without SmartPos.
 */
object ReceiptLines {
    private const val RULE = "--------------------------------"

    fun build(job: ReceiptJob): List<ReceiptLine> {
        val lines = mutableListOf<ReceiptLine>()
        if (job.isAnomaly) {
            lines += ReceiptLine("PAYMENT ANOMALY", ReceiptStyle.Title)
            lines += ReceiptLine("Do not treat as completed sale", ReceiptStyle.Body)
            lines += ReceiptLine("Contact supervisor", ReceiptStyle.Body)
        } else {
            lines += ReceiptLine("PaymentGate POS", ReceiptStyle.Title)
            lines += ReceiptLine("CUSTOMER RECEIPT", ReceiptStyle.Subtitle)
        }
        lines += ReceiptLine(RULE, ReceiptStyle.Rule)
        lines += ReceiptLine(job.merchantName, ReceiptStyle.Subtitle)
        lines += ReceiptLine("Order  ${job.orderNumber}", ReceiptStyle.Body)
        lines += ReceiptLine("Time   ${job.printedAt}", ReceiptStyle.Body)
        job.merchantReference?.takeIf { it.isNotBlank() }?.let {
            lines += ReceiptLine("Ref    $it", ReceiptStyle.Body)
        }
        lines += ReceiptLine(RULE, ReceiptStyle.Rule)
        lines += ReceiptLine("Amount ${job.amountLine}", ReceiptStyle.Emphasis)
        lines += ReceiptLine("Asset  ${job.asset}", ReceiptStyle.Body)
        lines += ReceiptLine("Net    ${job.network.uppercase()}", ReceiptStyle.Body)
        lines += ReceiptLine("Addr", ReceiptStyle.Body)
        wrapAddress(job.receiveAddress).forEach { lines += ReceiptLine(it, ReceiptStyle.Mono) }
        lines += ReceiptLine(RULE, ReceiptStyle.Rule)
        lines += ReceiptLine(job.statusLabel.uppercase(), ReceiptStyle.Emphasis)
        if (job.isAnomaly) {
            lines += ReceiptLine("Not a completed sale", ReceiptStyle.Body)
        } else {
            lines += ReceiptLine("Thank you", ReceiptStyle.Body)
        }
        lines += ReceiptLine("Watch-only · no custody", ReceiptStyle.Footer)
        lines += ReceiptLine("", ReceiptStyle.Body)
        lines += ReceiptLine("", ReceiptStyle.Body)
        return lines
    }

    /** ~32 chars visible on 80 mm at default size — wrap address safely. */
    fun wrapAddress(address: String, width: Int = 32): List<String> {
        if (address.length <= width) return listOf(address)
        return address.chunked(width)
    }
}

enum class ReceiptStyle {
    Title,
    Subtitle,
    Body,
    Emphasis,
    Mono,
    Rule,
    Footer,
}

data class ReceiptLine(
    val text: String,
    val style: ReceiptStyle,
)
