package com.paymentgate.cashier.ui.theme

import android.app.Activity
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin

/**
 * Web cashier palette (`65-palette.css`, `69-cashier.css`): navy + soft gold in dark,
 * daylight sky / mint with blue actions in light.
 */
private object WebDark {
    val Bg = Color(0xFF0A1220)
    val Surface = Color(0xFF101B2D)
    val Elevated = Color(0xFF152238)
    val Border = Color(0xFF1D2A40)
    val BorderStrong = Color(0xFF2A3A55)
    val Muted = Color(0xFF8FA1BA)
    val Text = Color(0xFFEEF3FA)
    val Gold = Color(0xFFF5C451)
    val GoldInk = Color(0xFF1A1204)
    val GoldTint = Color(0xFF2A2A22)
    val Success = Color(0xFF34D399)
    val Danger = Color(0xFFFF5A6A)
}

private object WebLight {
    val Bg = Color(0xFFF4F7FC)
    val Surface = Color(0xFFFFFFFF)
    val Elevated = Color(0xFFF3F6FB)
    val Key = Color(0xFFE8EEF8)
    val Border = Color(0xFFE0E7F1)
    val BorderStrong = Color(0xFFCAD5E5)
    val Muted = Color(0xFF5A6A84)
    val Text = Color(0xFF13203A)
    val Blue = Color(0xFF2563EB)
    val BlueTint = Color(0xFFEFF5FF)
    val BlueInk = Color(0xFF1D4ED8)
    val Success = Color(0xFF059669)
    val Danger = Color(0xFFDC2626)
}

private val LightScheme =
    lightColorScheme(
        primary = WebLight.Blue,
        onPrimary = Color.White,
        primaryContainer = WebLight.BlueTint,
        onPrimaryContainer = WebLight.BlueInk,
        secondary = WebLight.Success,
        onSecondary = Color.White,
        tertiary = Color(0xFFCA8A04),
        background = WebLight.Bg,
        onBackground = WebLight.Text,
        surface = WebLight.Surface,
        onSurface = WebLight.Text,
        surfaceVariant = WebLight.Key,
        onSurfaceVariant = WebLight.Muted,
        surfaceTint = WebLight.Surface,
        surfaceContainerLowest = WebLight.Surface,
        surfaceContainerLow = WebLight.Surface,
        surfaceContainer = WebLight.Elevated,
        surfaceContainerHigh = WebLight.Elevated,
        surfaceContainerHighest = WebLight.Key,
        error = WebLight.Danger,
        onError = Color.White,
        outline = WebLight.BorderStrong,
        outlineVariant = WebLight.Border,
    )

private val DarkScheme =
    darkColorScheme(
        primary = WebDark.Gold,
        onPrimary = WebDark.GoldInk,
        primaryContainer = WebDark.GoldTint,
        onPrimaryContainer = WebDark.Gold,
        secondary = WebDark.Success,
        onSecondary = WebDark.GoldInk,
        tertiary = Color(0xFF2DD4BF),
        background = WebDark.Bg,
        onBackground = WebDark.Text,
        surface = WebDark.Surface,
        onSurface = WebDark.Text,
        surfaceVariant = WebDark.Elevated,
        onSurfaceVariant = WebDark.Muted,
        surfaceTint = WebDark.Surface,
        surfaceContainerLowest = WebDark.Bg,
        surfaceContainerLow = WebDark.Surface,
        surfaceContainer = WebDark.Surface,
        surfaceContainerHigh = WebDark.Elevated,
        surfaceContainerHighest = WebDark.Elevated,
        error = WebDark.Danger,
        onError = WebDark.GoldInk,
        outline = WebDark.BorderStrong,
        outlineVariant = WebDark.Border,
    )

/** True while the dark palette is active — for the few places that draw their own colours. */
val LocalPosDark = compositionLocalOf { false }

@Composable
fun CashierTheme(
    darkTheme: Boolean = false,
    content: @Composable () -> Unit,
) {
    val scheme = if (darkTheme) DarkScheme else LightScheme
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = (if (darkTheme) Color(0xFF0D1728) else Color(0xFFF5F9FF)).toArgb()
            window.navigationBarColor = (if (darkTheme) Color(0xFF070E18) else Color(0xFFF2F8F7)).toArgb()
            val insets = WindowCompat.getInsetsController(window, view)
            insets.isAppearanceLightStatusBars = !darkTheme
            insets.isAppearanceLightNavigationBars = !darkTheme
        }
    }
    CompositionLocalProvider(LocalPosDark provides darkTheme) {
        MaterialTheme(
            colorScheme = scheme,
            content = content,
        )
    }
}

/**
 * Web `.cashier-shell` background: a diagonal base with three soft colour pools
 * (gold / sky / teal in dark, sky / lavender / mint in light).
 */
@Composable
fun PosBackdrop(modifier: Modifier = Modifier) {
    val dark = LocalPosDark.current
    Canvas(modifier = modifier.fillMaxSize()) {
        if (dark) {
            drawBase(165f, listOf(Color(0xFF0D1728), Color(0xFF0A1220), Color(0xFF070E18)), listOf(0f, 0.45f, 1f))
            drawPool(0.10f, 0.0f, 0.60f, 0.45f, Color(240, 180, 41).copy(alpha = 0.05f))
            drawPool(0.92f, 0.06f, 0.55f, 0.50f, Color(56, 189, 248).copy(alpha = 0.07f))
            drawPool(0.80f, 0.96f, 0.50f, 0.45f, Color(45, 212, 191).copy(alpha = 0.05f))
        } else {
            drawBase(170f, listOf(Color(0xFFF5F9FF), Color(0xFFF3F6FC), Color(0xFFF2F8F7)), listOf(0f, 0.5f, 1f))
            drawPool(0.08f, 0.0f, 0.60f, 0.45f, Color(125, 211, 252).copy(alpha = 0.16f))
            drawPool(0.96f, 0.06f, 0.50f, 0.42f, Color(167, 139, 250).copy(alpha = 0.10f))
            drawPool(0.82f, 0.96f, 0.55f, 0.45f, Color(94, 234, 212).copy(alpha = 0.12f))
        }
    }
}

private fun DrawScope.drawBase(angleDeg: Float, colors: List<Color>, stops: List<Float>) {
    val rad = Math.toRadians((angleDeg - 90f).toDouble())
    val dx = cos(rad).toFloat()
    val dy = sin(rad).toFloat()
    val half = (kotlin.math.abs(size.width * dx) + kotlin.math.abs(size.height * dy)) / 2f
    val c = Offset(size.width / 2f, size.height / 2f)
    drawRect(
        Brush.linearGradient(
            colorStops = stops.zip(colors).toTypedArray(),
            start = Offset(c.x - dx * half, c.y - dy * half),
            end = Offset(c.x + dx * half, c.y + dy * half),
        ),
    )
}

/** CSS `radial-gradient(ellipse rx% ry% at x% y%, color 0%, transparent ~70%)`. */
private fun DrawScope.drawPool(x: Float, y: Float, rx: Float, ry: Float, color: Color) {
    val center = Offset(size.width * x, size.height * y)
    val radiusX = size.width * rx
    val radiusY = size.height * ry
    val r = max(radiusX, radiusY)
    scale(radiusX / r, radiusY / r, pivot = center) {
        drawCircle(
            Brush.radialGradient(
                0f to color,
                0.7f to color.copy(alpha = 0f),
                center = center,
                radius = r,
            ),
            radius = r,
            center = center,
        )
    }
}
