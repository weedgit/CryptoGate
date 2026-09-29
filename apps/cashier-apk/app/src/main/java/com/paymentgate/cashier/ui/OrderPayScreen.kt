package com.paymentgate.cashier.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.paymentgate.cashier.api.AssetNetworkCatalog
import com.paymentgate.cashier.api.OrderStatusUi
import com.paymentgate.cashier.api.PaymentDetails
import com.paymentgate.cashier.hardware.PrintOutcome
import com.paymentgate.cashier.hardware.PrinterHwStatus
import com.paymentgate.cashier.qr.QrBitmaps
import com.paymentgate.cashier.qr.QrMode
import com.paymentgate.cashier.qr.qrPayloadFor
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun OrderPayScreen(
    details: PaymentDetails,
    merchantReference: String? = null,
    canCancel: Boolean = false,
    cancelling: Boolean = false,
    onCancel: (() -> Unit)? = null,
    onPrintReceipt: (suspend () -> PrintOutcome)? = null,
    onViewReceipt: (() -> Unit)? = null,
    onRetryPayment: (() -> Unit)? = null,
    qrMode: QrMode = QrMode.WithAmount,
    onQrModeChange: (QrMode) -> Unit = {},
    onDone: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val addressOnly = qrMode == QrMode.AddressOnly && details.receiveAddress.isNotBlank()
    val qrPayload = details.qrPayloadFor(qrMode)
    val qr = remember(qrPayload, details.network) {
        runCatching { QrBitmaps.encodeWithNetworkMark(qrPayload, details.network) }.getOrElse {
            QrBitmaps.encode(details.paymentPageUrl.ifBlank { details.receiveAddress })
        }
    }
    val statusLabel = OrderStatusUi.label(details.status)
    val statusColor =
        when {
            OrderStatusUi.isAnomaly(details.status) -> MaterialTheme.colorScheme.error
            OrderStatusUi.showsCompleted(details.status) -> MaterialTheme.colorScheme.primary
            details.status == OrderStatusUi.EXPIRED || details.status == OrderStatusUi.FAILED ->
                MaterialTheme.colorScheme.error
            else -> MaterialTheme.colorScheme.onBackground
        }
    val screenW = LocalConfiguration.current.screenWidthDp
    val qrSize = when {
        screenW < 360 -> 200.dp
        screenW < 500 -> 240.dp
        else -> 280.dp
    }
    var remainingSec by remember(details.expiresAt, details.status) {
        mutableIntStateOf(remainingSeconds(details.expiresAt))
    }
    var printing by remember { mutableStateOf(false) }
    var confirmLeave by remember { mutableStateOf(false) }
    val orderOpen = OrderStatusUi.isOpenPaymentOrder(details.status)
    val canPrint =
        onPrintReceipt != null &&
            (OrderStatusUi.showsCompleted(details.status) || OrderStatusUi.isAnomaly(details.status))
    val pending = details.status == OrderStatusUi.PENDING
    val urgent = pending && remainingSec in 1..60
    val infinite = rememberInfiniteTransition(label = "pay-pulse")
    val countdownPulse by infinite.animateFloat(
        initialValue = 1f,
        targetValue = 0.45f,
        animationSpec = infiniteRepeatable(
            animation = tween(700),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "countdown-pulse",
    )
    val statusColorAnimated by animateColorAsState(
        targetValue = statusColor,
        animationSpec = tween(PosMotion.Medium),
        label = "status-color",
    )

    fun requestLeave() {
        if (orderOpen) confirmLeave = true else onDone()
    }

    BackHandler(enabled = orderOpen) { confirmLeave = true }

    LaunchedEffect(details.expiresAt, details.status) {
        while (remainingSec > 0 && details.status == OrderStatusUi.PENDING) {
            delay(1_000)
            remainingSec = remainingSeconds(details.expiresAt)
        }
    }

    if (confirmLeave) {
        AlertDialog(
            onDismissRequest = { confirmLeave = false },
            title = { Text("Leave open order?") },
            text = {
                Text(
                    "Payment is still $statusLabel. Leaving hides the QR from this screen — " +
                        "the order stays open until it expires or completes.",
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmLeave = false
                        onDone()
                    },
                ) { Text("Leave anyway") }
            },
            dismissButton = {
                TextButton(onClick = { confirmLeave = false }) { Text("Stay") }
            },
        )
    }

    val progress =
        remember(details.status, details.confirmations, details.requiredConfirmations) {
            confirmationProgress(
                status = details.status,
                confirmations = details.confirmations,
                requiredConfirmations = details.requiredConfirmations,
            )
        }
    val networkLabel =
        remember(details.asset, details.network) {
            AssetNetworkCatalog.find(details.asset, details.network, null)?.shortNetworkLabel
                ?: details.network.uppercase()
        }

    PosScreenFrame {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            PaymentGateBrand()
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = details.orderNumber,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = "${details.payableAmount.amount} ${details.asset}",
                fontSize = 40.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )
            Text(
                text = "Customer scans to pay",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(10.dp))
            ConfirmationProgressCard(
                model = progress,
                asset = details.asset,
                networkLabel = networkLabel,
            )
            Spacer(modifier = Modifier.height(8.dp))
            AnimatedContent(
                targetState = statusLabel,
                transitionSpec = {
                    (fadeIn(tween(PosMotion.Fast)) + scaleIn(initialScale = 0.92f)) togetherWith
                        (fadeOut(tween(PosMotion.Fast)) + scaleOut(targetScale = 0.92f))
                },
                label = "pay-status",
            ) { label ->
                Text(
                    text = "${details.network.uppercase()} · $label",
                    style = MaterialTheme.typography.titleMedium,
                    color = statusColorAnimated,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            AnimatedVisibility(visible = pending && remainingSec > 0) {
                Text(
                    text = "Expires in ${formatCountdown(remainingSec)}",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.graphicsLayer { alpha = if (urgent) countdownPulse else 1f },
                )
            }
            if (!merchantReference.isNullOrBlank()) {
                Text(
                    text = "Ref · $merchantReference",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            AnimatedVisibility(visible = OrderStatusUi.isAnomaly(details.status)) {
                Text(
                    text = "Do not treat this as completed. Review on the merchant portal.",
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Spacer(modifier = Modifier.height(12.dp))
            if (pending && details.receiveAddress.isNotBlank()) {
                QrModeToggle(
                    mode = if (addressOnly) QrMode.AddressOnly else QrMode.WithAmount,
                    onChange = onQrModeChange,
                )
                Spacer(modifier = Modifier.height(10.dp))
            }
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .background(Color.White)
                    .padding(14.dp),
            ) {
                Image(
                    bitmap = qr.asImageBitmap(),
                    contentDescription = if (addressOnly) "Receive address QR" else "Payment QR",
                    modifier = Modifier.size(qrSize),
                )
            }
            if (pending) {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text =
                        if (addressOnly) {
                            "Address only — customer enters exactly " +
                                "${details.payableAmount.amount} ${details.asset} in their wallet"
                        } else {
                            "Scan with phone camera or wallet app"
                        },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = details.wrongNetworkWarning,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
                fontWeight = FontWeight.SemiBold,
            )
            details.payExactAmountWarning?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center)
            }
            details.memoOrTag?.let {
                Text("Memo: $it", fontFamily = FontFamily.Monospace, fontSize = 14.sp)
            }
            details.memoWarning?.let {
                Text(it, style = MaterialTheme.typography.bodySmall)
            }
            Text(
                text = details.receiveAddress,
                fontFamily = FontFamily.Monospace,
                fontSize = 12.sp,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 6.dp),
            )
            details.txHash?.takeIf { it.isNotBlank() }?.let { hash ->
                Text(
                    text = "Tx · $hash",
                    fontFamily = FontFamily.Monospace,
                    fontSize = 11.sp,
                    textAlign = TextAlign.Center,
                )
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                TextButton(onClick = { copy(context, "Address", details.receiveAddress) }) {
                    Text("Address")
                }
                TextButton(onClick = { copy(context, "Amount", details.copyAmount) }) {
                    Text("Amount")
                }
                TextButton(onClick = { copy(context, "Pay link", details.paymentPageUrl) }) {
                    Text("Link")
                }
            }
            if (details.status == OrderStatusUi.PENDING && PayLinkShare.canShare(details)) {
                OutlinedButton(
                    onClick = { PayLinkShare.share(context, details) },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Send payment link")
                }
            }
            if (details.status == OrderStatusUi.EXPIRED) {
                Spacer(modifier = Modifier.height(12.dp))
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = MaterialTheme.colorScheme.error.copy(alpha = 0.1f),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = "PAYMENT EXPIRED",
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.error,
                        )
                        Text(
                            text = "The QR is no longer valid. Generate a new request before accepting payment.",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
                if (onRetryPayment != null) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Button(
                        onClick = onRetryPayment,
                        modifier =
                            Modifier
                                .fillMaxWidth()
                                .height(56.dp),
                        shape = RoundedCornerShape(14.dp),
                    ) {
                        Text("Retry payment request", fontWeight = FontWeight.SemiBold)
                    }
                }
            }
            if (canCancel && onCancel != null) {
                TextButton(
                    onClick = onCancel,
                    enabled = !cancelling,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (cancelling) "Cancelling…" else "Cancel pending order")
                }
            }
            if (canPrint && onPrintReceipt != null) {
                Button(
                    onClick = {
                        scope.launch {
                            printing = true
                            try {
                                when (val outcome = onPrintReceipt()) {
                                    PrintOutcome.Ok ->
                                        Toast.makeText(
                                            context,
                                            "Receipt sent to local printer",
                                            Toast.LENGTH_SHORT,
                                        ).show()
                                    is PrintOutcome.Failed ->
                                        Toast.makeText(
                                            context,
                                            printFailureMessage(outcome),
                                            Toast.LENGTH_LONG,
                                        ).show()
                                }
                            } finally {
                                printing = false
                            }
                        }
                    },
                    enabled = !printing,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Text(
                        when {
                            printing -> "Printing…"
                            OrderStatusUi.isAnomaly(details.status) -> "Print Attention receipt"
                            else -> "Print receipt"
                        },
                    )
                }
            }
            details.txHash?.takeIf { it.isNotBlank() }?.let { hash ->
                TextButton(
                    onClick = {
                        copy(context, "Tx id", hash)
                        Toast.makeText(context, "✓ Tx id copied", Toast.LENGTH_SHORT).show()
                    },
                ) {
                    Text("Copy tx id")
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedButton(
                onClick = { requestLeave() },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(14.dp),
            ) {
                Text(if (orderOpen) "Leave / New charge" else "New charge →")
            }
            if (!orderOpen && onViewReceipt != null) {
                TextButton(onClick = onViewReceipt, modifier = Modifier.fillMaxWidth()) {
                    Text("View invoice / receipt")
                }
            }
        }
    }
}

