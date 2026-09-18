package com.paymentgate.cashier.ui

import android.graphics.Paint
import android.graphics.Typeface
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

private val Usdt = Color(0xFF26A17B)
private val Usdc = Color(0xFF2775CA)
private val Btc = Color(0xFFF7931A)
private val Eth = Color(0xFF627EEA)
private val Tron = Color(0xFFEF0027)
private val Bnb = Color(0xFFF3BA2F)
private val Polygon = Color(0xFF8247E5)
private val Arb = Color(0xFF12AAFF)
private val Ton = Color(0xFF0098EA)
private val Base = Color(0xFF0052FF)
private val Slate = Color(0xFF64748B)
private val White = Color.White

@Composable
fun AssetIcon(asset: String, size: Dp = 22.dp, modifier: Modifier = Modifier) {
    when (asset.uppercase()) {
        "USDT" -> BrandDisk(Usdt, size, modifier) { tetherMark() }
        "USDC" -> BrandDisk(Usdc, size, modifier) { letterMark("C") }
        "BTC" -> BrandDisk(Btc, size, modifier) { letterMark("B") }
        "ETH" -> BrandDisk(Eth, size, modifier) { ethMark() }
        "TRX" -> BrandDisk(Tron, size, modifier) { tronMark() }
        else -> BrandDisk(Slate, size, modifier) { letterMark(asset.take(1).uppercase()) }
    }
}

@Composable
fun NetworkIcon(network: String, size: Dp = 22.dp, modifier: Modifier = Modifier) {
    when (network) {
        "tron", "tron_nile" -> BrandDisk(Tron, size, modifier) { tronMark() }
        "ethereum" -> BrandDisk(Eth, size, modifier) { ethMark() }
        "bnb_smart_chain" -> BrandDisk(Bnb, size, modifier) { bnbMark() }
        "polygon" -> BrandDisk(Polygon, size, modifier) { letterMark("P") }
        "arbitrum_one" -> BrandDisk(Arb, size, modifier) { letterMark("A") }
        "solana" ->
            BrandDisk(
                brush = Brush.linearGradient(listOf(Color(0xFF9945FF), Color(0xFF14F195))),
                size = size,
                modifier = modifier,
            ) { solMark() }
        "ton" -> BrandDisk(Ton, size, modifier) { tonMark() }
        "base" -> BrandDisk(Base, size, modifier) { baseMark() }
        "bitcoin" -> BrandDisk(Btc, size, modifier) { letterMark("B") }
        else -> BrandDisk(Slate, size, modifier) { letterMark(network.take(1).uppercase()) }
    }
}

@Composable
private fun BrandDisk(
    color: Color,
    size: Dp,
    modifier: Modifier = Modifier,
    glyph: DrawScope.() -> Unit,
) {
    BrandDisk(brush = Brush.linearGradient(listOf(color, color)), size, modifier, glyph)
}

@Composable
private fun BrandDisk(
    brush: Brush,
    size: Dp,
    modifier: Modifier = Modifier,
    glyph: DrawScope.() -> Unit,
) {
    Canvas(
        modifier = modifier
            .size(size)
            .clip(CircleShape),
    ) {
        drawCircle(brush = brush)
        glyph()
    }
}

private fun DrawScope.tetherMark() {
    val w = size.minDimension
    val cx = size.width / 2f
    drawRect(
        color = White,
        topLeft = Offset(cx - w * 0.08f, w * 0.20f),
        size = Size(w * 0.16f, w * 0.38f),
    )
    drawRect(
        color = White,
        topLeft = Offset(cx - w * 0.28f, w * 0.20f),
        size = Size(w * 0.56f, w * 0.12f),
    )
    drawCircle(
        color = White,
        radius = w * 0.16f,
        center = Offset(cx, w * 0.68f),
        style = Stroke(width = w * 0.08f),
    )
}

private fun DrawScope.ethMark() {
    val w = size.minDimension
    val cx = size.width / 2f
    val top = Path().apply {
        moveTo(cx, w * 0.16f)
        lineTo(w * 0.74f, w * 0.50f)
        lineTo(cx, w * 0.62f)
        lineTo(w * 0.26f, w * 0.50f)
        close()
    }
    drawPath(top, White)
    val bottom = Path().apply {
        moveTo(cx, w * 0.66f)
        lineTo(w * 0.74f, w * 0.52f)
        lineTo(cx, w * 0.86f)
        lineTo(w * 0.26f, w * 0.52f)
        close()
    }
    drawPath(bottom, White.copy(alpha = 0.82f))
}

private fun DrawScope.tronMark() {
    val w = size.minDimension
    val path = Path().apply {
        moveTo(w * 0.50f, w * 0.16f)
        lineTo(w * 0.84f, w * 0.80f)
        lineTo(w * 0.16f, w * 0.80f)
        close()
    }
    drawPath(path, White)
}

private fun DrawScope.bnbMark() {
    val w = size.minDimension
    val cx = size.width / 2f
    val cy = size.height / 2f
    val r = w * 0.30f
    val path = Path().apply {
        moveTo(cx, cy - r)
        lineTo(cx + r, cy)
        lineTo(cx, cy + r)
        lineTo(cx - r, cy)
        close()
    }
    drawPath(path, White)
}

private fun DrawScope.solMark() {
    val w = size.minDimension
    val h = w * 0.12f
    val radius = CornerRadius(h)
    drawRoundRect(
        color = White,
        topLeft = Offset(w * 0.20f, w * 0.28f),
        size = Size(w * 0.60f, h),
        cornerRadius = radius,
    )
    drawRoundRect(
        color = White,
        topLeft = Offset(w * 0.20f, w * 0.44f),
        size = Size(w * 0.60f, h),
        cornerRadius = radius,
    )
    drawRoundRect(
        color = White,
        topLeft = Offset(w * 0.20f, w * 0.60f),
        size = Size(w * 0.60f, h),
        cornerRadius = radius,
    )
}

private fun DrawScope.tonMark() {
    val w = size.minDimension
    val path = Path().apply {
        moveTo(w * 0.50f, w * 0.16f)
        lineTo(w * 0.82f, w * 0.78f)
        lineTo(w * 0.18f, w * 0.78f)
        close()
    }
    drawPath(path, White)
}

private fun DrawScope.baseMark() {
    val w = size.minDimension
    drawCircle(White, radius = w * 0.28f)
    drawCircle(Base, radius = w * 0.14f)
}

private fun DrawScope.letterMark(letter: String) {
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = android.graphics.Color.WHITE
        textAlign = Paint.Align.CENTER
        textSize = size.minDimension * 0.52f
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    val y = size.height / 2f - (paint.descent() + paint.ascent()) / 2f
    drawContext.canvas.nativeCanvas.drawText(letter, size.width / 2f, y, paint)
}
