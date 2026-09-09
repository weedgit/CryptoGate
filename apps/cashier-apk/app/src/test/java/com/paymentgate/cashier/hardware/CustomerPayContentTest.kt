package com.paymentgate.cashier.hardware

import com.paymentgate.cashier.api.Money
import com.paymentgate.cashier.api.OrderStatusUi
import com.paymentgate.cashier.api.PaymentDetails
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CustomerPayContentTest {
    @Test
    fun mapsG5Fields_fromPaymentDetails() {
        val content =
            sample(status = OrderStatusUi.PENDING).toCustomerPayContent()
        assertEquals("245.00 USDT", content.amountLine)
        assertEquals("TRON", content.networkLabel)
        assertTrue(content.wrongNetworkWarning.contains("Tron"))
        assertEquals("qr-payload", content.qrPayload)
        assertFalse(content.isAnomaly)
    }

    @Test
    fun anomaly_setsFlagAndHint() {
        val content =
            sample(status = OrderStatusUi.ANOMALY).toCustomerPayContent()
        assertTrue(content.isAnomaly)
        assertEquals("Payment Anomaly", content.statusHint)
    }

    @Test
    fun customerScreen_isSquare480() {
        assertEquals(480, CustomerScreen.WIDTH_PX)
        assertEquals(480, CustomerScreen.HEIGHT_PX)
    }

    private fun sample(status: String) =
        PaymentDetails(
            orderNumber = "#CG-1",
            status = status,
            merchantName = "Casablanca Main",
            matchingMode = "B",
            paymentPageUrl = "https://pay.example/o/1",
            qrPayload = "qr-payload",
            receiveAddress = "TXabc",
            payableAmount = Money("245.00", "USDT"),
            copyAmount = "245.00",
            asset = "USDT",
            network = "tron",
            expiresAt = "2026-08-14T14:30:00Z",
            wrongNetworkWarning = "Customer must send on Tron TRC-20 ONLY.",
            payExactAmountWarning = null,
            memoOrTag = null,
            memoWarning = null,
            contractAddress = null,
        )
}
