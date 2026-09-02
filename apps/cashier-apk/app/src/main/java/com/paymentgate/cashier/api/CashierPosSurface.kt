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

    /**
     * Map API errors for cashier UX. 403 on privileged routes is expected if
     * something calls them; show a clear POS message, never a stack dump.
     */
    fun userMessage(error: Throwable): String {
        when (error) {
            is ApiError -> {
                if (error.code == "mode_b_amount_in_use" || error.code == "mode_d_memo_in_use") {
                    return error.message.trim().ifEmpty {
                        "Another open order is using this amount. Open it or pick a different amount."
                    }
                }
                if (error.httpStatus == 403) {
                    return FORBIDDEN_POS
                }
                if (error.httpStatus == 401) {
                    return "Session expired — sign in again."
                }
                val msg = error.message.trim()
                return msg.ifEmpty { "Request failed (${error.httpStatus})" }
            }
            else -> {
                val name = error.javaClass.simpleName
                if (
                    name.contains("UnknownHost", ignoreCase = true) ||
                    name.contains("SocketTimeout", ignoreCase = true) ||
                    name.contains("ConnectException", ignoreCase = true) ||
                    name.contains("IOException", ignoreCase = true) ||
                    error is java.io.IOException
                ) {
                    return OFFLINE_CREATE
                }
                return error.message?.trim()?.ifEmpty { null } ?: "Something went wrong"
            }
        }
    }

    const val FORBIDDEN_POS =
        "Not allowed on POS. Settlement address, xPub, and matching mode can only be changed by Owner/Admin on the web portal."

    const val OFFLINE_CREATE =
        "Network unavailable — cannot create orders offline. Check Wi‑Fi or mobile data."

    const val OFFLINE_BANNER =
        "Offline — create order is disabled until the device is online."
}
