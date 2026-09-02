package com.paymentgate.cashier.api

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class JsonParsersTest {
    @Test
    fun parseLogin_cashierMembership() {
        val body =
            """
            {
              "mfaRequired": false,
              "session": {
                "userId": "u1",
                "email": "cashier@example.com",
                "memberships": [
                  { "orgId": "m1", "userId": "u1", "role": "cashier", "orgType": "merchant" }
                ]
              }
            }
            """.trimIndent()
        val result = JsonParsers.parseLoginResponse(body)
        assertFalse(result.mfaRequired)
        assertTrue(SessionRules.hasCashierMembership(result.session))
        assertEquals("cashier@example.com", result.session.email)
    }

    @Test
    fun rejectOwnerWithoutCashier() {
        val session = JsonParsers.parseSession(
            JSONObject(
                """
                {
                  "userId": "u1",
                  "email": "owner@example.com",
                  "memberships": [
                    { "orgId": "m1", "userId": "u1", "role": "owner", "orgType": "merchant" }
                  ]
                }
                """.trimIndent(),
            ),
        )
        assertFalse(SessionRules.hasCashierMembership(session))
    }

    @Test
    fun loginRequestJsonIncludesEmail() {
        val json = JsonParsers.loginRequestJson("a@b.co", "passwordlong1", null)
        assertTrue(json.contains("a@b.co"))
        assertFalse(json.contains("orgId"))
    }

    @Test
    fun createOrderJsonOmitsMatchingMode() {
        val json = JsonParsers.createOrderRequestJson("50.00", "USDT", "tron", 900)
        val obj = JSONObject(json)
        assertEquals("50.00", obj.getString("amount"))
        assertEquals("USDT", obj.getString("asset"))
        assertEquals("tron", obj.getString("network"))
        assertEquals(900, obj.getInt("validitySeconds"))
        assertFalse(obj.has("matchingMode"))
        assertFalse(obj.has("receiveAddress"))
        assertFalse(obj.has("merchantReference"))
    }

    @Test
    fun createOrderJsonIncludesMerchantReferenceWhenSet() {
        val json =
            JsonParsers.createOrderRequestJson(
                "50.00",
                "USDT",
                "tron",
                900,
                "PO-8842 / Table 12",
            )
        val obj = JSONObject(json)
        assertEquals("PO-8842 / Table 12", obj.getString("merchantReference"))
        assertFalse(obj.has("matchingMode"))
    }

    @Test
    fun createOrderJsonOmitsBlankMerchantReference() {
        val json = JsonParsers.createOrderRequestJson("50.00", "USDT", "tron", 900, "  ")
        val obj = JSONObject(json)
        assertFalse(obj.has("merchantReference"))
    }

    @Test
    fun parsePaymentOrderAndDetails() {
        val order =
            JsonParsers.parsePaymentOrder(
                """
                {
                  "id": "ord-1",
                  "orderNumber": "CG-1",
                  "status": "pending_payment",
                  "matchingMode": "B",
                  "payableAmount": { "amount": "50.00", "currency": "USDT" },
                  "receivedAmount": null,
                  "receiveAddress": "TMain",
                  "addressSource": "main",
                  "hdIndex": null,
                  "memoOrTag": null,
                  "asset": "USDT",
                  "network": "tron",
                  "expiresAt": "2026-08-24T12:00:00.000Z"
                }
                """.trimIndent(),
            )
        assertEquals("ord-1", order.id)
        assertEquals("50.00", order.payableAmount.amount)
        assertEquals("TMain", order.receiveAddress)

        val pay =
            JsonParsers.parsePaymentDetails(
                """
                {
                  "orderNumber": "CG-1",
                  "status": "pending_payment",
                  "merchantName": "Hotel",
                  "matchingMode": "C",
                  "paymentPageUrl": "http://localhost:5173/pay/ord-1",
                  "qrPayload": "http://localhost:5173/pay/ord-1",
                  "walletUri": "tron:TMain?amount=50.01&asset=USDT&network=tron",
                  "receiveAddress": "TMain",
                  "payableAmount": { "amount": "50.01", "currency": "USDT" },
                  "copyAmount": "50.01",
                  "asset": "USDT",
                  "network": "tron",
                  "expiresAt": "2026-08-24T12:00:00.000Z",
                  "wrongNetworkWarning": "Send only USDT on TRON TRC-20.",
                  "payExactAmountWarning": "Send the exact payable amount."
                }
                """.trimIndent(),
            )
        assertEquals("50.01", pay.copyAmount)
        assertTrue(pay.qrPayload.startsWith("http"))
        assertEquals("Send the exact payable amount.", pay.payExactAmountWarning)
    }
}

class OrderStatusUiTest {
    @Test
    fun anomalyIsNotCompleted() {
        assertEquals("Payment Anomaly", OrderStatusUi.label("payment_anomaly"))
        assertEquals("Pending Payment", OrderStatusUi.label("pending_payment"))
        assertTrue(OrderStatusUi.isAnomaly("payment_anomaly"))
        assertTrue(OrderStatusUi.isTerminal("payment_anomaly"))
        assertFalse(OrderStatusUi.showsCompleted("payment_anomaly"))
        assertTrue(OrderStatusUi.showsCompleted("completed"))
        assertFalse(OrderStatusUi.isTerminal("pending_payment"))
        assertFalse(OrderStatusUi.isTerminal("verifying"))
    }
}

class CashierPosSurfaceTest {
    @Test
    fun hidesWalletXpubMatching() {
        assertFalse(CashierPosSurface.allowsFeature("wallet"))
        assertFalse(CashierPosSurface.allowsFeature("xPub"))
        assertFalse(CashierPosSurface.allowsFeature("matching_mode"))
        assertFalse(CashierPosSurface.allowsFeature("settlement_address"))
        assertTrue(CashierPosSurface.allowsFeature("create_order"))
    }

    @Test
    fun maps403ToPosFriendlyMessage() {
        val msg = CashierPosSurface.userMessage(
            ApiError("forbidden", "cannot change settlement", 403),
        )
        assertEquals(CashierPosSurface.FORBIDDEN_POS, msg)
        assertTrue(msg.contains("xPub"))
        assertTrue(msg.contains("matching mode"))
    }

    @Test
    fun mapsIoExceptionToOfflineCreate() {
        val msg = CashierPosSurface.userMessage(java.net.UnknownHostException("api"))
        assertEquals(CashierPosSurface.OFFLINE_CREATE, msg)
    }
}
