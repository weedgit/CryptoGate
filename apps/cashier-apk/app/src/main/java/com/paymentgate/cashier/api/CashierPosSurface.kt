package com.paymentgate.cashier.api

/**
 * POS surface rules (M2-73). Cashier APK never exposes merchant wallet /
 * settlement / xPub / matching-mode settings — those stay on web + MFA.
 */
object CashierPosSurface {
    /** Features that must not appear as screens, nav items, or deep links. */
    val HIDDEN_FEATURES = listOf(
        "wallet",
        "settlement_address",
        "xpub",
        "matching_mode",
        "fees",
        "service_bills",
    )

    fun allowsFeature(feature: String): Boolean =
        HIDDEN_FEATURES.none { it.equals(feature.trim(), ignoreCase = true) }

    fun isNetworkFailure(error: Throwable): Boolean {
        val name = error.javaClass.simpleName
        return name.contains("UnknownHost", ignoreCase = true) ||
            name.contains("SocketTimeout", ignoreCase = true) ||
            name.contains("ConnectException", ignoreCase = true) ||
            name.contains("IOException", ignoreCase = true) ||
            error is java.io.IOException
    }

    /**
     * Map API errors for cashier UX. 403 on privileged routes is expected if
     * something calls them; show a clear POS message, never a stack dump.
     */
    fun userMessage(error: Throwable, context: ErrorContext = ErrorContext.General): String {
        when (error) {
            is ApiError -> {
                if (error.code == "invalid_pos_pin") {
                    return "Incorrect PIN. Try again."
                }
                if (error.code == "pos_pin_not_configured") {
                    return "Set a POS PIN on the web dashboard (Security), then try again."
                }
                if (error.code == "asset_network_disabled" || error.code == "invalid_asset_network") {
                    return UNSUPPORTED_RAIL
                }
                if (error.code == "invalid_credentials") {
                    return INVALID_LOGIN
                }
                if (error.code == "not_authenticated") {
                    return INVALID_LOGIN
                }
                if (error.code == "session_cookie_missing") {
                    return error.message.trim().ifEmpty { INVALID_LOGIN }
                }
                if (error.code == "mfa_required") {
                    return MFA_REQUIRED_POS
                }
                if (error.code == "not_cashier") {
                    return NOT_CASHIER_POS
                }
                if (error.code == "mode_b_amount_in_use" || error.code == "mode_d_memo_in_use") {
                    return error.message.trim().ifEmpty {
                        "Another open order is using this amount. Open it or pick a different amount."
                    }
                }
                if (error.httpStatus == 403) {
                    return FORBIDDEN_POS
                }
                if (error.httpStatus == 401) {
                    return INVALID_LOGIN
                }
                val msg = error.message.trim()
                return msg.ifEmpty { "Request failed (${error.httpStatus})" }
            }
            else -> {
                if (isNetworkFailure(error)) {
                    return when (context) {
                        ErrorContext.PinUnlock -> OFFLINE_PIN_UNLOCK
                        ErrorContext.CreateOrder -> OFFLINE_CREATE
                        ErrorContext.General -> OFFLINE_GENERIC
                    }
                }
                return error.message?.trim()?.ifEmpty { null } ?: "Something went wrong"
            }
        }
    }

    /** V3 Create — unsupported rail banner when asset/network pair is not live. */
    fun unsupportedRailMessage(asset: String, networkLabel: String): String =
        "$asset cannot use $networkLabel · Choose a compatible rail"

    enum class ErrorContext { General, PinUnlock, CreateOrder }

    const val INVALID_LOGIN =
        "Owner/admin email or password is incorrect."

    const val SESSION_EXPIRED =
        "Terminal binding expired — register again with owner/admin credentials."

    const val MFA_REQUIRED_POS =
        "This account requires MFA. Sign in on the web portal — POS cannot complete authenticator step-up."

    const val NOT_CASHIER_POS =
        "Cashier role on a merchant account is required for POS."

    const val FORBIDDEN_POS =
        "Not allowed on POS. Settlement address, xPub, and matching mode can only be changed by Owner/Admin on the web portal."

    const val OFFLINE_CREATE =
        "Network unavailable — cannot create orders offline. Check Wi‑Fi or mobile data."

    const val OFFLINE_BANNER =
        "Offline — create order is disabled until the device is online."

    const val OFFLINE_PIN_UNLOCK =
        "Offline — connect to verify your dashboard PIN, or use the PIN cached on this terminal."

    const val OFFLINE_GENERIC =
        "Network unavailable. Check Wi‑Fi or mobile data."

    const val OFFLINE_PIN_NO_CACHE =
        "Connect to the network to verify your dashboard PIN."

    const val UNSUPPORTED_RAIL =
        "That asset and network are not supported on this terminal. Choose a Phase 1 rail."

    const val CATALOG_UNAVAILABLE =
        "Catalog unavailable — no product list configured."
}
