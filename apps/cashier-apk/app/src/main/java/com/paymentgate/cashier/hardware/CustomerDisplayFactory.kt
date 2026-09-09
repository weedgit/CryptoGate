package com.paymentgate.cashier.hardware

import com.paymentgate.cashier.BuildConfig

object CustomerDisplayFactory {
    fun create(): CustomerDisplay {
        if (!BuildConfig.HAS_SMARTPOS) {
            return UnavailableCustomerDisplay("SmartPos AAR not packaged in this build")
        }
        return runCatching { ZcsCustomerDisplay.create() }
            .getOrElse { e ->
                UnavailableCustomerDisplay(e.message ?: "SmartPos customer display init failed")
            }
    }
}

class UnavailableCustomerDisplay(
    private val detail: String = "Customer display not available on this device",
) : CustomerDisplay {
    override fun isAvailable(): Boolean = false

    override fun showPay(content: CustomerPayContent): CustomerDisplayOutcome =
        CustomerDisplayOutcome.Failed(detail)

    override fun showIdle(): CustomerDisplayOutcome =
        CustomerDisplayOutcome.Failed(detail)
}
