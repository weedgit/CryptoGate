package com.paymentgate.cashier.ui

import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.ui.window.Dialog
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.geometry.Offset
import androidx.compose.material3.Icon
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.Print
import androidx.compose.material.icons.outlined.NoteAdd
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Cancel
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.Icons
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.clickable
import androidx.compose.foundation.border
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.BorderStroke
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.MutableTransitionState
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
    topBarTrailing: @Composable () -> Unit = {},
    onDone: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val colors = MaterialTheme.colorScheme
    val addressOnly = qrMode == QrMode.AddressOnly && details.receiveAddress.isNotBlank()
    val qrPayload = details.qrPayloadFor(qrMode)
    val qr = remember(qrPayload) {
        runCatching { QrBitmaps.encode(qrPayload, errorCorrection = ErrorCorrectionLevel.H) }.getOrElse {
            QrBitmaps.encode(details.paymentPageUrl.ifBlank { details.receiveAddress })
        }.asImageBitmap()
    }
    val statusLabel = OrderStatusUi.label(details.status)
    val screenW = LocalConfiguration.current.screenWidthDp
    val qrSize = when {
        screenW < 360 -> 200.dp
        screenW < 500 -> 240.dp
        else -> 270.dp
    }
    var remainingSec by remember(details.expiresAt, details.status) {
        mutableIntStateOf(remainingSeconds(details.expiresAt))
    }
    var printing by remember { mutableStateOf(false) }
    var confirmLeave by remember { mutableStateOf(false) }
    val orderOpen = OrderStatusUi.isOpenPaymentOrder(details.status)
    val paid = OrderStatusUi.showsCompleted(details.status)
    val canPrint =
        onPrintReceipt != null && (paid || OrderStatusUi.isAnomaly(details.status))
    val pending = details.status == OrderStatusUi.PENDING
    val urgent = pending && remainingSec in 1..60
    val infinite = rememberInfiniteTransition(label = "pay-pulse")
    val countdownPulse by infinite.animateFloat(
        initialValue = 1f,
        targetValue = 0.45f,
        animationSpec = infiniteRepeatable(animation = tween(700), repeatMode = RepeatMode.Reverse),
        label = "countdown-pulse",
    )
    val pair = remember(details.asset, details.network) { AssetNetworkCatalog.find(details.asset, details.network, null) }
    val networkLabel = pair?.shortNetworkLabel ?: details.network.uppercase()
    val testnet = pair?.chainEnv == "testnet" || details.network.contains("nile") || details.network.contains("sepolia") ||
        details.network.contains("devnet")
    val progress = remember(details.status, details.confirmations, details.requiredConfirmations) {
        confirmationProgress(details.status, details.confirmations, details.requiredConfirmations)
    }
    val stamp = payStampFor(details.status)

    fun requestLeave() {
        if (orderOpen) confirmLeave = true else onDone()
    }

    fun print() {
        val action = onPrintReceipt ?: return
        scope.launch {
            printing = true
            try {
                when (val outcome = action()) {
                    PrintOutcome.Ok -> Toast.makeText(context, "Receipt sent to local printer", Toast.LENGTH_SHORT).show()
                    is PrintOutcome.Failed -> Toast.makeText(context, printFailureMessage(outcome), Toast.LENGTH_LONG).show()
                }
            } finally {
                printing = false
            }
        }
    }

    BackHandler(enabled = orderOpen) { confirmLeave = true }

    LaunchedEffect(details.expiresAt, details.status) {
        while (remainingSec > 0 && details.status == OrderStatusUi.PENDING) {
            delay(1_000)
            remainingSec = remainingSeconds(details.expiresAt)
        }
    }

    if (confirmLeave) {
        LeaveOrderDialog(
            onStay = { confirmLeave = false },
            onLeave = {
                confirmLeave = false
                onDone()
            },
        )
    }

    val entered = remember { MutableTransitionState(false).apply { targetState = true } }

    PosScreenFrame {
        Column(modifier = Modifier.fillMaxSize()) {
            PageTopBar(title = "Payment", onBack = { requestLeave() }, trailing = topBarTrailing)
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                AnimatedVisibility(
                    visibleState = entered,
                    enter = fadeIn(tween(PosMotion.Medium)) + slideInVertically(tween(PosMotion.Medium)) { -it / 6 },
                ) {
                    PayCard {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                            Text(details.orderNumber, fontSize = 16.sp, color = colors.onSurfaceVariant)
                            Text(
                                text = "${groupThousands(details.payableAmount.amount)} ${details.asset}",
                                fontSize = 40.sp,
                                fontWeight = FontWeight.Black,
                                color = colors.onSurface,
                            )
                            Row(
                                modifier = Modifier.padding(top = 6.dp),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                PayChip(networkLabel, colors.primary)
                                if (testnet) PayChip("Testnet", Color(0xFFC2610C))
                            }
                            if (!merchantReference.isNullOrBlank()) {
                                Text(
                                    "Note · $merchantReference",
                                    fontSize = 14.sp,
                                    color = colors.onSurfaceVariant,
                                    modifier = Modifier.padding(top = 6.dp),
                                )
                            }
                        }
                        HorizontalDivider(modifier = Modifier.padding(vertical = 14.dp), color = colors.outlineVariant)
                        PayStatusHeader(progress, details.status)
                        Spacer(modifier = Modifier.height(16.dp))
                        PayStepper(progress)
                    }
                }

                AnimatedVisibility(
                    visibleState = entered,
                    enter = fadeIn(tween(PosMotion.Medium, delayMillis = 90)) +
                        slideInVertically(tween(PosMotion.Medium, delayMillis = 90)) { it / 6 },
                ) {
                    PayCard {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                            AnimatedVisibility(visible = pending && remainingSec > 0) {
                                Text(
                                    text = "Expires in ${formatCountdown(remainingSec)}",
                                    fontSize = 20.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = colors.error,
                                    modifier = Modifier
                                        .padding(bottom = 10.dp)
                                        .graphicsLayer { alpha = if (urgent) countdownPulse else 1f },
                                )
                            }
                            if (pending && details.receiveAddress.isNotBlank()) {
                                QrModeToggle(
                                    mode = if (addressOnly) QrMode.AddressOnly else QrMode.WithAmount,
                                    onChange = onQrModeChange,
                                )
                                Spacer(modifier = Modifier.height(12.dp))
                            }
                            PayQr(qr = qr, qrKey = qrPayload, size = qrSize, network = details.network, stamp = stamp)
                            Text(
                                text = when {
                                    stamp != null -> stamp.caption
                                    addressOnly -> "Address only — enter exactly ${details.payableAmount.amount} ${details.asset} in the wallet"
                                    else -> "Scan with your wallet app"
                                },
                                fontSize = 15.sp,
                                color = colors.onSurfaceVariant,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.padding(top = 8.dp),
                            )
                        }
                        if (orderOpen) {
                            Spacer(modifier = Modifier.height(12.dp))
                            NetworkWarning("${details.asset} on $networkLabel only")
                        }
                        details.memoOrTag?.let {
                            Text("Memo: $it", fontFamily = FontFamily.Monospace, fontSize = 14.sp, modifier = Modifier.padding(top = 8.dp))
                        }
                        Spacer(modifier = Modifier.height(10.dp))
                        CopyRow("Wallet address", details.receiveAddress) { copy(context, "Address", details.receiveAddress) }
                        details.txHash?.takeIf { it.isNotBlank() }?.let { hash ->
                            Spacer(modifier = Modifier.height(8.dp))
                            CopyRow("Transaction", hash) { copy(context, "Tx id", hash) }
                        }
                        AnimatedVisibility(visible = OrderStatusUi.isAnomaly(details.status)) {
                            Text(
                                text = "Do not treat this as completed. Review on the merchant portal.",
                                color = colors.error,
                                fontWeight = FontWeight.SemiBold,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                            )
                        }

                        Spacer(modifier = Modifier.height(14.dp))
                        when {
                            details.status == OrderStatusUi.EXPIRED && onRetryPayment != null ->
                                PrimaryAction(Icons.Outlined.Refresh, "Retry payment request") { onRetryPayment() }
                            canPrint ->
                                PrimaryAction(
                                    Icons.Outlined.Print,
                                    when {
                                        printing -> "Printing…"
                                        OrderStatusUi.isAnomaly(details.status) -> "Print Attention receipt"
                                        else -> "Print receipt"
                                    },
                                    enabled = !printing,
                                ) { print() }
                            else -> PrimaryAction(Icons.Outlined.NoteAdd, "New charge") { requestLeave() }
                        }
                        val showShare = pending && PayLinkShare.canShare(details)
                        val showCancel = canCancel && onCancel != null
                        val showNewCharge = canPrint || (details.status == OrderStatusUi.EXPIRED && onRetryPayment != null)
                        if (showShare || showCancel || showNewCharge || (!orderOpen && onViewReceipt != null)) {
                            Spacer(modifier = Modifier.height(10.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                if (showShare) {
                                    PayOutlinedAction(Icons.Outlined.Link, "Send link", colors.primary, Modifier.weight(1f)) {
                                        PayLinkShare.share(context, details)
                                    }
                                }
                                if (showCancel) {
                                    PayOutlinedAction(
                                        Icons.Outlined.Cancel,
                                        if (cancelling) "Cancelling…" else "Cancel order",
                                        colors.error,
                                        Modifier.weight(1f),
                                        enabled = !cancelling,
                                    ) { onCancel?.invoke() }
                                }
                                if (!orderOpen && onViewReceipt != null) {
                                    PayOutlinedAction(Icons.Outlined.ReceiptLong, "View invoice", colors.primary, Modifier.weight(1f)) {
                                        onViewReceipt()
                                    }
                                }
                                if (showNewCharge) {
                                    PayOutlinedAction(Icons.Outlined.NoteAdd, "New charge", colors.primary, Modifier.weight(1f)) {
                                        requestLeave()
                                    }
                                }
                            }
                        }
                    }
                }
                Spacer(modifier = Modifier.height(4.dp))
            }
        }
    }
}

