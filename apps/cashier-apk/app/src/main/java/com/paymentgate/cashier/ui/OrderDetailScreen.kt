package com.paymentgate.cashier.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.paymentgate.cashier.api.AssetNetworkCatalog
import com.paymentgate.cashier.api.OrderStatusUi
import com.paymentgate.cashier.api.PaymentDetails
import com.paymentgate.cashier.hardware.PrintOutcome
import kotlinx.coroutines.launch

/** V3 on-screen invoice — Order detail (Paid / Open / Failed variants). */
@Composable
fun OrderDetailScreen(
    details: PaymentDetails,
    siteName: String = "North Annex",
    cashierName: String? = null,
    merchantReference: String? = null,
    onPrintReceipt: (suspend () -> PrintOutcome)?,
    onResumePayment: (() -> Unit)? = null,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var printing by remember { mutableStateOf(false) }
    val networkLabel =
        AssetNetworkCatalog.find(details.asset, details.network, null)?.shortNetworkLabel
            ?: details.network.uppercase()
    val variant = orderDetailVariant(details.status)
    val statusPill = variant.pill
    val txShort =
        details.txHash?.let { h ->
            if (h.length <= 12) h else "${h.take(4)}…${h.takeLast(4)}"
        } ?: "—"
    val showResume =
        variant == OrderDetailVariant.Open && onResumePayment != null
    val showPrint =
        onPrintReceipt != null &&
            (variant == OrderDetailVariant.Paid || variant == OrderDetailVariant.Open)
    val showCopyTx = !details.txHash.isNullOrBlank()

    PosScreenFrame {
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState()),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                TextButton(onClick = onBack) { Text("← Orders") }
                Text(
                    text = siteName,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            PaymentGateBrand()
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = "ORDER DETAIL",
                fontFamily = FontFamily.Monospace,
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = "${details.payableAmount.amount} ${details.asset}",
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
            )
            Text(
                text = networkLabel,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Surface(
                shape = RoundedCornerShape(8.dp),
                color =
                    when (variant) {
                        OrderDetailVariant.Paid ->
                            MaterialTheme.colorScheme.secondary.copy(alpha = 0.15f)
                        OrderDetailVariant.Open ->
                            MaterialTheme.colorScheme.primaryContainer
                        OrderDetailVariant.Failed,
                        OrderDetailVariant.Expired,
                        OrderDetailVariant.Anomaly,
                        ->
                            MaterialTheme.colorScheme.error.copy(alpha = 0.12f)
                    },
            ) {
                Text(
                    text = statusPill,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                    fontWeight = FontWeight.SemiBold,
                    color =
                        when (variant) {
                            OrderDetailVariant.Paid -> MaterialTheme.colorScheme.secondary
                            OrderDetailVariant.Open -> MaterialTheme.colorScheme.primary
                            OrderDetailVariant.Failed,
                            OrderDetailVariant.Expired,
                            OrderDetailVariant.Anomaly,
                            ->
                                MaterialTheme.colorScheme.error
                        },
                )
            }
            if (variant.statusHint != null) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = variant.statusHint,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(modifier = Modifier.height(16.dp))
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 1.dp,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    InvoiceRow("ORDER", details.orderNumber)
                    InvoiceRow("TX", txShort)
                    InvoiceRow("Site", siteName)
                    InvoiceRow("Cashier", cashierName ?: "—")
                    InvoiceRow("Merchant ref", merchantReference ?: details.orderNumber)
                    InvoiceRow("Order ID", details.orderNumber)
                    InvoiceRow("Tx ID", details.txHash ?: "—")
                    InvoiceRow("Note", merchantReference ?: "—")
                    InvoiceRow("Status", OrderStatusUi.label(details.status))
                }
            }
            Spacer(modifier = Modifier.height(20.dp))
            if (showResume) {
                Button(
                    onClick = { onResumePayment?.invoke() },
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .height(56.dp),
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Text("Resume payment", fontWeight = FontWeight.SemiBold)
                }
                Spacer(modifier = Modifier.height(10.dp))
            }
            if (showPrint) {
                Button(
                    onClick = {
                        scope.launch {
                            printing = true
                            try {
                                when (val outcome = onPrintReceipt!!()) {
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
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .height(56.dp),
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Text(if (printing) "Printing…" else "Print receipt", fontWeight = FontWeight.SemiBold)
                }
            } else if (variant == OrderDetailVariant.Failed || variant == OrderDetailVariant.Expired) {
                OutlinedButton(
                    onClick = onBack,
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .height(56.dp),
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Text("Back to Orders", fontWeight = FontWeight.SemiBold)
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                TextButton(
                    onClick = {
                        val hash = details.txHash
                        if (hash.isNullOrBlank()) {
                            Toast.makeText(context, "No tx id yet", Toast.LENGTH_SHORT).show()
                        } else {
                            val cm =
                                context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                            cm.setPrimaryClip(ClipData.newPlainText("Tx id", hash))
                            Toast.makeText(context, "✓ Tx id copied", Toast.LENGTH_SHORT).show()
                        }
                    },
                    enabled = showCopyTx,
                ) { Text("Copy tx id") }
                TextButton(onClick = onBack) { Text("Back to Orders") }
            }
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = variant.footer,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private enum class OrderDetailVariant(
    val pill: String,
    val statusHint: String?,
    val footer: String,
) {
    Paid(
        "PAID",
        null,
        "On-screen invoice · print anytime · non-custodial crypto order",
    ),
    Open(
        "OPEN",
        "Payment still open — resume to show the QR on this terminal.",
        "Open order · resume payment or print a provisional slip",
    ),
    Failed(
        "FAILED",
        "This order failed. Create a new order from Create if the guest still needs to pay.",
        "Failed order · no on-chain settlement recorded",
    ),
    Expired(
        "EXPIRED",
        "This order expired. Create a new order to collect payment again.",
        "Expired order · start a new payment from Create",
    ),
    Anomaly(
        "ANOMALY",
        "Payment anomaly — resolve on the merchant web portal before reprinting as paid.",
        "Anomaly · do not treat as paid on POS",
    ),
}

private fun orderDetailVariant(status: String): OrderDetailVariant =
    when {
        OrderStatusUi.showsCompleted(status) -> OrderDetailVariant.Paid
        OrderStatusUi.isAnomaly(status) -> OrderDetailVariant.Anomaly
        OrderStatusUi.isOpenPaymentOrder(status) -> OrderDetailVariant.Open
        status == OrderStatusUi.FAILED || status == OrderStatusUi.CANCELLED ->
            OrderDetailVariant.Failed
        status == OrderStatusUi.EXPIRED -> OrderDetailVariant.Expired
        else -> OrderDetailVariant.Open
    }

@Composable
private fun InvoiceRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            fontFamily =
                if (label.contains("TX") || label.contains("ID") || label == "ORDER") {
                    FontFamily.Monospace
                } else {
                    FontFamily.Default
                },
        )
    }
}