/** Same two options as the guest pay page: With amount / Address only. */
@Composable
private fun QrModeToggle(mode: QrMode, onChange: (QrMode) -> Unit) {
    Row(
        modifier = Modifier
            .width(280.dp)
            .clip(RoundedCornerShape(50))
            .background(MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f))
            .padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        QrModeOption("With amount", mode == QrMode.WithAmount) { onChange(QrMode.WithAmount) }
        QrModeOption("Address only", mode == QrMode.AddressOnly) { onChange(QrMode.AddressOnly) }
    }
}

@Composable
private fun RowScope.QrModeOption(label: String, selected: Boolean, onClick: () -> Unit) {
    val bg by animateColorAsState(
        targetValue = if (selected) Color.White else Color.Transparent,
        animationSpec = tween(PosMotion.Fast),
        label = "qr-mode-bg",
    )
    Box(
        modifier = Modifier
            .weight(1f)
            .clip(RoundedCornerShape(50))
            .background(bg)
            .selectable(selected = selected, role = Role.Tab, onClick = onClick)
            .padding(vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = if (selected) Color(0xFF0B0F14) else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

fun printFailureMessage(outcome: PrintOutcome.Failed): String =
    when (outcome.reason) {
        PrinterHwStatus.OutOfPaper -> "Out of paper — load 80 mm roll and retry"
        PrinterHwStatus.Unavailable ->
            outcome.detail ?: "Printer unavailable (generic device or missing SmartPos SDK)"
        PrinterHwStatus.Fault -> outcome.detail ?: "Printer fault — check cover and try again"
        else -> outcome.detail ?: "Print failed"
    }

fun formatReceiptPrintedAt(zone: ZoneId = ZoneId.systemDefault()): String =
    DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm z", Locale.ENGLISH)
        .withZone(zone)
        .format(Instant.now())

private fun remainingSeconds(expiresAt: String): Int {
    return runCatching {
        val end = Instant.parse(expiresAt).toEpochMilli()
        ((end - System.currentTimeMillis()) / 1000).toInt().coerceAtLeast(0)
    }.getOrDefault(0)
}

private fun formatCountdown(totalSec: Int): String {
    val m = totalSec / 60
    val s = totalSec % 60
    return "%d:%02d".format(m, s)
}

private fun copy(context: Context, label: String, value: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText(label, value))
    Toast.makeText(context, "$label copied", Toast.LENGTH_SHORT).show()
}
