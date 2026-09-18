package com.paymentgate.cashier.hardware

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import com.paymentgate.cashier.qr.QrBitmaps

/**
 * Renders G5 customer bitmap (V3): status → amount → network → warn → QR → confirm strip.
 * Default 480×480 for Z108S second screen.
 */
object CustomerPayBitmap {
    private val BrandTeal = Color.rgb(0x00, 0x7A, 0x78)
    private val Success = Color.rgb(0x16, 0xA3, 0x4A)
    private val Danger = Color.rgb(0xDC, 0x26, 0x26)
    private val Warn = Color.rgb(0xFA, 0xCC, 0x15)

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

        val titleColor =
            when {
                content.isAnomaly -> Danger
                content.phaseTitle.contains("CONFIRMED") || content.phaseTitle.contains("CONFIRMING") ->
                    if (content.phaseTitle.contains("CONFIRMED")) Success else BrandTeal
                else -> BrandTeal
            }
        val titlePaint =
            TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                color = titleColor
                textSize = width * 0.042f
                typeface = Typeface.DEFAULT_BOLD
                textAlign = Paint.Align.CENTER
            }
        canvas.drawText(content.phaseTitle, width / 2f, y + titlePaint.textSize, titlePaint)
        y += (titlePaint.textSize * 1.55f).toInt()

        val amountPaint =
            TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.WHITE
                textSize = width * 0.09f
                typeface = Typeface.MONOSPACE
                textAlign = Paint.Align.CENTER
            }
        canvas.drawText(content.amountLine, width / 2f, y + amountPaint.textSize, amountPaint)
        y += (amountPaint.textSize * 1.3f).toInt()

        val netPaint =
            TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                color = BrandTeal
                textSize = width * 0.038f
                typeface = Typeface.DEFAULT_BOLD
                textAlign = Paint.Align.CENTER
            }
        canvas.drawText(content.networkLabel, width / 2f, y + netPaint.textSize, netPaint)
        y += (netPaint.textSize * 1.35f).toInt()

        val warnPaint =
            TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Warn
                textSize = width * 0.03f
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
        y += warnLayout.height + (width * 0.025f).toInt()

        if (!content.hideQr) {
            val stripH = (height * 0.12f).toInt()
            val qrBudget = (height - y - pad - stripH).toInt().coerceAtLeast(width / 3)
            val qrSize = qrBudget.coerceAtMost(width - pad * 2)
            val qr = QrBitmaps.encode(content.qrPayload, qrSize)
            val qrLeft = (width - qrSize) / 2
            canvas.drawBitmap(qr, qrLeft.toFloat(), y.toFloat(), null)
            qr.recycle()
            y += qrSize + (width * 0.02f).toInt()
        } else {
            y += (width * 0.04f).toInt()
        }

        drawConfirmStrip(canvas, content, pad, y, width, height)

        return bmp
    }

    private fun drawConfirmStrip(
        canvas: Canvas,
        content: CustomerPayContent,
        pad: Int,
        top: Int,
        width: Int,
        height: Int,
    ) {
        val stripTop = top.coerceAtMost(height - (height * 0.14f).toInt())
        val labelPaint =
            TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.LTGRAY
                textSize = width * 0.032f
                textAlign = Paint.Align.LEFT
            }
        canvas.drawText(content.progressLabel, pad.toFloat(), stripTop + labelPaint.textSize, labelPaint)

        val req = content.requiredConfirmations.coerceAtLeast(1)
        val conf = content.confirmations.coerceIn(0, req)
        val countPaint =
            TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.WHITE
                textSize = width * 0.045f
                typeface = Typeface.MONOSPACE
                textAlign = Paint.Align.RIGHT
            }
        canvas.drawText(
            "$conf / $req",
            (width - pad).toFloat(),
            stripTop + countPaint.textSize,
            countPaint,
        )

        val barTop = stripTop + (width * 0.06f).toInt()
        val barH = (width * 0.018f).toInt().coerceAtLeast(6)
        val barWidth = width - pad * 2
        val bg = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(0x2A, 0x2A, 0x2A) }
        val fg =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = if (content.isAnomaly) Danger else BrandTeal
            }
        val rect = RectF(pad.toFloat(), barTop.toFloat(), (pad + barWidth).toFloat(), (barTop + barH).toFloat())
        canvas.drawRoundRect(rect, barH / 2f, barH / 2f, bg)
        val fraction =
            when {
                content.phaseTitle.contains("CONFIRMED") -> 1f
                content.phaseTitle.contains("REQUESTED") -> 0.05f
                content.phaseTitle.contains("DETECTED") -> 0.2f
                else -> (0.2f + 0.7f * (conf.toFloat() / req)).coerceIn(0.05f, 1f)
            }
        val fill =
            RectF(pad.toFloat(), barTop.toFloat(), pad + barWidth * fraction, (barTop + barH).toFloat())
        canvas.drawRoundRect(fill, barH / 2f, barH / 2f, fg)
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
                color = BrandTeal
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
