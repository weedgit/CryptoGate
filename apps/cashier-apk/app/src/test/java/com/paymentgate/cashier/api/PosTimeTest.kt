package com.paymentgate.cashier.api

import com.paymentgate.cashier.ui.formatReceiptPrintedAt
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneId

class PosTimeTest {
    private val device = ZoneId.of("Europe/Sofia")

    private fun session(
        businessTimezone: String? = null,
        timezone: String? = null,
        confirmed: Boolean = false,
    ) = Session(
        userId = "u1",
        email = "c@example.com",
        memberships = emptyList(),
        businessTimezone = businessTimezone,
        timezone = timezone,
        timezoneConfirmed = confirmed,
    )

    @Test
    fun unsetBusinessUsesDeviceZone() {
        assertEquals(device, PosTime.staffZone(session(), device))
        assertEquals(device, PosTime.staffZone(null, device))
    }

    @Test
    fun businessZoneWins() {
        assertEquals(
            ZoneId.of("Asia/Seoul"),
            PosTime.staffZone(session(businessTimezone = "Asia/Seoul"), device),
        )
    }

    @Test
    fun legacyConfirmedProfileStillWorks() {
        assertEquals(
            ZoneId.of("Asia/Seoul"),
            PosTime.staffZone(session(timezone = "Asia/Seoul", confirmed = true), device),
        )
    }

    @Test
    fun receiptPrefersBusinessZone() {
        val s = session(businessTimezone = "Asia/Seoul")
        assertEquals(ZoneId.of("Asia/Bangkok"), PosTime.receiptZone(s, "Asia/Bangkok", device))
        assertEquals(ZoneId.of("Asia/Seoul"), PosTime.receiptZone(s, null, device))
        assertEquals(ZoneId.of("Asia/Seoul"), PosTime.receiptZone(s, "Not/AZone", device))
    }

    @Test
    fun printedAtNamesTheZone() {
        assertTrue(formatReceiptPrintedAt(ZoneId.of("UTC")).endsWith(" UTC"))
    }
}
