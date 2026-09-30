package com.paymentgate.cashier.hardware

/**
 * Receipt layout for the 80 mm thermal head (Z108S default).
 * Pure Kotlin — unit-testable without SmartPos; the printer decides fonts and rule drawing.
 */
object ReceiptLines {
    fun build(job: ReceiptJob): List<ReceiptLine> {
        val lines = mutableListOf<ReceiptLine>()
        job.logoDataUrl?.takeIf { it.startsWith("data:image") }?.let {
            lines += ReceiptLine(it, ReceiptStyle.Logo)
        }
        lines += ReceiptLine(job.merchantName.uppercase(), ReceiptStyle.Title)
        lines += ReceiptLine("", ReceiptStyle.Rule)

        if (job.isAnomaly) {
            lines += ReceiptLine("PAYMENT ANOMALY", ReceiptStyle.Subtitle)
            lines += ReceiptLine("Not a completed sale · contact supervisor", ReceiptStyle.Footer)
        } else if (job.awaitingPayment) {
            lines += ReceiptLine("PAYMENT REQUEST", ReceiptStyle.Subtitle)
            lines += ReceiptLine("Not paid yet · provisional slip", ReceiptStyle.Footer)
        } else {
            lines += ReceiptLine("SALES RECEIPT", ReceiptStyle.Subtitle)
        }
        lines += ReceiptLine("", ReceiptStyle.Spacer)

        lines += row("Invoice", job.orderNumber)
        lines += row("Date", job.createdAt ?: job.printedAt)
        job.cashierName?.takeIf { it.isNotBlank() }?.let { lines += row("Cashier", it) }
        job.terminalLabel?.takeIf { it.isNotBlank() }?.let { lines += row("Terminal", it) }
        job.merchantReference?.takeIf { it.isNotBlank() }?.let { lines += row("Note", it) }

        if (job.invoiceAmount != null || job.rateLine != null) {
            lines += ReceiptLine("", ReceiptStyle.Rule)
            job.invoiceAmount?.let { lines += row("Invoice amount", it) }
            job.rateLine?.let { lines += row("Rate", it) }
        }

        lines += ReceiptLine("", ReceiptStyle.DoubleRule)
        lines += ReceiptLine("TOTAL", ReceiptStyle.Total, job.amountLine)
        lines += ReceiptLine("", ReceiptStyle.DoubleRule)

        lines += row("Network", job.networkLabel ?: job.network.uppercase())
        lines += row("Paid to", shorten(job.receiveAddress))
        lines += ReceiptLine("Status", ReceiptStyle.KeyValueStrong, job.statusLabel.uppercase())
        job.paidAt?.let { lines += row("Paid at", it) }

        if (job.awaitingPayment && job.receiveAddress.isNotBlank()) {
            job.payBefore?.let { lines += ReceiptLine("Pay before", ReceiptStyle.KeyValueStrong, it) }
            lines += ReceiptLine("", ReceiptStyle.Rule)
            lines += ReceiptLine(job.receiveAddress, ReceiptStyle.Qr)
            lines += ReceiptLine("Scan with your wallet to pay", ReceiptStyle.Body)
            lines += ReceiptLine(
                "Send exactly ${job.amountLine} on ${job.networkLabel ?: job.network.uppercase()}",
                ReceiptStyle.Footer,
            )
            wrapAddress(job.receiveAddress).forEach { lines += ReceiptLine(it, ReceiptStyle.Mono) }
        }

        job.txHash?.takeIf { it.isNotBlank() }?.let { hash ->
            lines += ReceiptLine("", ReceiptStyle.Rule)
            lines += ReceiptLine(ChainExplorer.txUrl(job.network, hash) ?: hash, ReceiptStyle.Qr)
            lines += ReceiptLine("Scan to verify this payment", ReceiptStyle.Body)
            lines += ReceiptLine("Tx ${shorten(hash)}", ReceiptStyle.Footer)
        }

        lines += ReceiptLine("", ReceiptStyle.Rule)
        if (job.isAnomaly) {
            lines += ReceiptLine("NOT A COMPLETED SALE", ReceiptStyle.Subtitle)
        }
        lines += ReceiptLine("Non-custodial crypto payment", ReceiptStyle.Footer)
        lines += ReceiptLine("Printed ${job.printedAt}", ReceiptStyle.Footer)
        lines += ReceiptLine("", ReceiptStyle.Spacer)
        lines += ReceiptLine("", ReceiptStyle.Spacer)
        return lines
    }

    private fun row(label: String, value: String) = ReceiptLine(label, ReceiptStyle.KeyValue, value)

    /** "TX7s39…H4qW" — the QR carries the full value. */
    fun shorten(value: String, head: Int = 8, tail: Int = 6): String =
        if (value.length <= head + tail + 1) value else "${value.take(head)}…${value.takeLast(tail)}"

    /** ~32 chars visible on 80 mm at default size — wrap long values safely. */
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
    Footer,
    /** Empty line. */
    Spacer,
    /** Thin dashed divider across the paper. */
    Rule,
    /** Two solid lines around the total. */
    DoubleRule,
    /** Label on the left, [ReceiptLine.value] on the right. */
    KeyValue,
    /** Like [KeyValue] with a bold value. */
    KeyValueStrong,
    /** Large bold label/value pair. */
    Total,
    /** [ReceiptLine.text] is a `data:image/...` logo, printed centred. */
    Logo,
    /** [ReceiptLine.text] is the QR payload, printed as a centred QR code. */
    Qr,
}

data class ReceiptLine(
    val text: String,
    val style: ReceiptStyle,
    val value: String? = null,
)
