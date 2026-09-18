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
        assertEquals(null, pay.txHash)

        val paid =
            JsonParsers.parsePaymentDetails(
                """
                {
                  "orderNumber": "CG-2",
                  "status": "completed",
                  "merchantName": "Hotel",
                  "matchingMode": "B",
                  "paymentPageUrl": "http://localhost:5173/pay/ord-2",
                  "qrPayload": "http://localhost:5173/pay/ord-2",
                  "receiveAddress": "TMain",
                  "payableAmount": { "amount": "10.00", "currency": "USDT" },
                  "copyAmount": "10.00",
                  "asset": "USDT",
                  "network": "tron",
                  "expiresAt": "2026-08-24T12:00:00.000Z",
                  "wrongNetworkWarning": "Send only USDT on TRON TRC-20.",
                  "txHash": "0xabc123deadbeef"
                }
                """.trimIndent(),
            )
        assertEquals("0xabc123deadbeef", paid.txHash)
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
        assertTrue(OrderStatusUi.isOpenPaymentOrder("pending_payment"))
        assertTrue(OrderStatusUi.isOpenPaymentOrder("verifying"))
        assertFalse(OrderStatusUi.isOpenPaymentOrder("completed"))
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
    fun mapsMfaRequiredToWebPortalMessage() {
        val msg = CashierPosSurface.userMessage(
            ApiError("mfa_required", "This account requires MFA. Sign in on the web portal.", 403),
        )
        assertEquals(CashierPosSurface.MFA_REQUIRED_POS, msg)
        assertTrue(msg.contains("web portal"))
        assertFalse(msg.contains("xPub"))
    }

    @Test
    fun mapsNotCashierToRoleMessage() {
        val msg = CashierPosSurface.userMessage(
            ApiError("not_cashier", "Cashier role on a merchant account is required for POS.", 403),
        )
        assertEquals(CashierPosSurface.NOT_CASHIER_POS, msg)
        assertFalse(msg.contains("xPub"))
    }

    @Test
    fun mapsInvalidCredentialsToLoginMessage() {
        val msg = CashierPosSurface.userMessage(
            ApiError("invalid_credentials", "Invalid email or password", 401),
        )
        assertEquals(CashierPosSurface.INVALID_LOGIN, msg)
        assertFalse(msg.contains("Session expired"))
    }

    @Test
    fun mapsUnknownHostToOfflineGenericMessage() {
        val msg = CashierPosSurface.userMessage(java.net.UnknownHostException("api"))
        assertEquals(CashierPosSurface.OFFLINE_GENERIC, msg)
    }

    @Test
    fun networkFailure_usesPinContextOfflineCopy() {
        val msg =
            CashierPosSurface.userMessage(
                java.io.IOException("unreachable"),
                CashierPosSurface.ErrorContext.PinUnlock,
            )
        assertEquals(CashierPosSurface.OFFLINE_PIN_UNLOCK, msg)
    }

    @Test
    fun assetNetworkDisabled_mapsToUnsupportedRail() {
        val msg =
            CashierPosSurface.userMessage(
                ApiError("asset_network_disabled", "disabled", 422),
            )
        assertEquals(CashierPosSurface.UNSUPPORTED_RAIL, msg)
    }

    @Test
    fun unsupportedRailMessage_matchesV3Copy() {
        assertEquals(
            "TRX cannot use Ethereum · ERC-20 · Choose a compatible rail",
            CashierPosSurface.unsupportedRailMessage("TRX", "Ethereum · ERC-20"),
        )
    }
}
