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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cryptogate.cashier.api.PaymentDetails
import com.cryptogate.cashier.qr.QrBitmaps

@Composable
fun OrderPayScreen(
    details: PaymentDetails,
    onDone: () -> Unit,
) {
    val context = LocalContext.current
    val qr = remember(details.qrPayload) { QrBitmaps.encode(details.qrPayload) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
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
            text = "${details.network.uppercase()} · ${details.status.replace('_', ' ')}",
            style = MaterialTheme.typography.bodyMedium,
        )
        Spacer(modifier = Modifier.height(16.dp))
        Image(
            bitmap = qr.asImageBitmap(),
            contentDescription = "Payment QR",
            modifier = Modifier.size(240.dp),
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
        Spacer(modifier = Modifier.height(16.dp))
        OutlinedButton(
            onClick = onDone,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("New order")
        }
    }
}

private fun copy(context: Context, label: String, value: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText(label, value))
    Toast.makeText(context, "$label copied", Toast.LENGTH_SHORT).show()
}
