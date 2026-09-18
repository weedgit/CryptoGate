package com.paymentgate.cashier.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

@Composable
fun posHorizontalPadding(): Dp {
    val width = LocalConfiguration.current.screenWidthDp
    return when {
        width < 360 -> 16.dp
        width < 600 -> 20.dp
        else -> 24.dp
    }
}

@Composable
fun PosScreenFrame(
    /** False when parent [PosShell] already applied system bar padding. */
    applySystemBars: Boolean = true,
    content: @Composable () -> Unit,
) {
    val pad = posHorizontalPadding()
    val base =
        if (applySystemBars) {
            Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .imePadding()
                .padding(horizontal = pad, vertical = 12.dp)
        } else {
            Modifier
                .fillMaxSize()
                .imePadding()
                .padding(horizontal = pad, vertical = 12.dp)
        }
    BoxWithConstraints(
        modifier = base,
        contentAlignment = Alignment.TopCenter,
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            content()
        }
    }
}
