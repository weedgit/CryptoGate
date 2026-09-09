package com.paymentgate.cashier.hardware

import com.paymentgate.cashier.BuildConfig

object ThermalPrinterFactory {
    fun create(): ThermalPrinter {
        if (!BuildConfig.HAS_SMARTPOS) {
            return UnavailableThermalPrinter("SmartPos AAR not packaged in this build")
        }
        return runCatching { ZcsSmartPosPrinter.create() }
            .getOrElse { e ->
                UnavailableThermalPrinter(e.message ?: "SmartPos printer init failed")
            }
    }
}
