package com.paymentgate.cashier.ui

import com.paymentgate.cashier.api.OrderStatusUi
import org.junit.Assert.assertEquals
import org.junit.Test

class ConfirmationProgressTest {
    @Test
    fun pendingIsRequested() {
        val m = confirmationProgress(OrderStatusUi.PENDING, 0, 19)
        assertEquals(ConfirmationPhase.Requested, m.phase)
        assertEquals("Requested", m.title)
    }

    @Test
    fun verifyingZeroIsDetected() {
        val m = confirmationProgress(OrderStatusUi.VERIFYING, 0, 12)
        assertEquals(ConfirmationPhase.Detected, m.phase)
    }

    @Test
    fun verifyingPartialIsConfirming() {
        val m = confirmationProgress(OrderStatusUi.VERIFYING, 2, 3)
        assertEquals(ConfirmationPhase.Confirming, m.phase)
        assertEquals("Confirming · 2/3", m.title)
    }

    @Test
    fun completedIsPaid() {
        val m = confirmationProgress(OrderStatusUi.COMPLETED, 19, 19)
        assertEquals(ConfirmationPhase.Paid, m.phase)
    }
}