@Composable
private fun LeaveOrderDialog(onStay: () -> Unit, onLeave: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    Dialog(onDismissRequest = onStay) {
        Surface(shape = RoundedCornerShape(20.dp), color = colors.surface, modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(horizontal = 24.dp, vertical = 22.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.AutoMirrored.Outlined.Logout,
                        contentDescription = null,
                        tint = colors.primary,
                        modifier = Modifier.size(28.dp),
                    )
                    Spacer(modifier = Modifier.width(14.dp))
                    Text("Leave open order?", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = colors.onSurface)
                }
                Text(
                    "The QR will close.\nThe order stays open until paid or expired.",
                    fontSize = 16.sp,
                    lineHeight = 22.sp,
                    color = colors.onSurfaceVariant,
                    modifier = Modifier.padding(top = 12.dp, bottom = 20.dp),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedButton(
                        onClick = onStay,
                        modifier = Modifier.weight(1f).height(52.dp),
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(1.dp, colors.primary.copy(alpha = 0.5f)),
                    ) { Text("Stay", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = colors.onSurface) }
                    Button(
                        onClick = onLeave,
                        modifier = Modifier.weight(1.4f).height(52.dp),
                        shape = RoundedCornerShape(12.dp),
                    ) { Text("Leave order open", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 1) }
                }
            }
        }
    }
}

