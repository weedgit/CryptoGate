package com.paymentgate.cashier.api

import org.json.JSONObject

data class ApiError(
    val code: String,
    override val message: String,
    val httpStatus: Int,
    val details: JSONObject? = null,
) : Exception(message)

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
    /** Profile IANA zone; only trusted once [timezoneConfirmed] (else it is the UTC default). */
    val timezone: String? = null,
    val timezoneConfirmed: Boolean = false,
    val firstName: String? = null,
    val lastName: String? = null,
)

data class LoginResult(
    val session: Session,
    val mfaRequired: Boolean,
)

data class OrgInfo(
    val id: String,
    val type: String?,
    val name: String,
    /** Preset mark id (`store`, `hex`, …) or a `data:image/...` logo; null → platform mark. */
    val iconKey: String? = null,
    /** False when the response had no `iconKey` field (the heartbeat omits it). */
    val iconSent: Boolean = false,
)

data class TerminalBinding(
    val terminalId: String,
    val token: String,
    val org: OrgInfo,
    val businessTimezone: String?,
)

data class TerminalStatus(
    val org: OrgInfo,
    val businessTimezone: String?,
)

/** Person who unlocked the POS with their PIN. */
data class Operator(
    val firstName: String?,
    val lastName: String?,
    val role: String,
) {
    val displayName: String
        get() = listOfNotNull(firstName?.trim(), lastName?.trim())
            .filter { it.isNotEmpty() }
            .joinToString(" ")
            .ifEmpty { role.replaceFirstChar { it.uppercase() } }

    /** Owner or Administrator — may unbind the POS. */
    val isManager: Boolean
        get() = role == SessionRules.ROLE_OWNER || role == SessionRules.ROLE_ADMINISTRATOR
}

data class UnlockResult(
    val session: Session,
    val operator: Operator,
    val liveActionsUnlocked: Boolean,
    val liveActionsBlockedReason: String?,
    val org: OrgInfo,
    val businessTimezone: String?,
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
    /** Bound chain tx when watcher has matched (M5-05). */
    val txHash: String? = null,
    /** Merchant/site zone for customer receipts; null when not set. */
    val businessTimezone: String? = null,
)

/** What the typed amount means: a fiat invoice converted at the live rate, or the exact token amount. */
enum class ChargeCurrency(val symbol: String) {
    USD("$"),
    EUR("€"),
    TOKEN(""),
}

object OrderDefaults {
    const val ASSET = "USDT"
    const val NETWORK = "tron"
    const val VALIDITY_SECONDS = 1800
}

object SessionRules {
    const val ROLE_OWNER = "owner"
    const val ROLE_ADMINISTRATOR = "administrator"
    const val ROLE_CASHIER = "cashier"
    const val ORG_MERCHANT = "merchant"
    const val ORG_MERCHANT_SITE = "merchant_site"

    /** The membership that binds this POS: Owner/Administrator of their own merchant or site. */
    fun bindMembership(session: Session): OrgMembership? =
        session.memberships.firstOrNull { m ->
            (m.role == ROLE_OWNER || m.role == ROLE_ADMINISTRATOR) &&
                (m.orgType == ORG_MERCHANT || m.orgType == ORG_MERCHANT_SITE)
        }

    fun canBindPos(session: Session): Boolean = bindMembership(session) != null

    fun orgTypeLabel(orgType: String?): String =
        when (orgType) {
            ORG_MERCHANT -> "Merchant"
            ORG_MERCHANT_SITE -> "Site"
            else -> "Org"
        }
}
