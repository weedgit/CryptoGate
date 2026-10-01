package com.paymentgate.cashier.hardware

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.text.Layout
import android.util.Base64
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
        appendCutterFeed()
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
            when (line.style) {
                ReceiptStyle.Qr -> {
                    printer.setPrintAppendString("", formatFor(ReceiptStyle.Spacer))
                    printer.setPrintAppendQRCode(line.text, QR_SIZE_PX, QR_SIZE_PX, Layout.Alignment.ALIGN_CENTER)
                }
                ReceiptStyle.Logo ->
                    decodeLogo(line.text)?.let { printer.setPrintAppendBitmap(it, Layout.Alignment.ALIGN_CENTER) }
                ReceiptStyle.Rule -> printer.setPrintAppendBitmap(ruleBitmap(dashed = true), Layout.Alignment.ALIGN_CENTER)
                ReceiptStyle.DoubleRule -> printer.setPrintAppendBitmap(ruleBitmap(dashed = false, double = true), Layout.Alignment.ALIGN_CENTER)
                ReceiptStyle.KeyValue, ReceiptStyle.KeyValueStrong, ReceiptStyle.Total -> {
                    val (left, right) = columnFormats(line.style)
                    val weights = if (line.style == ReceiptStyle.Total) intArrayOf(1, 2) else intArrayOf(2, 3)
                    printer.setPrintAppendStrings(arrayOf(line.text, line.value.orEmpty()), weights, arrayOf(left, right))
                }
                else -> printer.setPrintAppendString(line.text, formatFor(line.style))
            }
        }
        appendCutterFeed()
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

    private fun format(size: Int, bold: Boolean, align: Layout.Alignment): PrnStrFormat =
        PrnStrFormat().apply {
            font = PrnTextFont.SANS_SERIF
            textSize = size
            style = if (bold) PrnTextStyle.BOLD else PrnTextStyle.NORMAL
            ali = align
        }

    private fun formatFor(style: ReceiptStyle): PrnStrFormat =
        when (style) {
            ReceiptStyle.Title -> format(34, bold = true, align = Layout.Alignment.ALIGN_CENTER)
            ReceiptStyle.Subtitle -> format(26, bold = true, align = Layout.Alignment.ALIGN_CENTER)
            ReceiptStyle.Emphasis -> format(26, bold = true, align = Layout.Alignment.ALIGN_NORMAL)
            ReceiptStyle.Body -> format(22, bold = false, align = Layout.Alignment.ALIGN_CENTER)
            ReceiptStyle.Footer -> format(18, bold = false, align = Layout.Alignment.ALIGN_CENTER)
            ReceiptStyle.Spacer -> format(12, bold = false, align = Layout.Alignment.ALIGN_NORMAL)
            ReceiptStyle.Mono -> format(20, bold = false, align = Layout.Alignment.ALIGN_CENTER).apply {
                font = PrnTextFont.MONOSPACE
            }
            else -> format(22, bold = false, align = Layout.Alignment.ALIGN_NORMAL)
        }

    private fun columnFormats(style: ReceiptStyle): Pair<PrnStrFormat, PrnStrFormat> =
        when (style) {
            ReceiptStyle.Total ->
                format(32, bold = true, align = Layout.Alignment.ALIGN_NORMAL) to
                    format(32, bold = true, align = Layout.Alignment.ALIGN_OPPOSITE)
            ReceiptStyle.KeyValueStrong ->
                format(22, bold = false, align = Layout.Alignment.ALIGN_NORMAL) to
                    format(22, bold = true, align = Layout.Alignment.ALIGN_OPPOSITE)
            else ->
                format(22, bold = false, align = Layout.Alignment.ALIGN_NORMAL) to
                    format(22, bold = false, align = Layout.Alignment.ALIGN_OPPOSITE)
        }

    /**
     * The cutter sits above the print head: without this blank strip the blade lands inside the
     * receipt and its last lines come out on top of the next one.
     */
    private fun appendCutterFeed() {
        val blank = Bitmap.createBitmap(ReceiptPaper.WIDTH_80MM_PX, CUTTER_FEED_PX, Bitmap.Config.ARGB_8888)
        blank.eraseColor(Color.WHITE)
        printer.setPrintAppendBitmap(blank, Layout.Alignment.ALIGN_CENTER)
    }

    /** Full-width divider drawn as pixels, so it spans the paper regardless of font metrics. */
    private fun ruleBitmap(dashed: Boolean, double: Boolean = false): Bitmap {
        val width = ReceiptPaper.WIDTH_80MM_PX
        val height = if (double) 14 else 10
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)
        val paint = Paint().apply {
            color = Color.BLACK
            strokeWidth = 2f
            if (dashed) pathEffect = DashPathEffect(floatArrayOf(10f, 6f), 0f)
        }
        if (double) {
            canvas.drawLine(0f, 3f, width.toFloat(), 3f, paint)
            canvas.drawLine(0f, 10f, width.toFloat(), 10f, paint)
        } else {
            canvas.drawLine(0f, height / 2f, width.toFloat(), height / 2f, paint)
        }
        return bitmap
    }

    /** Org logo from a data URL, flattened on white and scaled to fit the header. */
    private fun decodeLogo(dataUrl: String): Bitmap? =
        runCatching {
            val bytes = Base64.decode(dataUrl.substringAfter(','), Base64.DEFAULT)
            val source = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null
            val scale = minOf(LOGO_MAX_PX.toFloat() / source.width, LOGO_MAX_PX.toFloat() / source.height, 1f)
            val w = (source.width * scale).toInt().coerceAtLeast(1)
            val h = (source.height * scale).toInt().coerceAtLeast(1)
            val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            Canvas(out).apply {
                drawColor(Color.WHITE)
                drawBitmap(Bitmap.createScaledBitmap(source, w, h, true), 0f, 0f, null)
            }
            out
        }.getOrNull()

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

        /** ~40% of the 576 px 80 mm head — large enough for phone cameras at arm's length. */
        private const val QR_SIZE_PX = 240

        private const val LOGO_MAX_PX = 150

        /**
         * 8 dots/mm head → 64 px ≈ 8 mm; with the receipt's trailing spacers the last line clears the
         * blade by a small margin. ~3.5 mm cropped the receipt; ~24 mm left a wide blank tail.
         */
        private const val CUTTER_FEED_PX = 64

        fun create(): ThermalPrinter {
            val driver = DriverManager.getInstance()
            val printer = driver.printer
                ?: error("DriverManager.getPrinter() returned null")
            return ZcsSmartPosPrinter(driver, printer)
        }
    }
}
