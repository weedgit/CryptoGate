package com.paymentgate.cashier.hardware

/**
 * Stub when SmartPos AAR is not on the compile classpath.
 */
class ZcsCustomerDisplay private constructor() : CustomerDisplay {
    override fun isAvailable(): Boolean = false

    override fun showPay(content: CustomerPayContent): CustomerDisplayOutcome =
        CustomerDisplayOutcome.Failed("SmartPos AAR missing — customer display unavailable")

    override fun showIdle(): CustomerDisplayOutcome =
        CustomerDisplayOutcome.Failed("SmartPos AAR missing — customer display unavailable")

    companion object {
        fun create(): CustomerDisplay = ZcsCustomerDisplay()
    }
}
