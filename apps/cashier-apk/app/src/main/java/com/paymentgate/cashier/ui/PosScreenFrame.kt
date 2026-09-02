package com.paymentgate.cashier.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Phone-first POS padding with a readable max width on 7–8" tablets.
 * Compact phones (<360dp) use tighter insets.
 */
@Composable
fun posHorizontalPadding(): Dp {
    val width = LocalConfiguration.current.screenWidthDp
    return when {
        width < 360 -> 16.dp
        width < 600 -> 24.dp
        else -> 32.dp
    }
}

@Composable
fun PosScreenFrame(content: @Composable () -> Unit) {
    val pad = posHorizontalPadding()
    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = pad, vertical = pad),
        contentAlignment = Alignment.TopCenter,
    ) {
        val maxContent = if (maxWidth >= 600.dp) 520.dp else maxWidth
        Box(
            modifier = Modifier
                .widthIn(max = maxContent)
                .fillMaxWidth(),
        ) {
            content()
        }
    }
}
