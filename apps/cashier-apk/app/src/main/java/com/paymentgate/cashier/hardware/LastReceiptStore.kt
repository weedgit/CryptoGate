package com.paymentgate.cashier.hardware

/**
 * Holds last successful receipt job for reprint (G9).
 * In-memory only — cleared on process death.
 */
class LastReceiptStore {
    @Volatile
    var last: ReceiptJob? = null
        private set

    fun remember(job: ReceiptJob) {
        last = job
    }

    fun clear() {
        last = null
    }
}
