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
            businessTimezone = obj.optNullableString("businessTimezone"),
            timezone = obj.optNullableString("timezone"),
            timezoneConfirmed = obj.optBoolean("timezoneConfirmed", false),
            firstName = obj.optNullableString("firstName"),
            lastName = obj.optNullableString("lastName"),
            avatarUrl = obj.optNullableString("avatarUrl")?.takeIf { it.startsWith("data:image/") },
        )
    }

    fun parseOrg(obj: JSONObject): OrgInfo =
        OrgInfo(
            id = obj.getString("id"),
            type = obj.optNullableString("type"),
            name = obj.optNullableString("name").orEmpty(),
            iconKey = obj.optNullableString("iconKey")?.takeIf { it.isNotBlank() },
            iconSent = obj.has("iconKey"),
        )

    /** `POST /v1/pos/terminals` 201. */
    fun parseBindResponse(body: String): TerminalBinding {
        val root = JSONObject(body)
        return TerminalBinding(
            terminalId = root.getJSONObject("terminal").getString("id"),
            token = root.getString("terminalToken"),
            org = parseOrg(root.getJSONObject("org")),
            businessTimezone = root.optNullableString("businessTimezone"),
        )
    }

    /** `GET /v1/pos/terminal`. */
    fun parseTerminalStatus(body: String): TerminalStatus {
        val root = JSONObject(body)
        return TerminalStatus(
            org = parseOrg(root.getJSONObject("org")),
            businessTimezone = root.optNullableString("businessTimezone"),
        )
    }

    /** `POST /v1/pos/unlock` 200. */
    fun parseUnlockResponse(body: String): UnlockResult {
        val root = JSONObject(body)
        val op = root.getJSONObject("operator")
        return UnlockResult(
            session = parseSession(root.getJSONObject("session")),
            operator = Operator(
                firstName = op.optNullableString("firstName"),
                lastName = op.optNullableString("lastName"),
                role = op.optString("role", SessionRules.ROLE_CASHIER),
            ),
            liveActionsUnlocked = root.optBoolean("liveActionsUnlocked", true),
            liveActionsBlockedReason = root.optNullableString("liveActionsBlockedReason"),
            org = parseOrg(root.getJSONObject("org")),
            businessTimezone = root.optNullableString("businessTimezone"),
        )
    }

    fun bindRequestJson(deviceModel: String, appVersion: String): String =
        JSONObject()
            .put("deviceModel", deviceModel.take(80))
            .put("appVersion", appVersion.take(80))
            .toString()

    /** Seconds left on a `423 pos_unlock_locked`. */
    fun retryAfterSeconds(error: ApiError): Int? {
        val fromDetails = error.details?.optInt("retryAfterSeconds", 0) ?: 0
        return fromDetails.takeIf { it > 0 }
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
        chargeIn: ChargeCurrency = ChargeCurrency.USD,
    ): String {
        val o = JSONObject()
        if (chargeIn == ChargeCurrency.TOKEN) {
            o.put("amountCrypto", amount)
            o.put("invoiceDenomination", "crypto")
        } else {
            o.put("amount", amount)
            o.put("invoiceAmount", amount)
            o.put("invoiceCurrency", chargeIn.name)
            o.put("invoiceDenomination", "fiat")
        }
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
            createdAt = obj.optNullableString("createdAt"),
            createdByName = obj.optNullableString("createdByName"),
            invoice = parseInvoice(obj),
            rate = parseRate(obj),
            fulfillmentPolicy = obj.optNullableString("fulfillmentPolicy") ?: FulfillmentPolicy.ON_COMPLETED,
        )

    /** Fiat side of the invoice: the typed fiat amount, else its USD value. */
    private fun parseInvoice(obj: JSONObject): Money? {
        val currency = obj.optNullableString("invoiceCurrency") ?: "USD"
        val fiat = obj.optNullableString("invoiceDenomination") != "crypto"
        val typed = obj.optNullableString("invoiceAmount")
        if (fiat && typed != null) return Money(typed, currency)
        val usd = obj.optNullableString("invoiceAmountUsd") ?: return null
        return Money(usd, currency)
    }

    private fun parseRate(obj: JSONObject): OrderRate? {
        val value = obj.optNullableString("pricingRate") ?: return null
        return OrderRate(
            value = value,
            quote = "USD",
            source = obj.optNullableString("rateSource"),
            fetchedAt = obj.optNullableString("rateFetchedAt"),
        )
    }

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
            txHash = obj.optNullableString("txHash"),
            businessTimezone = obj.optNullableString("businessTimezone"),
            createdAt = obj.optNullableString("createdAt"),
            confirmedAt = obj.optNullableString("confirmedAt"),
            invoice = parseInvoice(obj),
            rate = parseRate(obj),
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

    /** Data of an SSE `dashboard` event; null unless it is an `order.*` change. */
    fun parseOrderEvent(data: String): OrderEvent? {
        val root = runCatching { JSONObject(data) }.getOrNull() ?: return null
        if (!root.optString("type", "").startsWith("order.")) return null
        return OrderEvent(orderId = root.optNullableString("orderId"))
    }

    private fun JSONObject.optNullableString(key: String): String? {
        if (!has(key) || isNull(key)) return null
        val value = getString(key).trim()
        return value.ifEmpty { null }
    }
}
