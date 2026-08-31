package com.cryptogate.cashier.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cryptogate.cashier.api.OrderStatusUi
import com.cryptogate.cashier.api.PaymentDetails
import com.cryptogate.cashier.qr.QrBitmaps
import kotlinx.coroutines.delay
import java.time.Instant

@Composable
fun OrderPayScreen(
    details: PaymentDetails,
    merchantReference: String? = null,
    canCancel: Boolean = false,
    cancelling: Boolean = false,
    onCancel: (() -> Unit)? = null,
    onDone: () -> Unit,
) {
    val context = LocalContext.current
    val qr = remember(details.qrPayload) { QrBitmaps.encode(details.qrPayload) }
    val statusLabel = OrderStatusUi.label(details.status)
    val statusColor =
        when {
            OrderStatusUi.isAnomaly(details.status) -> MaterialTheme.colorScheme.error
            OrderStatusUi.showsCompleted(details.status) -> MaterialTheme.colorScheme.primary
            details.status == OrderStatusUi.EXPIRED || details.status == OrderStatusUi.FAILED ->
                MaterialTheme.colorScheme.error
            else -> MaterialTheme.colorScheme.onBackground
        }
    val qrSize = if (LocalConfiguration.current.screenWidthDp < 360) 200.dp else 240.dp
    var remainingSec by remember(details.expiresAt, details.status) {
        mutableIntStateOf(remainingSeconds(details.expiresAt))
    }

    LaunchedEffect(details.expiresAt, details.status) {
        while (
            remainingSec > 0 &&
            details.status == OrderStatusUi.PENDING
        ) {
            delay(1_000)
            remainingSec = remainingSeconds(details.expiresAt)
        }
    }

    PosScreenFrame {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Top,
    ) {
        Text(
            text = details.orderNumber,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary,
        )
        Text(
            text = "${details.payableAmount.amount} ${details.asset}",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = "${details.network.uppercase()} · $statusLabel",
            style = MaterialTheme.typography.bodyMedium,
            color = statusColor,
            fontWeight = if (OrderStatusUi.isAnomaly(details.status)) FontWeight.Bold else FontWeight.Normal,
        )
        if (details.status == OrderStatusUi.VERIFYING) {
            Text(
                text = "Confirmations ${details.confirmations}/${details.requiredConfirmations}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.primary,
            )
        }
        if (details.status == OrderStatusUi.PENDING && remainingSec > 0) {
            Text(
                text = "Expires in ${formatCountdown(remainingSec)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
        if (!merchantReference.isNullOrBlank()) {
            Text(
                text = "Ref · $merchantReference",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.75f),
            )
        }
        if (OrderStatusUi.isAnomaly(details.status)) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Do not treat this as completed. Review on the merchant portal.",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
            )
        }
        Spacer(modifier = Modifier.height(16.dp))
        Image(
            bitmap = qr.asImageBitmap(),
            contentDescription = "Payment QR",
            modifier = Modifier.size(qrSize),
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = details.receiveAddress,
            fontFamily = FontFamily.Monospace,
            fontSize = 13.sp,
            modifier = Modifier.fillMaxWidth(),
        )
        details.memoOrTag?.let {
            Spacer(modifier = Modifier.height(8.dp))
            Text("Memo: $it", fontFamily = FontFamily.Monospace)
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = details.wrongNetworkWarning,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
        )
        details.payExactAmountWarning?.let {
            Spacer(modifier = Modifier.height(6.dp))
            Text(it, style = MaterialTheme.typography.bodySmall)
        }
        details.memoWarning?.let {
            Spacer(modifier = Modifier.height(6.dp))
            Text(it, style = MaterialTheme.typography.bodySmall)
        }
        Spacer(modifier = Modifier.height(16.dp))
        OutlinedButton(
            onClick = { copy(context, "Address", details.receiveAddress) },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Copy address")
        }
        Spacer(modifier = Modifier.height(8.dp))
        OutlinedButton(
            onClick = { copy(context, "Amount", details.copyAmount) },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Copy amount")
        }
        Spacer(modifier = Modifier.height(8.dp))
        OutlinedButton(
            onClick = { copy(context, "Pay link", details.paymentPageUrl) },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Copy guest pay link")
        }
        if (canCancel && onCancel != null) {
            Spacer(modifier = Modifier.height(12.dp))
            TextButton(
                onClick = onCancel,
                enabled = !cancelling,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (cancelling) "Cancelling…" else "Cancel pending order")
            }
        }
        Spacer(modifier = Modifier.height(16.dp))
        OutlinedButton(
            onClick = onDone,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("New order")
        }
    }
    }
}

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
