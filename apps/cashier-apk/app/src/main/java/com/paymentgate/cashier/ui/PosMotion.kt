package com.paymentgate.cashier.ui

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer

object PosMotion {
    const val Fast = 160
    const val Medium = 240
}

fun <S> AnimatedContentTransitionScope<S>.posScreenTransform(): ContentTransform {
    return (
        fadeIn(animationSpec = tween(PosMotion.Medium)) +
            slideInHorizontally(animationSpec = tween(PosMotion.Medium)) { it / 10 }
        ) togetherWith (
            fadeOut(animationSpec = tween(PosMotion.Fast)) +
                slideOutHorizontally(animationSpec = tween(PosMotion.Fast)) { -it / 14 }
            ) using SizeTransform(clip = false)
}

@Composable
fun rememberAmountPulse(amount: String): Float {
    val scale = remember { Animatable(1f) }
    LaunchedEffect(amount) {
        if (amount.isBlank()) {
            scale.snapTo(1f)
            return@LaunchedEffect
        }
        scale.snapTo(1.07f)
        scale.animateTo(
            targetValue = 1f,
            animationSpec = spring(
                dampingRatio = 0.62f,
                stiffness = Spring.StiffnessMedium,
            ),
        )
    }
    return scale.value
}

@Composable
fun Modifier.posPressScale(interactionSource: MutableInteractionSource): Modifier {
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.96f else 1f,
        animationSpec = spring(stiffness = Spring.StiffnessMedium),
        label = "pos-press",
    )
    return graphicsLayer {
        scaleX = scale
        scaleY = scale
    }
}