@Composable
private fun PayCard(content: @Composable ColumnScope.() -> Unit) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(18.dp), content = content)
    }
}

@Composable
private fun PayChip(label: String, tone: Color) {
    Text(
        text = label,
        fontSize = 15.sp,
        fontWeight = FontWeight.SemiBold,
        color = tone,
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(tone.copy(alpha = 0.12f))
            .padding(horizontal = 14.dp, vertical = 4.dp),
    )
}

@Composable
private fun PayStatusHeader(model: ConfirmationProgressModel, status: String) {
    val colors = MaterialTheme.colorScheme
    val (title, subtitle) = when (model.phase) {
        ConfirmationPhase.Requested -> "Waiting for payment" to "Customer scans the QR code to pay"
        ConfirmationPhase.Detected -> "Payment detected" to "Transaction found · waiting for confirmations"
        ConfirmationPhase.Confirming ->
            "Confirming ${model.confirmations}/${model.requiredConfirmations}" to "Almost there — keep this screen open"
        ConfirmationPhase.Paid -> "Payment complete" to "Confirmed on-chain · thank you"
        ConfirmationPhase.Anomaly -> "Needs review" to "Do not treat as completed"
        ConfirmationPhase.Expired ->
            (if (status == OrderStatusUi.EXPIRED) "Payment expired" else "Payment failed") to "Create a new charge to collect again"
        ConfirmationPhase.Other -> OrderStatusUi.label(status) to ""
    }
    val tone = when (model.phase) {
        ConfirmationPhase.Paid -> PayGreen
        ConfirmationPhase.Anomaly, ConfirmationPhase.Expired -> colors.error
        else -> colors.primary
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(modifier = Modifier.size(30.dp), contentAlignment = Alignment.Center) {
            AnimatedContent(
                targetState = model.phase,
                transitionSpec = { (fadeIn() + scaleIn(initialScale = 0.6f)) togetherWith fadeOut() },
                label = "pay-status-icon",
            ) { phase ->
                when (phase) {
                    ConfirmationPhase.Requested, ConfirmationPhase.Detected, ConfirmationPhase.Confirming ->
                        CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 3.dp, color = tone)
                    ConfirmationPhase.Paid ->
                        Icon(Icons.Outlined.CheckCircle, contentDescription = null, tint = tone, modifier = Modifier.size(30.dp))
                    else -> Icon(Icons.Outlined.ErrorOutline, contentDescription = null, tint = tone, modifier = Modifier.size(30.dp))
                }
            }
        }
        Spacer(modifier = Modifier.width(14.dp))
        AnimatedContent(
            targetState = title to subtitle,
            transitionSpec = {
                (fadeIn(tween(PosMotion.Fast)) + slideInVertically { it / 3 }) togetherWith fadeOut(tween(PosMotion.Fast))
            },
            label = "pay-status-text",
        ) { (t, sub) ->
            Column {
                Text(t, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = if (tone == colors.primary) colors.onSurface else tone)
                if (sub.isNotBlank()) Text(sub, fontSize = 15.sp, color = colors.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun PayStepper(model: ConfirmationProgressModel) {
    val colors = MaterialTheme.colorScheme
    val steps = listOf("Requested", "Detected", "Confirming", "Paid")
    val current = when (model.phase) {
        ConfirmationPhase.Requested -> 0
        ConfirmationPhase.Detected -> 1
        ConfirmationPhase.Confirming -> 2
        ConfirmationPhase.Paid -> 3
        else -> -1
    }
    val fill by animateFloatAsState(
        targetValue = if (current < 0) 0f else current / 3f,
        animationSpec = tween(PosMotion.Medium * 2),
        label = "stepper-fill",
    )
    val pulse = rememberInfiniteTransition(label = "stepper-pulse")
    val halo by pulse.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(1400)),
        label = "stepper-halo",
    )
    val done = if (model.phase == ConfirmationPhase.Paid) PayGreen else colors.primary
    val idle = colors.outline.copy(alpha = 0.5f)
    Column {
        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .height(22.dp),
        ) {
            val slot = size.width / steps.size
            val y = size.height / 2
            val start = slot / 2
            val end = size.width - slot / 2
            drawLine(idle, Offset(start, y), Offset(end, y), strokeWidth = 2.dp.toPx())
            drawLine(done, Offset(start, y), Offset(start + (end - start) * fill, y), strokeWidth = 3.dp.toPx())
            steps.indices.forEach { i ->
                val cx = start + (end - start) * i / 3f
                val reached = current >= i
                if (i == current && model.phase != ConfirmationPhase.Paid) {
                    drawCircle(done.copy(alpha = 0.35f * (1f - halo)), radius = 6.dp.toPx() + 8.dp.toPx() * halo, center = Offset(cx, y))
                }
                drawCircle(if (reached) done else idle, radius = if (i == current) 6.dp.toPx() else 4.5.dp.toPx(), center = Offset(cx, y))
            }
        }
        Row(modifier = Modifier.fillMaxWidth().padding(top = 4.dp)) {
            steps.forEachIndexed { i, label ->
                Text(
                    text = label,
                    fontSize = 14.sp,
                    fontWeight = if (i == current) FontWeight.SemiBold else FontWeight.Normal,
                    color = when {
                        i == current -> done
                        i < current -> colors.onSurface
                        else -> colors.onSurfaceVariant
                    },
                    textAlign = TextAlign.Center,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

private val PayGreen = Color(0xFF16A34A)

private data class PayStamp(val label: String, val tone: Color, val caption: String)

private fun payStampFor(status: String): PayStamp? =
    when {
        OrderStatusUi.showsCompleted(status) -> PayStamp("PAID", PayGreen, "Payment received — this QR is closed")
        OrderStatusUi.isAnomaly(status) -> PayStamp("REVIEW", Color(0xFFD97706), "Needs review before treating as paid")
        status == OrderStatusUi.EXPIRED -> PayStamp("EXPIRED", Color(0xFFDC2626), "This QR is no longer valid")
        status == OrderStatusUi.FAILED -> PayStamp("FAILED", Color(0xFFDC2626), "This QR is no longer valid")
        status == OrderStatusUi.CANCELLED -> PayStamp("CANCELLED", Color(0xFFDC2626), "This QR is no longer valid")
        else -> null
    }

/** QR with the network mark on top; closed orders get a stamp slammed over a faded code. */
@Composable
private fun PayQr(qr: ImageBitmap, qrKey: String, size: androidx.compose.ui.unit.Dp, network: String, stamp: PayStamp?) {
    val colors = MaterialTheme.colorScheme
    val qrAlpha by animateFloatAsState(if (stamp != null) 0.18f else 1f, tween(PosMotion.Medium), label = "qr-alpha")
    var markShown by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { markShown = true }
    val markScale by animateFloatAsState(
        if (markShown) 1f else 0f,
        spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessLow),
        label = "qr-mark",
    )
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(14.dp))
            .background(Color.White)
            .border(1.dp, colors.outlineVariant, RoundedCornerShape(14.dp))
            .padding(12.dp),
        contentAlignment = Alignment.Center,
    ) {
        AnimatedContent(
            targetState = qrKey,
            transitionSpec = { fadeIn(tween(PosMotion.Medium)) togetherWith fadeOut(tween(PosMotion.Fast)) },
            label = "qr-swap",
        ) {
            Image(
                bitmap = qr,
                contentDescription = "Payment QR",
                modifier = Modifier
                    .size(size)
                    .graphicsLayer { alpha = qrAlpha },
            )
        }
        Box(
            modifier = Modifier
                .graphicsLayer {
                    scaleX = markScale
                    scaleY = markScale
                    alpha = qrAlpha
                }
                .clip(RoundedCornerShape(12.dp))
                .background(Color.White)
                .padding(5.dp),
        ) {
            NetworkIcon(network = network, size = size * 0.16f)
        }
        if (stamp != null) PayStampMark(stamp)
    }
}

@Composable
private fun PayStampMark(stamp: PayStamp) {
    var landed by remember(stamp.label) { mutableStateOf(false) }
    LaunchedEffect(stamp.label) { landed = true }
    val scale by animateFloatAsState(
        if (landed) 1f else 2.4f,
        spring(dampingRatio = 0.45f, stiffness = Spring.StiffnessMediumLow),
        label = "stamp-scale",
    )
    val alpha by animateFloatAsState(if (landed) 1f else 0f, tween(220), label = "stamp-alpha")
    Box(
        modifier = Modifier
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                this.alpha = alpha
                rotationZ = -14f
            }
            .border(4.dp, stamp.tone, RoundedCornerShape(14.dp))
            .padding(3.dp)
            .border(1.5.dp, stamp.tone, RoundedCornerShape(11.dp))
            .padding(horizontal = 22.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = stamp.label,
            fontSize = 44.sp,
            fontWeight = FontWeight.Black,
            letterSpacing = 4.sp,
            color = stamp.tone,
        )
    }
}

@Composable
private fun NetworkWarning(text: String) {
    val amber = Color(0xFFB45309)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Color(0xFFF59E0B).copy(alpha = 0.12f))
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.WarningAmber, contentDescription = null, tint = amber, modifier = Modifier.size(24.dp))
        Spacer(modifier = Modifier.width(12.dp))
        Text(text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = amber)
    }
}

