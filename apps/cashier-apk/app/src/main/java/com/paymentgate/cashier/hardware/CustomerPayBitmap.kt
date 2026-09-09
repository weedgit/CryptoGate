package com.paymentgate.cashier.hardware

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import com.paymentgate.cashier.qr.QrBitmaps

/**
 * Renders G5 customer bitmap (QR + amount + network + warning).
 * Default 480×480 for Z108S second screen.
 */
object CustomerPayBitmap {
    fun render(
        content: CustomerPayContent,
        width: Int = CustomerScreen.WIDTH_PX,
        height: Int = CustomerScreen.HEIGHT_PX,
    ): Bitmap {
        val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        canvas.drawColor(Color.BLACK)

        val pad = (width * 0.06f).toInt()
        var y = pad

        val titlePaint =
            TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                color = if (content.isAnomaly) Color.rgb(0xFF, 0x6B, 0x6B) else Color.rgb(0x2D, 0xD4, 0xBF)
                textSize = width * 0.045f
                typeface = Typeface.DEFAULT_BOLD
                textAlign = Paint.Align.CENTER
            }
        val title = if (content.isAnomaly) "PAYMENT ANOMALY" else "PAYMENT REQUESTED"
        canvas.drawText(title, width / 2f, y + titlePaint.textSize, titlePaint)
        y += (titlePaint.textSize * 1.6f).toInt()

        val amountPaint =
            TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.WHITE
                textSize = width * 0.09f
                typeface = Typeface.DEFAULT_BOLD
                textAlign = Paint.Align.CENTER
            }
        canvas.drawText(content.amountLine, width / 2f, y + amountPaint.textSize, amountPaint)
        y += (amountPaint.textSize * 1.35f).toInt()

        val netPaint =
            TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.rgb(0x2D, 0xD4, 0xBF)
                textSize = width * 0.04f
                typeface = Typeface.DEFAULT_BOLD
                textAlign = Paint.Align.CENTER
            }
        canvas.drawText(content.networkLabel, width / 2f, y + netPaint.textSize, netPaint)
        y += (netPaint.textSize * 1.5f).toInt()

        content.statusHint?.takeIf { it.isNotBlank() }?.let { hint ->
            val hintPaint =
                TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                    color = Color.LTGRAY
                    textSize = width * 0.035f
                    textAlign = Paint.Align.CENTER
                }
            canvas.drawText(hint, width / 2f, y + hintPaint.textSize, hintPaint)
            y += (hintPaint.textSize * 1.4f).toInt()
        }

        val warnPaint =
            TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.rgb(0xFA, 0xCC, 0x15)
                textSize = width * 0.032f
            }
        val warnWidth = width - pad * 2
        val warnLayout =
            StaticLayout.Builder
                .obtain(content.wrongNetworkWarning, 0, content.wrongNetworkWarning.length, warnPaint, warnWidth)
                .setAlignment(Layout.Alignment.ALIGN_CENTER)
                .setLineSpacing(0f, 1.1f)
                .setIncludePad(false)
                .build()
        canvas.save()
        canvas.translate(pad.toFloat(), y.toFloat())
        warnLayout.draw(canvas)
        canvas.restore()
        y += warnLayout.height + (width * 0.03f).toInt()

        val qrBudget = (height - y - pad - width * 0.06f).toInt().coerceAtLeast(width / 3)
        val qrSize = qrBudget.coerceAtMost(width - pad * 2)
        val qr = QrBitmaps.encode(content.qrPayload, qrSize)
        val qrLeft = (width - qrSize) / 2
        canvas.drawBitmap(qr, qrLeft.toFloat(), y.toFloat(), null)
        qr.recycle()

        val footPaint =
            TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.GRAY
                textSize = width * 0.028f
                textAlign = Paint.Align.CENTER
            }
        canvas.drawText(
            "Powered by PaymentGate",
            width / 2f,
            (height - pad / 2).toFloat(),
            footPaint,
        )
        return bmp
    }

    fun renderIdle(
        width: Int = CustomerScreen.WIDTH_PX,
        height: Int = CustomerScreen.HEIGHT_PX,
    ): Bitmap {
        val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        canvas.drawColor(Color.BLACK)
        val paint =
            TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.rgb(0x2D, 0xD4, 0xBF)
                textSize = width * 0.08f
                typeface = Typeface.DEFAULT_BOLD
                textAlign = Paint.Align.CENTER
            }
        canvas.drawText("PaymentGate", width / 2f, height / 2f, paint)
        val sub =
            TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.GRAY
                textSize = width * 0.04f
                textAlign = Paint.Align.CENTER
            }
        canvas.drawText("Ready", width / 2f, height / 2f + paint.textSize, sub)
        return bmp
    }
}
