package com.paymentgate.cashier.ui

import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
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
    apiBaseUrl: String,
    deviceId: String,
    darkTheme: Boolean,
    onDarkThemeChange: (Boolean) -> Unit,
    printerAvailable: Boolean,
    printerStatusLabel: String,
    customerDisplayAvailable: Boolean,
    lastReceipt: ReceiptJob?,
    onReprint: suspend () -> PrintOutcome,
    onTestPrint: (suspend () -> PrintOutcome)? = null,
    onBack: () -> Unit,
    orgName: String,
    orgTypeLabel: String,
    operatorName: String,
    operatorRoleLabel: String,
    canUnbind: Boolean,
    onUnbind: suspend () -> String?,
    onLockNow: (() -> Unit)? = null,
    idleLockMinutes: Int = 5,
    onIdleLockMinutesChange: ((Int) -> Unit)? = null,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var reprinting by remember { mutableStateOf(false) }
    var testing by remember { mutableStateOf(false) }
    var confirmUnbind by remember { mutableStateOf(false) }
    var unbinding by remember { mutableStateOf(false) }
    var unbindError by remember { mutableStateOf<String?>(null) }

    if (confirmUnbind) {
        AlertDialog(
            onDismissRequest = { if (!unbinding) confirmUnbind = false },
            title = { Text("Unbind this POS?") },
            text = {
                Column {
                    Text(
                        "This POS stops charging for $orgName. PINs stop working here " +
                            "until an Owner or Admin sets it up again with email and password.",
                    )
                    if (unbindError != null) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(unbindError.orEmpty(), color = MaterialTheme.colorScheme.error)
                    }
                }
            },
            confirmButton = {
                TextButton(
                    enabled = !unbinding,
                    onClick = {
                        scope.launch {
                            unbinding = true
                            unbindError = onUnbind()
                            unbinding = false
                            if (unbindError == null) confirmUnbind = false
                        }
                    },
                ) {
                    Text(
                        if (unbinding) "Unbinding…" else "Unbind",
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            },
            dismissButton = {
                TextButton(enabled = !unbinding, onClick = { confirmUnbind = false }) {
                    Text("Cancel")
                }
            },
        )
    }

    PosScreenFrame(applySystemBars = false) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.Top,
        ) {
            Text(
                text = "More",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "POS & OPERATOR",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f),
            )
            Text(
                text = "$orgName · $orgTypeLabel",
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "Signed in: $operatorName · $operatorRoleLabel",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(8.dp))
            if (onLockNow != null) {
                OutlinedButton(
                    onClick = onLockNow,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Lock / switch user")
                }
                Spacer(modifier = Modifier.height(8.dp))
            }
            Text(
                text = "Idle lock",
                style = MaterialTheme.typography.labelLarge,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                listOf(0 to "Off", 5 to "5m", 10 to "10m", 15 to "15m", 30 to "30m")
                    .forEach { (mins, label) ->
                        FilterChip(
                            selected = idleLockMinutes == mins,
                            onClick = { onIdleLockMinutesChange?.invoke(mins) },
                            enabled = onIdleLockMinutesChange != null,
                            modifier = Modifier.weight(1f),
                            label = { Text(label) },
                        )
                    }
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Each person unlocks with their own PIN — including after restart. Owners and Admins generate PINs on the web dashboard (Team).",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "APPEARANCE",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f),
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedButton(
                    onClick = { onDarkThemeChange(false) },
                    modifier = Modifier.weight(1f),
                    enabled = darkTheme,
                ) {
                    Text(if (!darkTheme) "Light ✓" else "Light")
                }
                OutlinedButton(
                    onClick = { onDarkThemeChange(true) },
                    modifier = Modifier.weight(1f),
                    enabled = !darkTheme,
                ) {
                    Text(if (darkTheme) "Dark ✓" else "Dark")
                }
            }
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
            if (onTestPrint != null) {
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedButton(
                    onClick = {
                        scope.launch {
                            testing = true
                            try {
                                when (val outcome = onTestPrint()) {
                                    PrintOutcome.Ok ->
                                        Toast.makeText(context, "Test feed sent", Toast.LENGTH_SHORT).show()
                                    is PrintOutcome.Failed ->
                                        Toast.makeText(
                                            context,
                                            printFailureMessage(outcome),
                                            Toast.LENGTH_LONG,
                                        ).show()
                                }
                            } finally {
                                testing = false
                            }
                        }
                    },
                    enabled = !testing && printerAvailable,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (testing) "Testing…" else "Test thermal feed")
                }
            }
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
            Text("API  $apiBaseUrl", style = MaterialTheme.typography.bodySmall)
            Text("Device ID  $deviceId", style = MaterialTheme.typography.bodySmall)

            Spacer(modifier = Modifier.height(24.dp))
            Button(
                onClick = {
                    if (lastReceipt == null) {
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
                                    Toast.makeText(
                                        context,
                                        printFailureMessage(outcome),
                                        Toast.LENGTH_LONG,
                                    ).show()
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
            if (canUnbind) {
                Spacer(modifier = Modifier.height(8.dp))
                TextButton(
                    onClick = {
                        unbindError = null
                        confirmUnbind = true
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Unbind this POS", color = MaterialTheme.colorScheme.error)
                }
                Text(
                    text = "Owner/Admin only. Removes this POS from $orgName. Setting it up again needs Owner/Admin email and password.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.65f),
                )
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
