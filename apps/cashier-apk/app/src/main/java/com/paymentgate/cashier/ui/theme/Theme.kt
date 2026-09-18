package com.paymentgate.cashier.ui.theme

import android.app.Activity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

/** V3 cashier tokens — light industrial Payment Rail. */
private val Brand = Color(0xFF007A78)
private val BrandSoft = Color(0xFFE0F2F1)
private val Ink = Color(0xFF12161A)
private val Muted = Color(0xFF606970)
private val Bg = Color(0xFFF4F5F6)
private val Elevated = Color(0xFFFFFFFF)
private val Surface = Color(0xFFEBECEE)
private val Success = Color(0xFF16A34A)
private val Danger = Color(0xFFDC2626)
private val DarkBg = Color(0xFF0B0F12)
private val DarkSurface = Color(0xFF161B20)

private val LightScheme =
    lightColorScheme(
        primary = Brand,
        onPrimary = Elevated,
        primaryContainer = BrandSoft,
        onPrimaryContainer = Ink,
        secondary = Success,
        onSecondary = Elevated,
        background = Bg,
        onBackground = Ink,
        surface = Elevated,
        onSurface = Ink,
        surfaceVariant = Surface,
        onSurfaceVariant = Muted,
        error = Danger,
        onError = Elevated,
        outline = Color(0xFFC5CBD0),
    )

private val DarkScheme =
    darkColorScheme(
        primary = Brand,
        onPrimary = Elevated,
        primaryContainer = Color(0xFF0E3D3C),
        onPrimaryContainer = BrandSoft,
        secondary = Success,
        onSecondary = Elevated,
        background = DarkBg,
        onBackground = Color(0xFFF4F5F6),
        surface = DarkSurface,
        onSurface = Color(0xFFF4F5F6),
        surfaceVariant = Color(0xFF1E252B),
        onSurfaceVariant = Color(0xFF9AA3AA),
        error = Danger,
        onError = Elevated,
        outline = Color(0xFF3A4248),
    )

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
            window.statusBarColor = scheme.background.toArgb()
            window.navigationBarColor = scheme.background.toArgb()
            val insets = WindowCompat.getInsetsController(window, view)
            insets.isAppearanceLightStatusBars = !darkTheme
            insets.isAppearanceLightNavigationBars = !darkTheme
        }
    }
    MaterialTheme(
        colorScheme = scheme,
        content = content,
    )
}
