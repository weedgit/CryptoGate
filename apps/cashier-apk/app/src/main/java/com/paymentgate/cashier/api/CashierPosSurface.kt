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
                when (error.code) {
                    "invalid_pos_pin" -> return INVALID_PIN
                    "pos_unlock_locked" -> return unlockLockedMessage(JsonParsers.retryAfterSeconds(error))
                    "terminal_revoked" -> return TERMINAL_REVOKED
                    "pos_session_scope" -> return FORBIDDEN_POS
                    "contact_unverified", "org_setup_incomplete" -> return CONTACT_UNVERIFIED
                    "invalid_mfa" -> return INVALID_MFA
                    "mfa_enrollment_required" -> return MFA_ENROLL_ON_WEB
                    "not_pos_manager" -> return NOT_POS_MANAGER
                    "rate_limited" -> return RATE_LIMITED
                    "invalid_credentials", "not_authenticated" -> return INVALID_LOGIN
                    "mfa_required" -> return MFA_REQUIRED_POS
                    "session_cookie_missing" -> return error.message.trim().ifEmpty { INVALID_LOGIN }
                    "asset_network_disabled", "invalid_asset_network" -> return UNSUPPORTED_RAIL
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
                    return if (context == ErrorContext.Setup) INVALID_LOGIN else SESSION_ENDED
                }
                val msg = error.message.trim()
                return msg.ifEmpty { "Request failed (${error.httpStatus})" }
            }
            else -> {
                if (isNetworkFailure(error)) {
                    return when (context) {
                        ErrorContext.PinUnlock -> OFFLINE_PIN_UNLOCK
                        ErrorContext.CreateOrder -> OFFLINE_CREATE
                        ErrorContext.General, ErrorContext.Setup -> OFFLINE_GENERIC
                    }
                }
                return error.message?.trim()?.ifEmpty { null } ?: "Something went wrong"
            }
        }
    }

    /** V3 Create — unsupported rail banner when asset/network pair is not live. */
    fun unsupportedRailMessage(asset: String, networkLabel: String): String =
        "$asset cannot use $networkLabel · Choose a compatible rail"

    enum class ErrorContext { General, Setup, PinUnlock, CreateOrder }

    /** Countdown text for `423 pos_unlock_locked`. */
    fun unlockLockedMessage(retryAfterSeconds: Int?): String {
        val s = retryAfterSeconds ?: return "Too many wrong PINs. Wait, then try again."
        val wait = if (s >= 60) "${(s + 59) / 60} min" else "$s s"
        return "Too many wrong PINs. Try again in $wait."
    }

    const val INVALID_LOGIN =
        "Owner/admin email or password is incorrect."

    const val INVALID_PIN =
        "Incorrect PIN. Try again."

    const val SESSION_ENDED =
        "Your session ended. Enter your PIN again."

    const val TERMINAL_REVOKED =
        "This POS was removed from its account. An Owner or Admin must set it up again."

    const val MFA_REQUIRED_POS =
        "Enter the code from your authenticator app."

    const val INVALID_MFA =
        "That code is not correct. Try again."

    const val MFA_ENROLL_ON_WEB =
        "Turn on two-factor authentication for this account on the web dashboard, then set up the POS."

    const val NOT_POS_MANAGER =
        "Only an Owner or Admin can set up this POS. Cashiers unlock it with their PIN after setup."

    const val CONTACT_UNVERIFIED =
        "Finish verifying the account's contact details on the web dashboard, then set up the POS."

    const val RATE_LIMITED =
        "Too many setup attempts. Wait a while and try again."

    const val CHARGE_BLOCKED =
        "Charging is paused for this account. An Owner or Admin must finish account setup on the web dashboard."

    const val FORBIDDEN_POS =
        "Not allowed on POS. Settlement address, xPub, and matching mode can only be changed by Owner/Admin on the web portal."

    const val OFFLINE_CREATE =
        "Network unavailable — cannot create orders offline. Check Wi‑Fi or mobile data."

    const val OFFLINE_BANNER =
        "Offline — create order is disabled until the device is online."

    const val OFFLINE_PIN_UNLOCK =
        "Offline — connect to the network to unlock with your PIN."

    const val OFFLINE_GENERIC =
        "Network unavailable. Check Wi‑Fi or mobile data."

    const val UNSUPPORTED_RAIL =
        "That asset and network are not supported on this terminal. Choose a Phase 1 rail."

    const val CATALOG_UNAVAILABLE =
        "Catalog unavailable — no product list configured."
}
