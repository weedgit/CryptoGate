package com.paymentgate.cashier.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.paymentgate.cashier.R
import kotlinx.coroutines.delay

/** Brand splash on the login hero scene — gold gate mark rises in, then PIN pad or setup. */
@Composable
fun SplashScreen(
    darkTheme: Boolean,
    onFinished: () -> Unit,
) {
    val rise = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        rise.animateTo(1f, tween(640, easing = LinearOutSlowInEasing))
        delay(900)
        onFinished()
    }
    val title = if (darkTheme) Color(0xFFF8FAFC) else Color(0xFF0F172A)
    val muted = if (darkTheme) Color(0xFF94A3B8) else Color(0xFF64748B)
    Box(modifier = Modifier.fillMaxSize()) {
        LoginSceneBackground(dark = darkTheme)
        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .graphicsLayer {
                    alpha = rise.value
                    translationY = (1f - rise.value) * 18.dp.toPx()
                },
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Image(
                painter = painterResource(id = R.drawable.pg_brand_gate),
                contentDescription = "PaymentGate",
                modifier = Modifier.size(132.dp),
            )
            Spacer(modifier = Modifier.height(18.dp))
            Text(
                text = "PaymentGate",
                color = title,
                fontSize = 34.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = (-0.8).sp,
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(text = "Non-custodial crypto payments", color = muted, fontSize = 15.sp)
        }
    }
}
