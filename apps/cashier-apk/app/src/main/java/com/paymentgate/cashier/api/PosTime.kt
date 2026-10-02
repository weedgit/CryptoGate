package com.paymentgate.cashier.api

import java.time.ZoneId

/**
 * POS times use the org business zone (same as web day cuts / invoices).
 * Falls back to the device zone when the business zone is unset.
 */
object PosTime {
    fun staffZone(session: Session?, device: ZoneId = ZoneId.systemDefault()): ZoneId {
        parse(session?.businessTimezone)?.let { return it }
        // Legacy session fields from older APIs.
        if (session?.timezoneConfirmed == true) {
            parse(session.timezone)?.let { return it }
        }
        return device
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