@Composable
private fun CopyRow(label: String, value: String, onCopy: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(colors.surfaceVariant.copy(alpha = 0.6f))
            .border(1.dp, colors.outlineVariant, RoundedCornerShape(12.dp))
            .clickable(onClick = onCopy)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, fontSize = 15.sp, color = colors.onSurfaceVariant, modifier = Modifier.width(130.dp))
        Text(
            text = if (value.length > 20) "${value.take(10)}…${value.takeLast(8)}" else value,
            fontSize = 16.sp,
            fontWeight = FontWeight.Medium,
            color = colors.onSurface,
            modifier = Modifier.weight(1f),
            textAlign = TextAlign.Center,
        )
        Icon(Icons.Outlined.ContentCopy, contentDescription = "Copy $label", tint = colors.primary, modifier = Modifier.size(22.dp))
    }
}

@Composable
private fun PrimaryAction(icon: ImageVector, label: String, enabled: Boolean = true, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth().height(56.dp),
        shape = RoundedCornerShape(12.dp),
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(24.dp))
        Spacer(modifier = Modifier.width(12.dp))
        Text(label, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun PayOutlinedAction(
    icon: ImageVector?,
    label: String,
    tone: Color,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(52.dp),
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, tone.copy(alpha = 0.6f)),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = tone),
    ) {
        if (icon != null) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(22.dp))
            Spacer(modifier = Modifier.width(10.dp))
        }
        Text(label, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

/** Same two options as the guest pay page: With amount / Address only. */
@Composable
private fun QrModeToggle(mode: QrMode, onChange: (QrMode) -> Unit) {
    Row(
        modifier = Modifier
            .width(310.dp)
            .clip(RoundedCornerShape(50))
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(50))
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
        targetValue = if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.14f) else Color.Transparent,
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
            color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
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
