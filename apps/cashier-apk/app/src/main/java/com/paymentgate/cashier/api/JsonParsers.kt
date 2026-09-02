package com.paymentgate.cashier.api

import org.json.JSONArray
import org.json.JSONObject

object JsonParsers {
    fun parseLoginResponse(body: String): LoginResult {
        val root = JSONObject(body)
        val session = parseSession(root.getJSONObject("session"))
        val mfaRequired = root.optBoolean("mfaRequired", false)
        return LoginResult(session = session, mfaRequired = mfaRequired)
    }

    fun parseSession(obj: JSONObject): Session {
        val memberships = mutableListOf<OrgMembership>()
        val arr: JSONArray = obj.optJSONArray("memberships") ?: JSONArray()
        for (i in 0 until arr.length()) {
            val m = arr.getJSONObject(i)
            memberships.add(
                OrgMembership(
                    orgId = m.getString("orgId"),
                    orgType = if (m.has("orgType") && !m.isNull("orgType")) {
                        m.getString("orgType")
                    } else {
                        null
                    },
                    role = m.getString("role"),
                ),
            )
        }
        return Session(
            userId = obj.getString("userId"),
            email = obj.getString("email"),
            memberships = memberships,
        )
    }

    fun parseError(body: String, httpStatus: Int): ApiError {
        return try {
            val root = JSONObject(body)
            ApiError(
                code = root.optString("code", "http_error"),
                message = root.optString("message", "Request failed"),
                httpStatus = httpStatus,
                details = root.optJSONObject("details"),
            )
        } catch (_: Exception) {
            ApiError(
                code = "http_error",
                message = body.ifBlank { "HTTP $httpStatus" },
                httpStatus = httpStatus,
            )
        }
    }

    fun parseBlockingOrder(details: JSONObject?): BlockingOrder? {
        if (details == null) return null
        val blocking = details.optJSONObject("blockingOrder") ?: return null
        val id = blocking.optString("id", "").trim()
        val orderNumber = blocking.optString("orderNumber", "").trim()
        if (id.isEmpty() || orderNumber.isEmpty()) return null
        return BlockingOrder(
            id = id,
            orderNumber = orderNumber,
            status = blocking.optString("status", "pending_payment"),
            payableAmount = blocking.optString("payableAmount", ""),
            asset = blocking.optString("asset", ""),
            network = blocking.optString("network", ""),
        )
    }

    fun loginRequestJson(email: String, password: String, orgId: String?): String {
        val o = JSONObject()
        o.put("email", email)
        o.put("password", password)
        if (!orgId.isNullOrBlank()) o.put("orgId", orgId)
        return o.toString()
    }

    fun createOrderRequestJson(
        amount: String,
        asset: String,
        network: String,
        validitySeconds: Int,
        merchantReference: String? = null,
    ): String {
        val o = JSONObject()
        o.put("amount", amount)
        o.put("asset", asset)
        o.put("network", network)
        o.put("validitySeconds", validitySeconds)
        val ref = merchantReference?.trim().orEmpty()
        if (ref.isNotEmpty()) {
            o.put("merchantReference", ref.take(200))
        }
        return o.toString()
    }

    fun parseMoney(obj: JSONObject): Money =
        Money(
            amount = obj.getString("amount"),
            currency = obj.getString("currency"),
        )

    fun parsePaymentOrder(body: String): PaymentOrder = parsePaymentOrderObject(JSONObject(body))

    fun parsePaymentOrderObject(obj: JSONObject): PaymentOrder =
        PaymentOrder(
            id = obj.getString("id"),
            orderNumber = obj.getString("orderNumber"),
            status = obj.getString("status"),
            matchingMode = obj.getString("matchingMode"),
            payableAmount = parseMoney(obj.getJSONObject("payableAmount")),
            receiveAddress = obj.getString("receiveAddress"),
            asset = obj.getString("asset"),
            network = obj.getString("network"),
            expiresAt = obj.getString("expiresAt"),
            memoOrTag = obj.optNullableString("memoOrTag"),
            merchantReference = obj.optNullableString("merchantReference"),
        )

    fun parsePaymentDetails(body: String): PaymentDetails {
        val obj = JSONObject(body)
        return PaymentDetails(
            orderNumber = obj.getString("orderNumber"),
            status = obj.getString("status"),
            merchantName = obj.getString("merchantName"),
            matchingMode = obj.getString("matchingMode"),
            paymentPageUrl = obj.getString("paymentPageUrl"),
            qrPayload = obj.getString("qrPayload"),
            receiveAddress = obj.getString("receiveAddress"),
            payableAmount = parseMoney(obj.getJSONObject("payableAmount")),
            copyAmount = obj.getString("copyAmount"),
            asset = obj.getString("asset"),
            network = obj.getString("network"),
            expiresAt = obj.getString("expiresAt"),
            wrongNetworkWarning = obj.getString("wrongNetworkWarning"),
            payExactAmountWarning = obj.optNullableString("payExactAmountWarning"),
            memoOrTag = obj.optNullableString("memoOrTag"),
            memoWarning = obj.optNullableString("memoWarning"),
            contractAddress = obj.optNullableString("contractAddress"),
            confirmations = obj.optInt("confirmations", 0),
            requiredConfirmations = obj.optInt("requiredConfirmations", 1),
        )
    }

    fun parsePaymentOrderList(body: String): List<PaymentOrder> {
        val root = JSONObject(body)
        val items = root.optJSONArray("items") ?: JSONArray()
        val out = mutableListOf<PaymentOrder>()
        for (i in 0 until items.length()) {
            out.add(parsePaymentOrderObject(items.getJSONObject(i)))
        }
        return out
    }

    private fun JSONObject.optNullableString(key: String): String? {
        if (!has(key) || isNull(key)) return null
        val value = getString(key).trim()
        return value.ifEmpty { null }
    }
}
