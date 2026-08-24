package com.cryptogate.cashier.api

data class ApiError(
    val code: String,
    val message: String,
    val httpStatus: Int,
) : Exception("$code: $message")

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
