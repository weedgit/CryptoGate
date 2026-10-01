package com.paymentgate.cashier.api

enum class PosSound { Created, Paid, Problem }

/**
 * Decides which sound an order change deserves, so the same change heard by the list refresh,
 * the live push and the Pay screen poll sounds only once. The first list after [reset] only
 * learns the current state; orders already paid or failed before unlock stay silent.
 */
class OrderSoundTracker {
    private enum class Stage { Open, Paid, Problem, Closed }

    private val stages = HashMap<String, Stage>()
    private var primed = false

    fun reset() {
        stages.clear()
        primed = false
    }

    /** A refreshed order list. Returns the most important sound among its changes. */
    fun onList(orders: List<PaymentOrder>): PosSound? {
        val firstLoad = !primed
        primed = true
        var loudest: PosSound? = null
        for (order in orders) {
            val sound = update(order.id, order.status, order.fulfillmentPolicy, newOrderSounds = !firstLoad)
            if (firstLoad) continue
            if (sound != null && (loudest == null || sound.ordinal > loudest.ordinal)) loudest = sound
        }
        return loudest
    }

    /**
     * One order seen on its own (create, Pay screen). An unknown order only counts as new while
     * open, so opening an old order from history stays silent.
     */
    fun onOrder(id: String, status: String, fulfillmentPolicy: String): PosSound? =
        update(id, status, fulfillmentPolicy, newOrderSounds = primed && stageOf(status, fulfillmentPolicy) == Stage.Open)

    private fun update(id: String, status: String, fulfillmentPolicy: String, newOrderSounds: Boolean): PosSound? {
        val next = stageOf(status, fulfillmentPolicy)
        val previous = stages.put(id, next)
        if (previous == next) return null
        if (previous == null && !newOrderSounds) return null
        return when (next) {
            Stage.Open -> if (previous == null) PosSound.Created else null
            Stage.Paid -> PosSound.Paid
            Stage.Problem -> PosSound.Problem
            Stage.Closed -> null
        }
    }

    private fun stageOf(status: String, fulfillmentPolicy: String): Stage =
        when {
            OrderStatusUi.showsCompleted(status) -> Stage.Paid
            status == OrderStatusUi.ANOMALY || status == OrderStatusUi.EXPIRED || status == OrderStatusUi.FAILED ->
                Stage.Problem
            OrderStatusUi.isOpenPaymentOrder(status) ->
                if (fulfillmentPolicy == FulfillmentPolicy.ON_VERIFYING && status != OrderStatusUi.PENDING) {
                    Stage.Paid
                } else {
                    Stage.Open
                }
            else -> Stage.Closed
        }
}
