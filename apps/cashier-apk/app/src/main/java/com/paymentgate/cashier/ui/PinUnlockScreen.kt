package com.paymentgate.cashier.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

/**
 * V3 DEVICE UNLOCK — Enter PIN.
 * @param mode Unlock existing PIN, or Set/Confirm when provisioning the device.
 */
enum class PinScreenMode { Unlock, Set, Confirm }

@Composable
fun PinUnlockScreen(
    mode: PinScreenMode,
    siteName: String = "North Annex",
    error: String?,
    pinLength: Int = 6,
    onPinComplete: (String) -> Unit,
    onClearError: () -> Unit,
) {
    var digits by remember { mutableStateOf("") }
    val title =
        when (mode) {
            PinScreenMode.Unlock -> "Enter PIN"
            PinScreenMode.Set -> "Set device PIN"
            PinScreenMode.Confirm -> "Confirm PIN"
        }
    val subtitle =
        when (mode) {
            PinScreenMode.Unlock -> "Sign in to continue"
            PinScreenMode.Set -> "Choose a 6-digit PIN for this terminal"
            PinScreenMode.Confirm -> "Enter the same PIN again"
        }

    LaunchedEffect(error) {
        if (error != null) {
            delay(1200)
            digits = ""
            onClearError()
        }
    }

    PosScreenFrame {
        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = "DEVICE UNLOCK",
                    fontFamily = FontFamily.Monospace,
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = siteName,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(modifier = Modifier.height(28.dp))
            PaymentGateBrand(iconSize = 36.dp)
            Spacer(modifier = Modifier.height(24.dp))
            Text(
                text = title,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (!error.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = error,
                    color = MaterialTheme.colorScheme.error,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Spacer(modifier = Modifier.height(28.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
            ) {
                repeat(pinLength) { i ->
                    Box(
                        modifier =
                            Modifier
                                .padding(horizontal = 8.dp)
                                .size(14.dp)
                                .clip(CircleShape)
                                .background(
                                    if (i < digits.length) MaterialTheme.colorScheme.primary
                                    else MaterialTheme.colorScheme.outline,
                                ),
                    )
                }
            }
            Spacer(modifier = Modifier.height(28.dp))
            Text(
                text = "PIN PAD",
                fontFamily = FontFamily.Monospace,
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 8.dp),
            )
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 1.dp,
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    listOf(
                        listOf("1", "2", "3"),
                        listOf("4", "5", "6"),
                        listOf("7", "8", "9"),
                        listOf("⌫", "0", "×"),
                    ).forEach { row ->
                        Row(
                            modifier =
                                Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            row.forEach { key ->
                                Surface(
                                    modifier =
                                        Modifier
                                            .weight(1f)
                                            .height(64.dp)
                                            .clickable {
                                                when (key) {
                                                    "×" -> digits = ""
                                                    "⌫" -> if (digits.isNotEmpty()) digits = digits.dropLast(1)
                                                    else -> {
                                                        if (digits.length < pinLength) {
                                                            digits += key
                                                            if (digits.length == pinLength) {
                                                                onPinComplete(digits)
                                                            }
                                                        }
                                                    }
                                                }
                                            },
                                    shape = RoundedCornerShape(14.dp),
                                    color = MaterialTheme.colorScheme.surfaceVariant,
                                ) {
                                    Box(
                                        modifier = Modifier.fillMaxSize(),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Text(
                                            text = key,
                                            fontSize = 22.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            textAlign = TextAlign.Center,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.weight(1f))
            Text(
                text = "PIN is managed on the web dashboard",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
