package com.paymentgate.cashier.hardware

import android.text.Layout
import android.util.Log
import com.zcs.sdk.DriverManager
import com.zcs.sdk.Printer
import com.zcs.sdk.SdkResult
import com.zcs.sdk.print.PrnStrFormat
import com.zcs.sdk.print.PrnTextFont
import com.zcs.sdk.print.PrnTextStyle
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * ZCS SmartPos built-in printer (Z108S and listed SKUs).
 * Paper: prefer 80 mm (576 px) — ZCS confirmed default for Z108S.
 */
class ZcsSmartPosPrinter private constructor(
    private val driver: DriverManager,
    private val printer: Printer,
) : ThermalPrinter {
    override fun isAvailable(): Boolean = true

    override fun status(): PrinterHwStatus =
        mapStatus(printer.getPrinterStatus())

    override fun printReceipt(job: ReceiptJob): PrintOutcome {
        val latch = CountDownLatch(1)
        val result = AtomicReference<PrintOutcome>(
            PrintOutcome.Failed(PrinterHwStatus.Unknown, "Print did not start"),
        )
        driver.singleThreadExecutor.execute {
            try {
                result.set(printOnSdkThread(job))
            } catch (e: Exception) {
                Log.e(TAG, "printReceipt failed", e)
                result.set(
                    PrintOutcome.Failed(
                        PrinterHwStatus.Fault,
                        e.message ?: "Printer exception",
                    ),
                )
            } finally {
                latch.countDown()
            }
        }
        if (!latch.await(45, TimeUnit.SECONDS)) {
            return PrintOutcome.Failed(PrinterHwStatus.Fault, "Print timed out")
        }
        return result.get()
    }

    override fun printTestFeed(): PrintOutcome {
        val latch = CountDownLatch(1)
        val result = AtomicReference<PrintOutcome>(
            PrintOutcome.Failed(PrinterHwStatus.Unknown, "Test feed did not start"),
        )
        driver.singleThreadExecutor.execute {
            try {
                result.set(printTestOnSdkThread())
            } catch (e: Exception) {
                Log.e(TAG, "printTestFeed failed", e)
                result.set(
                    PrintOutcome.Failed(
                        PrinterHwStatus.Fault,
                        e.message ?: "Printer exception",
                    ),
                )
            } finally {
                latch.countDown()
            }
        }
        if (!latch.await(30, TimeUnit.SECONDS)) {
            return PrintOutcome.Failed(PrinterHwStatus.Fault, "Test feed timed out")
        }
        return result.get()
    }

    private fun printTestOnSdkThread(): PrintOutcome {
        val statusCode = printer.getPrinterStatus()
        if (statusCode == SdkResult.SDK_PRN_STATUS_PAPEROUT) {
            return PrintOutcome.Failed(PrinterHwStatus.OutOfPaper, "Out of paper")
        }
        val title = formatFor(ReceiptStyle.Title)
        val body = formatFor(ReceiptStyle.Body)
        printer.setPrintAppendString("PaymentGate POS", title)
        printer.setPrintAppendString("TEST THERMAL FEED — 80 mm", body)
        printer.setPrintAppendString("Z108S / SmartPos printer OK", body)
        printer.setPrintAppendString("", body)
        printer.setPrintAppendString("", body)
        val start = printer.setPrintStart()
        if (start == SdkResult.SDK_PRN_STATUS_PAPEROUT) {
            return PrintOutcome.Failed(PrinterHwStatus.OutOfPaper, "Out of paper")
        }
        if (start != SdkResult.SDK_OK) {
            return PrintOutcome.Failed(mapStatus(start), "setPrintStart=$start")
        }
        if (printer.isSupportCutter) {
            runCatching { printer.openPrnCutter(1.toByte()) }
        }
        return PrintOutcome.Ok
    }

    private fun printOnSdkThread(job: ReceiptJob): PrintOutcome {
        val statusCode = printer.getPrinterStatus()
        if (statusCode == SdkResult.SDK_PRN_STATUS_PAPEROUT) {
            return PrintOutcome.Failed(PrinterHwStatus.OutOfPaper, "Out of paper")
        }
        if (statusCode != SdkResult.SDK_OK &&
            statusCode != SdkResult.SDK_PRN_STATUS_PRINTING
        ) {
            // Some units report non-OK until first append; still try if not paper-out/fault.
            if (statusCode == SdkResult.SDK_PRN_STATUS_FAULT ||
                statusCode == SdkResult.SDK_PRN_STATUS_TOOHEAT
            ) {
                return PrintOutcome.Failed(mapStatus(statusCode), "Printer status $statusCode")
            }
        }

        val paperPx =
            if (printer.is80MMPrinter) {
                ReceiptPaper.WIDTH_80MM_PX
            } else {
                ReceiptPaper.WIDTH_80MM_PX // Z108S default; still use 80 mm layout
            }
        Log.d(TAG, "Printing receipt widthHint=$paperPx is80=${printer.is80MMPrinter}")

        for (line in ReceiptLines.build(job)) {
            printer.setPrintAppendString(line.text, formatFor(line.style))
        }
        val start = printer.setPrintStart()
        if (start == SdkResult.SDK_PRN_STATUS_PAPEROUT) {
            return PrintOutcome.Failed(PrinterHwStatus.OutOfPaper, "Out of paper")
        }
        if (start != SdkResult.SDK_OK) {
            return PrintOutcome.Failed(mapStatus(start), "setPrintStart=$start")
        }
        if (printer.isSupportCutter) {
            runCatching { printer.openPrnCutter(1.toByte()) }
        }
        return PrintOutcome.Ok
    }

    private fun formatFor(style: ReceiptStyle): PrnStrFormat {
        val format = PrnStrFormat()
        format.font = PrnTextFont.SANS_SERIF
        when (style) {
            ReceiptStyle.Title -> {
                format.textSize = 30
                format.style = PrnTextStyle.BOLD
                format.ali = Layout.Alignment.ALIGN_CENTER
            }
            ReceiptStyle.Subtitle -> {
                format.textSize = 24
                format.style = PrnTextStyle.BOLD
                format.ali = Layout.Alignment.ALIGN_CENTER
            }
            ReceiptStyle.Emphasis -> {
                format.textSize = 26
                format.style = PrnTextStyle.BOLD
                format.ali = Layout.Alignment.ALIGN_NORMAL
            }
            ReceiptStyle.Mono, ReceiptStyle.Body, ReceiptStyle.Rule -> {
                format.textSize = 22
                format.style = PrnTextStyle.NORMAL
                format.ali = Layout.Alignment.ALIGN_NORMAL
            }
            ReceiptStyle.Footer -> {
                format.textSize = 18
                format.style = PrnTextStyle.NORMAL
                format.ali = Layout.Alignment.ALIGN_CENTER
            }
        }
        return format
    }

    private fun mapStatus(code: Int): PrinterHwStatus =
        when (code) {
            SdkResult.SDK_OK -> PrinterHwStatus.Ready
            SdkResult.SDK_PRN_STATUS_PAPEROUT -> PrinterHwStatus.OutOfPaper
            SdkResult.SDK_PRN_STATUS_FAULT,
            SdkResult.SDK_PRN_STATUS_TOOHEAT,
            -> PrinterHwStatus.Fault
            else -> PrinterHwStatus.Unknown
        }

    companion object {
        private const val TAG = "ZcsSmartPosPrinter"

        fun create(): ThermalPrinter {
            val driver = DriverManager.getInstance()
            val printer = driver.printer
                ?: error("DriverManager.getPrinter() returned null")
            return ZcsSmartPosPrinter(driver, printer)
        }
    }
}
