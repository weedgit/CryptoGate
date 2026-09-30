package com.paymentgate.cashier.hardware

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReceiptLinesTest {
    private fun job(
        statusLabel: String = "Completed",
        isAnomaly: Boolean = false,
        txHash: String? = null,
    ) = ReceiptJob(
        merchantName = "Casablanca Main",
        orderNumber = "CG-2026-000847",
        printedAt = "2026-08-14 14:02",
        amountLine = "245 USDT",
        asset = "USDT",
        network = "tron",
        receiveAddress = "TX7s39gK1p9ZqR5mY8bV2wXn5uH4qW",
        statusLabel = statusLabel,
        isAnomaly = isAnomaly,
        txHash = txHash,
        cashierName = "Andrew Mikos",
        terminalLabel = "715b77275b6ac8d1",
        invoiceAmount = "$245.00",
        rateLine = "1 USDT = 1.00 USD",
        networkLabel = "TRON · TRC-20",
    )

    private fun texts(lines: List<ReceiptLine>) = lines.flatMap { listOfNotNull(it.text, it.value) }

    @Test
    fun completedReceipt_hasCanonicalStatus_notPaid() {
        val all = texts(ReceiptLines.build(job()))
        assertTrue(all.any { it == "COMPLETED" })
        assertTrue(all.none { it.equals("PAID", ignoreCase = true) })
        assertTrue(all.none { it.contains("SUCCESS", ignoreCase = true) })
        assertTrue(all.any { it.contains("Non-custodial") })
    }

    @Test
    fun receipt_headerIsOrgName_withoutPlatformBranding() {
        val lines = ReceiptLines.build(job())
        assertEquals("CASABLANCA MAIN", lines.first().text)
        assertTrue(texts(lines).none { it.contains("PaymentGate POS") || it.contains("CUSTOMER RECEIPT") })
    }

    @Test
    fun receipt_showsCashierTerminalAndTotal() {
        val lines = ReceiptLines.build(job())
        assertTrue(lines.any { it.text == "Cashier" && it.value == "Andrew Mikos" })
        assertTrue(lines.any { it.text == "Terminal" && it.value == "715b77275b6ac8d1" })
        val total = lines.single { it.style == ReceiptStyle.Total }
        assertEquals("245 USDT", total.value)
    }

    @Test
    fun anomalyReceipt_headerAndWarning() {
        val all = texts(ReceiptLines.build(job(statusLabel = "Attention", isAnomaly = true)))
        assertTrue(all.contains("PAYMENT ANOMALY"))
        assertTrue(all.contains("NOT A COMPLETED SALE"))
        assertFalse(all.contains("SALES RECEIPT"))
    }

    @Test
    fun completedReceipt_includesTxQrWhenPresent() {
        val hash = "ab".repeat(32)
        val lines = ReceiptLines.build(job(txHash = hash))
        val qr = lines.single { it.style == ReceiptStyle.Qr }
        assertTrue(qr.text.endsWith(hash))
        assertTrue(texts(lines).any { it.startsWith("Tx abababab") })
    }

    @Test
    fun pendingReceipt_hasWalletAddressQr() {
        val lines = ReceiptLines.build(
            job(statusLabel = "Pending Payment").copy(awaitingPayment = true, payBefore = "30 Sep 2026 12:50"),
        )
        val qr = lines.single { it.style == ReceiptStyle.Qr }
        assertEquals("TX7s39gK1p9ZqR5mY8bV2wXn5uH4qW", qr.text)
        val all = texts(lines)
        assertTrue(all.contains("PAYMENT REQUEST"))
        assertFalse(all.contains("SALES RECEIPT"))
        assertTrue(all.any { it.startsWith("Send exactly 245 USDT on TRON · TRC-20") })
        assertTrue(lines.any { it.text == "Pay before" && it.value == "30 Sep 2026 12:50" })
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
