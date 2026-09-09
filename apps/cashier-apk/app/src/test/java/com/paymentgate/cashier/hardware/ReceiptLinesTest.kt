package com.paymentgate.cashier.hardware

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ReceiptLinesTest {
    @Test
    fun completedReceipt_hasCanonicalStatus_notPaid() {
        val lines =
            ReceiptLines.build(
                ReceiptJob(
                    merchantName = "Casablanca Main",
                    orderNumber = "#CG-0847",
                    printedAt = "2026-08-14 14:02",
                    amountLine = "245.00 USDT",
                    asset = "USDT",
                    network = "tron",
                    receiveAddress = "TX7s39gK1p9ZqR5mY8bV2wXn5uH4qW",
                    statusLabel = "Completed",
                    isAnomaly = false,
                ),
            )
        val texts = lines.map { it.text }
        assertTrue(texts.any { it.contains("Completed", ignoreCase = true) })
        assertTrue(texts.none { it.equals("PAID", ignoreCase = true) })
        assertTrue(texts.none { it.contains("SUCCESS", ignoreCase = true) })
        assertTrue(texts.any { it.contains("Watch-only") })
    }

    @Test
    fun anomalyReceipt_headerAndWarning() {
        val lines =
            ReceiptLines.build(
                ReceiptJob(
                    merchantName = "Casablanca Main",
                    orderNumber = "#CG-0845",
                    printedAt = "2026-08-14 12:15",
                    amountLine = "350.00 USDT",
                    asset = "USDT",
                    network = "tron",
                    receiveAddress = "TXabc",
                    statusLabel = "Payment Anomaly",
                    isAnomaly = true,
                ),
            )
        assertEquals("PAYMENT ANOMALY", lines.first().text)
        assertTrue(lines.any { it.text.contains("Not a completed sale") })
    }

    @Test
    fun wrapAddress_chunksLongAddress() {
        val addr = "A".repeat(70)
        val parts = ReceiptLines.wrapAddress(addr, 32)
        assertEquals(3, parts.size)
        assertEquals(32, parts[0].length)
        assertEquals(6, parts[2].length)
    }
}
