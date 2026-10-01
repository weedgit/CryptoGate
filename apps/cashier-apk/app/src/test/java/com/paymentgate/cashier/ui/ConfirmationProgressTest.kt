package com.paymentgate.cashier.ui

import com.paymentgate.cashier.api.FulfillmentPolicy
import com.paymentgate.cashier.api.OrderStatusUi
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
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
    fun counterPolicyVerifyingIsReleaseReady() {
        val m = confirmationProgress(OrderStatusUi.VERIFYING, 3, 19, FulfillmentPolicy.ON_VERIFYING)
        assertTrue(m.releaseReady)
        assertEquals(ConfirmationPhase.Confirming, m.phase)
        assertEquals("OK to release goods", m.title)
        assertEquals("Payment detected · finalizing 3/19 on chain", m.detail)
    }

    @Test
    fun counterPolicyWaitsForPayment() {
        val m = confirmationProgress(OrderStatusUi.PENDING, 0, 19, FulfillmentPolicy.ON_VERIFYING)
        assertFalse(m.releaseReady)
        assertEquals(ConfirmationPhase.Requested, m.phase)
    }

    @Test
    fun standardPolicyVerifyingIsNotReleaseReady() {
        val m = confirmationProgress(OrderStatusUi.VERIFYING, 3, 19, FulfillmentPolicy.ON_COMPLETED)
        assertFalse(m.releaseReady)
        assertEquals("Confirming · 3/19", m.title)
    }

    @Test
    fun completedIsPaid() {
        val m = confirmationProgress(OrderStatusUi.COMPLETED, 19, 19)
        assertEquals(ConfirmationPhase.Paid, m.phase)
    }
}
