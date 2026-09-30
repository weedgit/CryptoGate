package com.paymentgate.cashier.hardware

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ChainExplorerTest {
    @Test
    fun txUrl_matchesWebExplorerHosts() {
        assertEquals("https://tronscan.org/#/transaction/abc", ChainExplorer.txUrl("tron", "abc"))
        assertEquals("https://nile.tronscan.org/#/transaction/abc", ChainExplorer.txUrl("tron_nile", "abc"))
        assertEquals("https://etherscan.io/tx/0xabc", ChainExplorer.txUrl("ethereum", "0xabc"))
        assertEquals("https://solscan.io/tx/abc", ChainExplorer.txUrl("solana", "abc"))
        assertNull(ChainExplorer.txUrl("bitcoin", "abc"))
    }

    @Test
    fun receipt_withTx_hasExplorerQr() {
        val job = ReceiptJob(
            merchantName = "Shop",
            orderNumber = "CG-1",
            printedAt = "now",
            amountLine = "10 USDT",
            asset = "USDT",
            network = "tron_nile",
            receiveAddress = "TAddr",
            statusLabel = "Paid",
            isAnomaly = false,
            txHash = "deadbeef",
        )
        val qr = ReceiptLines.build(job).filter { it.style == ReceiptStyle.Qr }
        assertEquals(1, qr.size)
        assertTrue(qr.single().text.endsWith("/transaction/deadbeef"))
    }

    @Test
    fun receipt_withoutTx_hasNoQr() {
        val job = ReceiptJob(
            merchantName = "Shop",
            orderNumber = "CG-1",
            printedAt = "now",
            amountLine = "10 USDT",
            asset = "USDT",
            network = "tron",
            receiveAddress = "TAddr",
            statusLabel = "Pending",
            isAnomaly = false,
        )
        assertTrue(ReceiptLines.build(job).none { it.style == ReceiptStyle.Qr })
    }
}
