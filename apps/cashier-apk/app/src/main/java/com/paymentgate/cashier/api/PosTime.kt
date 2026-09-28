package com.paymentgate.cashier.api

import java.time.ZoneId

/**
 * Time zones on the POS match the web portals: staff screens use the cashier's
 * confirmed profile zone, customer receipts the merchant's business zone.
 * Both fall back to the device zone.
 */
object PosTime {
    fun staffZone(session: Session?, device: ZoneId = ZoneId.systemDefault()): ZoneId {
        if (session?.timezoneConfirmed != true) return device
        return parse(session.timezone) ?: device
    }

    fun receiptZone(
        session: Session?,
        businessTimezone: String?,
        device: ZoneId = ZoneId.systemDefault(),
    ): ZoneId = parse(businessTimezone) ?: staffZone(session, device)

    fun parse(id: String?): ZoneId? {
        val trimmed = id?.trim().orEmpty()
        if (trimmed.isEmpty()) return null
        return runCatching { ZoneId.of(trimmed) }.getOrNull()
    }
}
