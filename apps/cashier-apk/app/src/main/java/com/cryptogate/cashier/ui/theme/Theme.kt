package com.cryptogate.cashier.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Ink = Color(0xFFE8F5F0)
private val Forest = Color(0xFF0B1F1A)
private val Accent = Color(0xFF3DDC97)

private val Scheme = darkColorScheme(
    primary = Accent,
    onPrimary = Forest,
    background = Forest,
    onBackground = Ink,
    surface = Color(0xFF122E27),
    onSurface = Ink,
    error = Color(0xFFFF8A80),
)

@Composable
fun CashierTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = Scheme,
        content = content,
    )
}
