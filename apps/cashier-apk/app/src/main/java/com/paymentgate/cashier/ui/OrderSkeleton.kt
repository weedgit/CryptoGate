package com.paymentgate.cashier.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlinx.coroutines.delay
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Placeholder for the Pay / order detail screens while the payment details load, so a tap
 * changes the screen at once. The pulse steps twice a second instead of animating smoothly:
 * on the G7 a smooth pulse kept the GPU busy and delayed the real screen.
 */
@Composable
fun OrderSkeleton(modifier: Modifier = Modifier) {
    var dim by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(500)
            dim = !dim
        }
    }
    val pulse = if (dim) 0.55f else 1f
    PosScreenFrame(applySystemBars = false) {
        Column(
            modifier = modifier
                .fillMaxSize()
                .graphicsLayer { alpha = pulse },
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Bone(width = 120.dp, height = 40.dp, radius = 20.dp)
                Bone(width = 44.dp, height = 44.dp, radius = 22.dp)
            }
            Spacer(modifier = Modifier.height(28.dp))
            Bone(width = 180.dp, height = 22.dp)
            Spacer(modifier = Modifier.height(14.dp))
            Bone(width = 260.dp, height = 44.dp)
            Spacer(modifier = Modifier.height(28.dp))
            Box(
                modifier = Modifier
                    .widthIn(max = 360.dp)
                    .fillMaxWidth(0.62f)
                    .aspectRatio(1f)
                    .clip(RoundedCornerShape(20.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant),
            )
            Spacer(modifier = Modifier.height(28.dp))
            Bone(width = 300.dp, height = 18.dp)
            Spacer(modifier = Modifier.height(10.dp))
            Bone(width = 220.dp, height = 18.dp)
            Spacer(modifier = Modifier.weight(1f))
            Bone(width = Dp.Infinity, height = 56.dp, radius = 14.dp)
        }
    }
}

@Composable
private fun Bone(width: Dp, height: Dp, radius: Dp = 8.dp) {
    val base = if (width == Dp.Infinity) Modifier.fillMaxWidth() else Modifier.width(width)
    Box(
        modifier = base
            .height(height)
            .clip(RoundedCornerShape(radius))
            .background(MaterialTheme.colorScheme.surfaceVariant),
    )
}
