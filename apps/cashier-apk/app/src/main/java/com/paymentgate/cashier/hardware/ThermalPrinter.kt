package com.paymentgate.cashier.hardware

/**
 * Watch-only POS thermal printer (M5-02). Never signs or moves funds.
 * Z108S default paper is 80 mm (576 px); see [ReceiptPaper].
 */
interface ThermalPrinter {
    fun isAvailable(): Boolean

    fun status(): PrinterHwStatus

    /** Blocking — call off the main thread (SDK executor / IO dispatcher). */
    fun printReceipt(job: ReceiptJob): PrintOutcome

    /** Short hardware smoke print (Settings → Test thermal feed). */
    fun printTestFeed(): PrintOutcome
}

enum class PrinterHwStatus {
    Ready,
    OutOfPaper,
    Fault,
    Unavailable,
    Unknown,
}

sealed class PrintOutcome {
    data object Ok : PrintOutcome()

    data class Failed(
        val reason: PrinterHwStatus,
        val detail: String? = null,
    ) : PrintOutcome()
}

object ReceiptPaper {
    const val WIDTH_58MM_PX = 384
    const val WIDTH_80MM_PX = 576
}
