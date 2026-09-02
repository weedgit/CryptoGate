package com.paymentgate.cashier.api

data class ApiError(
    val code: String,
    val message: String,
    val httpStatus: Int,
    val details: JSONObject? = null,
) : Exception("$code: $message")

data class BlockingOrder(
    val id: String,
    val orderNumber: String,
    val status: String,
    val payableAmount: String,
    val asset: String,
    val network: String,
)

data class OrgMembership(
    val orgId: String,
    val orgType: String?,
    val role: String,
)

data class Session(
    val userId: String,
    val email: String,
    val memberships: List<OrgMembership>,
)

data class LoginResult(
    val session: Session,
    val mfaRequired: Boolean,
)

data class Money(
    val amount: String,
    val currency: String,
)

data class PaymentOrder(
    val id: String,
    val orderNumber: String,
    val status: String,
    val matchingMode: String,
    val payableAmount: Money,
    val receiveAddress: String,
    val asset: String,
    val network: String,
    val expiresAt: String,
    val memoOrTag: String?,
    val merchantReference: String? = null,
)

data class PaymentDetails(
    val orderNumber: String,
    val status: String,
    val merchantName: String,
    val matchingMode: String,
    val paymentPageUrl: String,
    val qrPayload: String,
    val receiveAddress: String,
    val payableAmount: Money,
    val copyAmount: String,
    val asset: String,
    val network: String,
    val expiresAt: String,
    val wrongNetworkWarning: String,
    val payExactAmountWarning: String?,
    val memoOrTag: String?,
    val memoWarning: String?,
    val contractAddress: String?,
    val confirmations: Int = 0,
    val requiredConfirmations: Int = 1,
)

object OrderDefaults {
    const val ASSET = "USDT"
    const val NETWORK = "tron"
    const val VALIDITY_SECONDS = 900
}

object SessionRules {
    const val ROLE_CASHIER = "cashier"
    const val ORG_MERCHANT = "merchant"
    const val ORG_MERCHANT_SITE = "merchant_site"

    /** POS allows only Cashier on merchant / merchant_site. */
    fun hasCashierMembership(session: Session): Boolean =
        session.memberships.any { m ->
            m.role == ROLE_CASHIER &&
                (m.orgType == null ||
                    m.orgType == ORG_MERCHANT ||
                    m.orgType == ORG_MERCHANT_SITE)
        }
}
