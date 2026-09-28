package com.paymentgate.cashier.qr

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import androidx.core.graphics.PathParser
import com.paymentgate.cashier.api.PaymentDetails
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel

/** Which payload the pay QR carries — mirrors the guest pay page toggle. */
enum class QrMode { WithAmount, AddressOnly }

/** With amount = HTTPS pay page (camera shows amount); Address only = bare receive address. */
fun PaymentDetails.qrPayloadFor(mode: QrMode): String =
    when {
        mode == QrMode.AddressOnly && receiveAddress.isNotBlank() -> receiveAddress
        qrPayload.isNotBlank() -> qrPayload
        paymentPageUrl.isNotBlank() -> paymentPageUrl
        else -> receiveAddress
    }

object QrBitmaps {
    fun encode(
        payload: String,
        sizePx: Int = 640,
        errorCorrection: ErrorCorrectionLevel = ErrorCorrectionLevel.M,
    ): Bitmap {
        val hints = mapOf(
            EncodeHintType.ERROR_CORRECTION to errorCorrection,
            EncodeHintType.MARGIN to 1,
            EncodeHintType.CHARACTER_SET to "UTF-8",
        )
        val matrix = QRCodeWriter().encode(payload, BarcodeFormat.QR_CODE, sizePx, sizePx, hints)
        val pixels = IntArray(sizePx * sizePx)
        for (y in 0 until sizePx) {
            for (x in 0 until sizePx) {
                pixels[y * sizePx + x] = if (matrix.get(x, y)) Color.BLACK else Color.WHITE
            }
        }
        return Bitmap.createBitmap(pixels, sizePx, sizePx, Bitmap.Config.ARGB_8888)
    }

    /**
     * QR with the network brand tile in the center (same marks as the guest pay page).
     * ECC H so the mark (≤ 20% width) still scans.
     */
    fun encodeWithNetworkMark(payload: String, network: String, sizePx: Int = 640): Bitmap {
        val qr = encode(payload, sizePx, ErrorCorrectionLevel.H)
        val out = qr.copy(Bitmap.Config.ARGB_8888, true)
        qr.recycle()
        drawNetworkMark(Canvas(out), network, sizePx)
        return out
    }

    private fun drawNetworkMark(canvas: Canvas, network: String, sizePx: Int) {
        val outer = sizePx * 0.2f
        val inset = outer * 0.07f
        val cx = sizePx / 2f
        val cy = sizePx / 2f
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)

        val outerRect = RectF(cx - outer / 2, cy - outer / 2, cx + outer / 2, cy + outer / 2)
        paint.color = Color.WHITE
        canvas.drawRoundRect(outerRect, outer * 0.24f, outer * 0.24f, paint)

        val tile = RectF(
            outerRect.left + inset,
            outerRect.top + inset,
            outerRect.right - inset,
            outerRect.bottom - inset,
        )
        val mark = NetworkMarks.forNetwork(network)
        paint.color = mark?.background ?: Color.rgb(0x64, 0x74, 0x8B)
        canvas.drawRoundRect(tile, tile.width() * 0.22f, tile.width() * 0.22f, paint)

        if (mark == null) {
            paint.color = Color.WHITE
            paint.textAlign = Paint.Align.CENTER
            paint.typeface = Typeface.DEFAULT_BOLD
            paint.textSize = tile.width() * 0.5f
            val letter = network.take(1).uppercase().ifEmpty { "?" }
            val baseline = tile.centerY() - (paint.descent() + paint.ascent()) / 2f
            canvas.drawText(letter, tile.centerX(), baseline, paint)
            return
        }

        // SVG paths use viewBox "4 4 24 24" (same crop as the guest pay page).
        val scale = tile.width() / 24f
        val matrix = Matrix().apply {
            postTranslate(-4f, -4f)
            postScale(scale, scale)
            postTranslate(tile.left, tile.top)
        }
        for (layer in mark.layers) {
            val path = PathParser.createPathFromPathData(layer.pathData)
            path.transform(matrix)
            paint.color = Color.WHITE
            paint.alpha = (layer.opacity * 255).toInt()
            canvas.drawPath(path, paint)
        }
        paint.alpha = 255
    }
}

private object NetworkMarks {
    data class Layer(val pathData: String, val opacity: Float = 1f)

    data class Mark(val background: Int, val layers: List<Layer>)

    private val tron = Mark(
        background = Color.rgb(0xEF, 0x00, 0x27),
        layers = listOf(
            Layer(
                "M21.932 9.913 7.5 7.257l7.595 19.112 10.583-12.894-3.746-3.562zm-.232 1.17 " +
                    "2.208 2.099-6.038 1.093 3.83-3.192zm-5.142 2.973-6.364-5.278 10.402 1.914-4.038 " +
                    "3.364zm-.453.934-1.038 8.58L9.472 9.487l6.633 5.502zm.96.455 6.687-1.21-7.67 " +
                    "9.343.983-8.133z",
            ),
        ),
    )

    private val ethereum = Mark(
        background = Color.rgb(0x62, 0x7E, 0xEA),
        layers = listOf(
            Layer("M16.498 4v8.87l7.497 3.35z", 0.602f),
            Layer("M16.498 4 9 16.22l7.498-3.35z"),
            Layer("M16.498 21.968v6.027L24 17.616z", 0.602f),
            Layer("M16.498 27.995v-6.028L9 17.616z"),
            Layer("m16.498 20.573 7.497-4.353-7.497-3.348z", 0.2f),
            Layer("m9 16.22 7.498 4.353v-7.701z", 0.602f),
        ),
    )

    fun forNetwork(network: String): Mark? =
        when (network.lowercase()) {
            "tron", "tron_nile" -> tron
            "ethereum" -> ethereum
            else -> null
        }
}
