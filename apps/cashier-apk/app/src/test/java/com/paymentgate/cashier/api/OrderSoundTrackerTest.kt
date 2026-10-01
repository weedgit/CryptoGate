package com.paymentgate.cashier.api

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class OrderSoundTrackerTest {
    private fun order(id: String, status: String, policy: String = FulfillmentPolicy.ON_COMPLETED) =
        PaymentOrder(
            id = id,
            orderNumber = id,
            status = status,
            matchingMode = "B",
            payableAmount = Money("10.00", "USDT"),
            receiveAddress = "T",
            asset = "USDT",
            network = "tron",
            expiresAt = "2026-09-30T12:00:00Z",
            memoOrTag = null,
            fulfillmentPolicy = policy,
        )

    @Test
    fun firstListOnlyLearns() {
        val t = OrderSoundTracker()
        assertNull(t.onList(listOf(order("a", "completed"), order("b", "payment_anomaly"), order("c", "pending_payment"))))
        assertNull(t.onList(listOf(order("a", "completed"), order("b", "payment_anomaly"), order("c", "pending_payment"))))
    }

    @Test
    fun soundsEachChangeOnceAcrossSources() {
        val t = OrderSoundTracker()
        t.onList(emptyList())
        assertEquals(PosSound.Created, t.onOrder("a", "pending_payment", FulfillmentPolicy.ON_COMPLETED))
        assertNull(t.onList(listOf(order("a", "pending_payment"))))
        assertNull(t.onOrder("a", "verifying", FulfillmentPolicy.ON_COMPLETED))
        assertEquals(PosSound.Paid, t.onOrder("a", "completed", FulfillmentPolicy.ON_COMPLETED))
        assertNull(t.onList(listOf(order("a", "completed"))))
    }

    @Test
    fun otherCashiersOrdersFromList() {
        val t = OrderSoundTracker()
        t.onList(emptyList())
        assertEquals(PosSound.Created, t.onList(listOf(order("x", "pending_payment"))))
        assertEquals(PosSound.Problem, t.onList(listOf(order("x", "expired"))))
        assertEquals(PosSound.Paid, t.onList(listOf(order("y", "completed"))))
    }

    @Test
    fun problemOutranksPaidInOneRefresh() {
        val t = OrderSoundTracker()
        t.onList(listOf(order("a", "pending_payment"), order("b", "pending_payment")))
        assertEquals(PosSound.Problem, t.onList(listOf(order("a", "completed"), order("b", "failed"))))
    }

    @Test
    fun counterOrderIsPaidWhenSeenAndCompletesSilently() {
        val t = OrderSoundTracker()
        t.onList(listOf(order("a", "pending_payment", FulfillmentPolicy.ON_VERIFYING)))
        assertEquals(PosSound.Paid, t.onOrder("a", "verifying", FulfillmentPolicy.ON_VERIFYING))
        assertNull(t.onOrder("a", "completed", FulfillmentPolicy.ON_VERIFYING))
    }

    @Test
    fun cancelAndOldOrdersStaySilent() {
        val t = OrderSoundTracker()
        t.onList(listOf(order("a", "pending_payment")))
        assertNull(t.onOrder("a", "cancelled", FulfillmentPolicy.ON_COMPLETED))
        assertNull(t.onOrder("old", "completed", FulfillmentPolicy.ON_COMPLETED))
    }

    @Test
    fun resetForgetsOrders() {
        val t = OrderSoundTracker()
        t.onList(emptyList())
        t.reset()
        assertNull(t.onList(listOf(order("a", "completed"))))
    }
}
