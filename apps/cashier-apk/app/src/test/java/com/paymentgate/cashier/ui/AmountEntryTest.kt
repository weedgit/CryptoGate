package com.paymentgate.cashier.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class AmountEntryTest {
    @Test
    fun replacesLeadingZero() {
        assertEquals("5", AmountEntry.apply("0", "5"))
    }

    @Test
    fun capsTwoDecimalPlaces() {
        assertEquals("12.50", AmountEntry.apply("12.5", "0"))
        assertEquals("12.50", AmountEntry.apply("12.50", "9"))
    }

    @Test
    fun oneDecimalPoint() {
        assertEquals("3.", AmountEntry.apply("3", "."))
        assertEquals("3.", AmountEntry.apply("3.", "."))
        assertEquals("0.", AmountEntry.apply("", "."))
    }

    @Test
    fun backspace() {
        assertEquals("12", AmountEntry.apply("12.5", "del"))
    }
}
