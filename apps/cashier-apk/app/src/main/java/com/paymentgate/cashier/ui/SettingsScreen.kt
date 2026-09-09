package com.paymentgate.cashier.ui

import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.paymentgate.cashier.hardware.PrintOutcome
import com.paymentgate.cashier.hardware.PrinterHwStatus
import com.paymentgate.cashier.hardware.ReceiptJob
import kotlinx.coroutines.launch

/**
 * G9 — minimal POS settings. No settlement / xPub / matching / API keys.
 */
@Composable
fun SettingsScreen(
    appVersion: String,
    appEnv: String,
    deviceId: String,
    printerAvailable: Boolean,
    printerStatusLabel: String,
    customerDisplayAvailable: Boolean,
    lastReceipt: ReceiptJob?,
    onReprint: suspend () -> PrintOutcome,
    onBack: () -> Unit,
    onSignOut: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var reprinting by remember { mutableStateOf(false) }

    PosScreenFrame {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.Top,
        ) {
            Text(
                text = "Terminal settings",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "PRINTER",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f),
            )
            Text(
                text = if (printerAvailable) "Thermal 80 mm · $printerStatusLabel" else "Not available (generic build)",
                style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = "CUSTOMER DISPLAY",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f),
            )
            Text(
                text = if (customerDisplayAvailable) "Secondary screen ready" else "Not available (generic build)",
                style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = "DISPLAY",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f),
            )
            Text(
                text = "Keep screen awake while an order is open on Pay",
                style = MaterialTheme.typography.bodyMedium,
            )

            Spacer(modifier = Modifier.height(20.dp))
            Text(
                text = "DEVICE",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f),
            )
            Text("App  $appVersion", style = MaterialTheme.typography.bodySmall)
            Text("Env  $appEnv", style = MaterialTheme.typography.bodySmall)
            Text("Device ID  $deviceId", style = MaterialTheme.typography.bodySmall)

            Spacer(modifier = Modifier.height(24.dp))
            Button(
                onClick = {
                    val job = lastReceipt
                    if (job == null) {
                        Toast.makeText(context, "No receipt to reprint yet", Toast.LENGTH_SHORT).show()
                        return@Button
                    }
                    scope.launch {
                        reprinting = true
                        try {
                            when (val outcome = onReprint()) {
                                PrintOutcome.Ok ->
                                    Toast.makeText(context, "Receipt sent to printer", Toast.LENGTH_SHORT).show()
                                is PrintOutcome.Failed ->
                                    Toast.makeText(context, printFailureMessage(outcome), Toast.LENGTH_LONG).show()
                            }
                        } finally {
                            reprinting = false
                        }
                    }
                },
                enabled = !reprinting && lastReceipt != null && printerAvailable,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    when {
                        reprinting -> "Printing…"
                        lastReceipt == null -> "Reprint last receipt (none yet)"
                        !printerAvailable -> "Reprint unavailable"
                        else -> "Reprint last receipt"
                    },
                )
            }
            if (lastReceipt != null) {
                Text(
                    text = "Last: ${lastReceipt.orderNumber} · ${lastReceipt.amountLine}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f),
                )
            }

            Spacer(modifier = Modifier.height(16.dp))
            OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
                Text("Back")
            }
            Spacer(modifier = Modifier.height(8.dp))
            TextButton(onClick = onSignOut, modifier = Modifier.fillMaxWidth()) {
                Text("Sign out")
            }
        }
    }
}

fun printerStatusLabel(status: PrinterHwStatus): String =
    when (status) {
        PrinterHwStatus.Ready -> "Online"
        PrinterHwStatus.OutOfPaper -> "Out of paper"
        PrinterHwStatus.Fault -> "Fault"
        PrinterHwStatus.Unavailable -> "Unavailable"
        PrinterHwStatus.Unknown -> "Unknown"
    }
