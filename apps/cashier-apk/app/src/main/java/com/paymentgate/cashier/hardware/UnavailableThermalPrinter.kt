package com.paymentgate.cashier.hardware

/**
 * Generic phone / emulator / CI — no OEM printer.
 * UI still shows Print; outcome explains hardware is unavailable.
 */
class UnavailableThermalPrinter(
    private val detail: String = "Thermal printer not available on this device",
) : ThermalPrinter {
    override fun isAvailable(): Boolean = false

    override fun status(): PrinterHwStatus = PrinterHwStatus.Unavailable

    override fun printReceipt(job: ReceiptJob): PrintOutcome =
        PrintOutcome.Failed(PrinterHwStatus.Unavailable, detail)

    override fun printTestFeed(): PrintOutcome =
        PrintOutcome.Failed(PrinterHwStatus.Unavailable, detail)
}
