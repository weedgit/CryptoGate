package com.paymentgate.cashier.ui

import android.app.Activity
import android.text.format.DateFormat
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import kotlinx.coroutines.delay

/**
 * Full-screen animated login scene shown after inactivity. The touch that wakes it is consumed so it
 * never reaches the screen underneath.
 */
@Composable
fun ScreenSaver(visible: Boolean, orgName: String?, orgIconKey: String?, onDismiss: () -> Unit) {
    val dismiss by rememberUpdatedState(onDismiss)
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(700)),
        exit = fadeOut(tween(250)),
    ) {
        BackHandler { dismiss() }
        val view = LocalView.current
        DisposableEffect(view) {
            val window = (view.context as? Activity)?.window
            val bars = window?.let { WindowCompat.getInsetsController(it, view) }
            bars?.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            bars?.hide(WindowInsetsCompat.Type.systemBars())
            onDispose { bars?.show(WindowInsetsCompat.Type.systemBars()) }
        }
        Box(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(Unit) {
                    awaitEachGesture {
                        awaitFirstDown(requireUnconsumed = false).consume()
                        dismiss()
                        do {
                            val event = awaitPointerEvent()
                            event.changes.forEach { it.consume() }
                        } while (event.changes.any { it.pressed })
                    }
                },
            contentAlignment = Alignment.Center,
        ) {
            LoginSceneBackground(dark = true)
            SaverClock(modifier = Modifier.align(Alignment.TopCenter).padding(top = 72.dp))
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.padding(horizontal = 32.dp),
            ) {
                OrgBrandMark(iconKey = orgIconKey, size = 140.dp)
                Spacer(modifier = Modifier.height(20.dp))
                Text(
                    text = orgName?.takeIf { it.isNotBlank() } ?: "PaymentGate",
                    fontSize = 36.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    textAlign = TextAlign.Center,
                    style = TextStyle(shadow = SaverShadow),
                )
            }
        }
    }
}

private val SaverShadow = Shadow(color = Color.Black.copy(alpha = 0.6f), offset = Offset(0f, 2f), blurRadius = 8f)

/** Device-local time (follows the system 12/24-hour setting), refreshed on each minute boundary. */
@Composable
private fun SaverClock(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val now by produceState(System.currentTimeMillis()) {
        while (true) {
            value = System.currentTimeMillis()
            delay(60_000L - value % 60_000L)
        }
    }
    val timePattern = if (DateFormat.is24HourFormat(context)) "HH:mm" else "h:mm a"
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = DateFormat.format(timePattern, now).toString(),
            fontSize = 72.sp,
            fontWeight = FontWeight.Light,
            color = Color.White,
            style = TextStyle(shadow = SaverShadow),
        )
        Text(
            text = DateFormat.format("EEEE, MMMM d", now).toString(),
            fontSize = 20.sp,
            color = Color.White.copy(alpha = 0.8f),
            style = TextStyle(shadow = SaverShadow),
        )
    }
}
