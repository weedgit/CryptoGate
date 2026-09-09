package com.paymentgate.cashier.hardware

/**
 * Stub when SmartPos AAR is not on the compile classpath (CI / laptop without vendor pack).
 */
class ZcsSmartPosPrinter private constructor() : ThermalPrinter {
    override fun isAvailable(): Boolean = false

    override fun status(): PrinterHwStatus = PrinterHwStatus.Unavailable

    override fun printReceipt(job: ReceiptJob): PrintOutcome =
        PrintOutcome.Failed(
            PrinterHwStatus.Unavailable,
            "SmartPos AAR missing — copy vendor AAR for Z108S builds",
        )

    companion object {
        fun create(): ThermalPrinter = ZcsSmartPosPrinter()
    }
}
