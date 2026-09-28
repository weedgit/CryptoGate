package com.paymentgate.cashier.api

import com.paymentgate.cashier.ui.formatReceiptPrintedAt
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneId

class PosTimeTest {
    private val device = ZoneId.of("Europe/Sofia")

    private fun session(tz: String?, confirmed: Boolean) =
        Session(
            userId = "u1",
            email = "c@example.com",
            memberships = emptyList(),
            timezone = tz,
            timezoneConfirmed = confirmed,
        )

    @Test
    fun unconfirmedProfileUsesDeviceZone() {
        assertEquals(device, PosTime.staffZone(session("UTC", confirmed = false), device))
        assertEquals(device, PosTime.staffZone(null, device))
    }

    @Test
    fun confirmedProfileWins() {
        assertEquals(
            ZoneId.of("Asia/Seoul"),
            PosTime.staffZone(session("Asia/Seoul", confirmed = true), device),
        )
    }

    @Test
    fun receiptPrefersBusinessZone() {
        val s = session("Asia/Seoul", confirmed = true)
        assertEquals(ZoneId.of("Asia/Bangkok"), PosTime.receiptZone(s, "Asia/Bangkok", device))
        assertEquals(ZoneId.of("Asia/Seoul"), PosTime.receiptZone(s, null, device))
        assertEquals(ZoneId.of("Asia/Seoul"), PosTime.receiptZone(s, "Not/AZone", device))
    }

    @Test
    fun printedAtNamesTheZone() {
        assertTrue(formatReceiptPrintedAt(ZoneId.of("UTC")).endsWith(" UTC"))
    }
}
