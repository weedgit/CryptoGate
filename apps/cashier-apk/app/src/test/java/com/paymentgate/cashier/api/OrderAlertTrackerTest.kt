package com.paymentgate.cashier.api

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OrderAlertTrackerTest {
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

    private fun OrderAlertTracker.kinds(vararg orders: PaymentOrder) = onList(orders.toList()).map { it.kind }

    @Test
    fun firstListOnlyLearns() {
        val t = OrderAlertTracker()
        assertTrue(t.kinds(order("a", "completed"), order("b", "payment_anomaly"), order("c", "pending_payment")).isEmpty())
        assertTrue(t.kinds(order("a", "completed"), order("b", "payment_anomaly"), order("c", "pending_payment")).isEmpty())
    }

    @Test
    fun alertsEachChangeOnceAcrossSources() {
        val t = OrderAlertTracker()
        t.onList(emptyList())
        assertEquals(OrderAlertKind.Created, t.onOrder("a", "pending_payment", FulfillmentPolicy.ON_COMPLETED)?.kind)
        assertTrue(t.kinds(order("a", "pending_payment")).isEmpty())
        assertNull(t.onOrder("a", "verifying", FulfillmentPolicy.ON_COMPLETED))
        assertEquals(OrderAlertKind.Paid, t.onOrder("a", "completed", FulfillmentPolicy.ON_COMPLETED)?.kind)
        assertTrue(t.kinds(order("a", "completed")).isEmpty())
    }

    @Test
    fun otherCashiersOrdersFromList() {
        val t = OrderAlertTracker()
        t.onList(emptyList())
        assertEquals(listOf(OrderAlertKind.Created), t.kinds(order("x", "pending_payment")))
        assertEquals(listOf(OrderAlertKind.Ended), t.kinds(order("x", "expired")))
        assertEquals(listOf(OrderAlertKind.Paid), t.kinds(order("y", "completed")))
        assertEquals(listOf(OrderAlertKind.Attention), t.kinds(order("z", "payment_anomaly")))
    }

    @Test
    fun createdHasNoSound() {
        assertNull(OrderAlertKind.Created.sound)
        assertEquals(PosSound.Attention, OrderAlertKind.Attention.sound)
        assertEquals(PosSound.Ended, OrderAlertKind.Ended.sound)
    }

    @Test
    fun mostImportantChangeComesFirst() {
        val t = OrderAlertTracker()
        t.onList(listOf(order("a", "pending_payment"), order("b", "pending_payment"), order("c", "pending_payment")))
        val alerts = t.onList(listOf(order("a", "completed"), order("b", "failed"), order("c", "payment_anomaly")))
        assertEquals(listOf("c", "a", "b"), alerts.map { it.orderId })
        assertEquals(
            listOf(OrderAlertKind.Attention, OrderAlertKind.Paid, OrderAlertKind.Ended),
            alerts.map { it.kind },
        )
    }

    @Test
    fun counterOrderIsPaidWhenSeenAndCompletesQuietly() {
        val t = OrderAlertTracker()
        t.onList(listOf(order("a", "pending_payment", FulfillmentPolicy.ON_VERIFYING)))
        assertEquals(OrderAlertKind.Paid, t.onOrder("a", "verifying", FulfillmentPolicy.ON_VERIFYING)?.kind)
        assertNull(t.onOrder("a", "completed", FulfillmentPolicy.ON_VERIFYING))
    }

    @Test
    fun cancelIsEndedAndOldOrdersStayQuiet() {
        val t = OrderAlertTracker()
        t.onList(listOf(order("a", "pending_payment")))
        assertEquals(OrderAlertKind.Ended, t.onOrder("a", "cancelled", FulfillmentPolicy.ON_COMPLETED)?.kind)
        assertNull(t.onOrder("old", "completed", FulfillmentPolicy.ON_COMPLETED))
    }

    @Test
    fun resetForgetsOrders() {
        val t = OrderAlertTracker()
        t.onList(emptyList())
        t.reset()
        assertTrue(t.kinds(order("a", "completed")).isEmpty())
    }
}
