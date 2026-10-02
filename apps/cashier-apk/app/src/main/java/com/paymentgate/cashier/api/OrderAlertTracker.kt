package com.paymentgate.cashier.api

/** The three POS alert sounds: one per meaning, so staff can tell them apart by ear. */
enum class PosSound { Paid, Attention, Ended }

/** What happened to an order. Declared from least to most important. */
enum class OrderAlertKind(val sound: PosSound?) {
    /** A new open invoice, e.g. from another cashier. Toast only. */
    Created(null),

    /** Expired, failed or cancelled. */
    Ended(PosSound.Ended),

    /** Completed, or seen on chain for counter (release-on-verifying) orders. */
    Paid(PosSound.Paid),

    /** Payment anomaly: under/overpaid or otherwise needs review. */
    Attention(PosSound.Attention),
}

data class OrderAlert(val orderId: String, val kind: OrderAlertKind, val status: String)

/**
 * Decides which alert an order change deserves, so the same change seen by the list refresh,
 * the live push and the Pay screen poll alerts only once. The first list after [reset] only
 * learns the current state; orders already paid or ended before unlock stay quiet.
 */
class OrderAlertTracker {
    private enum class Stage { Open, Paid, Attention, Ended, Other }

    private val stages = HashMap<String, Stage>()
    private var primed = false

    fun reset() {
        stages.clear()
        primed = false
    }

    /** A refreshed order list. Returns its changes, most important first. */
    fun onList(orders: List<PaymentOrder>): List<OrderAlert> {
        val firstLoad = !primed
        primed = true
        val alerts = orders.mapNotNull { order ->
            update(order.id, order.status, order.fulfillmentPolicy, newOrderAlerts = !firstLoad)
                ?.takeUnless { firstLoad }
                ?.let { OrderAlert(order.id, it, order.status) }
        }
        return alerts.sortedByDescending { it.kind.ordinal }
    }

    /**
     * One order seen on its own (create, Pay screen). An unknown order only counts as new while
     * open, so opening an old order from history stays quiet.
     */
    fun onOrder(id: String, status: String, fulfillmentPolicy: String): OrderAlert? =
        update(id, status, fulfillmentPolicy, newOrderAlerts = primed && stageOf(status, fulfillmentPolicy) == Stage.Open)
            ?.let { OrderAlert(id, it, status) }

    private fun update(id: String, status: String, fulfillmentPolicy: String, newOrderAlerts: Boolean): OrderAlertKind? {
        val next = stageOf(status, fulfillmentPolicy)
        val previous = stages.put(id, next)
        if (previous == next) return null
        if (previous == null && !newOrderAlerts) return null
        return when (next) {
            Stage.Open -> if (previous == null) OrderAlertKind.Created else null
            Stage.Paid -> OrderAlertKind.Paid
            Stage.Attention -> OrderAlertKind.Attention
            Stage.Ended -> OrderAlertKind.Ended
            Stage.Other -> null
        }
    }

    private fun stageOf(status: String, fulfillmentPolicy: String): Stage =
        when {
            OrderStatusUi.showsCompleted(status) -> Stage.Paid
            OrderStatusUi.isAnomaly(status) -> Stage.Attention
            OrderStatusUi.isClosed(status) -> Stage.Ended
            OrderStatusUi.isOpenPaymentOrder(status) ->
                if (fulfillmentPolicy == FulfillmentPolicy.ON_VERIFYING && status != OrderStatusUi.PENDING) {
                    Stage.Paid
                } else {
                    Stage.Open
                }
            else -> Stage.Other
        }
}
