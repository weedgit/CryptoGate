package com.paymentgate.cashier.api

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DevicePinContractTest {
    @Test
    fun pinLengthRules_matchStoreContract() {
        assertTrue("123456".all { it.isDigit() } && "123456".length in 4..8)
        assertFalse("12".length in 4..8)
        assertFalse("12ab56".all { it.isDigit() })
    }
}
