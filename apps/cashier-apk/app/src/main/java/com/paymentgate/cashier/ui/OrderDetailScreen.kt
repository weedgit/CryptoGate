package com.paymentgate.cashier.ui

import com.paymentgate.cashier.qr.QrBitmaps
import com.paymentgate.cashier.hardware.ChainExplorer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.material3.VerticalDivider
import androidx.compose.material.icons.outlined.Print
import androidx.compose.material.icons.outlined.PlayCircleOutline
import androidx.compose.material.icons.outlined.Link
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.Image
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.paymentgate.cashier.api.AssetNetworkCatalog
import com.paymentgate.cashier.api.OrderStatusUi
import com.paymentgate.cashier.api.PaymentDetails
import com.paymentgate.cashier.api.PaymentOrder
import com.paymentgate.cashier.hardware.PrintOutcome
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.launch

/** V3 on-screen invoice — paper sheet with a status stamp (Paid / Pending / Failed / Expired / Review). */
@Composable
fun OrderDetailScreen(
    details: PaymentDetails,
    order: PaymentOrder? = null,
    zone: ZoneId = ZoneId.systemDefault(),
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
            ?: details.network.split('_').joinToString(" ") { it.replaceFirstChar(Char::uppercase) }
    val variant = orderDetailVariant(details.status)
    val invoice = details.invoice ?: order?.invoice
    val rate = details.rate ?: order?.rate
    val createdAt = details.createdAt ?: order?.createdAt
    val note = order?.merchantReference ?: merchantReference
    val amountLine = "${details.payableAmount.amount} ${details.asset}"
    val showResume = variant == OrderDetailVariant.Open && onResumePayment != null
    val showPrint =
        onPrintReceipt != null &&
            (variant == OrderDetailVariant.Paid || variant == OrderDetailVariant.Open)

    fun copyTx() {
        val hash = details.txHash ?: return
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText("Tx id", hash))
        Toast.makeText(context, "✓ Tx id copied", Toast.LENGTH_SHORT).show()
    }

    PosScreenFrame {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
        ) {
            Box(modifier = Modifier.fillMaxWidth().padding(bottom = 14.dp)) {
                Box(
                    modifier = Modifier
                        .align(Alignment.CenterStart)
                        .size(44.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(MaterialTheme.colorScheme.surface)
                        .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(14.dp))
                        .clickable(onClick = onBack),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back", modifier = Modifier.size(22.dp))
                }
                Text(
                    text = "Invoice",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.align(Alignment.Center),
                )
            }

            InvoiceSheet {
                Row(verticalAlignment = Alignment.Top) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "INVOICE",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                            letterSpacing = 2.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            text = details.orderNumber,
                            fontSize = 32.sp,
                            fontWeight = FontWeight.Black,
                            letterSpacing = (-0.5).sp,
                            color = MaterialTheme.colorScheme.onSurface,
                            maxLines = 1,
                            modifier = Modifier.padding(top = 2.dp),
                        )
                        OrderInfoFormat.fullTime(createdAt, zone)?.let {
                            Text(
                                text = "Issued $it",
                                fontSize = 17.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(top = 4.dp),
                            )
                        }
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Column(horizontalAlignment = Alignment.End) {
                        Box {
                            AssetIcon(asset = details.asset, size = 56.dp)
                            NetworkIcon(
                                network = details.network,
                                size = 24.dp,
                                modifier = Modifier
                                    .align(Alignment.BottomEnd)
                                    .offset(x = 4.dp, y = 4.dp)
                                    .border(2.dp, MaterialTheme.colorScheme.surface, CircleShape),
                            )
                        }
                        Text(
                            text = details.asset,
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                        Text(
                            text = networkLabel,
                            fontSize = 14.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                DashedDivider()

                Box(modifier = Modifier.fillMaxWidth()) {
                    Column {
                        SheetLabel(if (variant == OrderDetailVariant.Paid) "Amount paid" else "Amount due")
                        Text(text = amountLine, fontSize = 34.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp)
                        invoice?.let {
                            Text(
                                text = "≈ ${OrderInfoFormat.fiat(it)}",
                                fontSize = 16.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    StatusStamp(
                        variant = variant,
                        date = stampDate(details.confirmedAt ?: createdAt, zone),
                        modifier = Modifier
                            .align(Alignment.CenterEnd)
                            .padding(end = 4.dp),
                    )
                }
                if (variant.statusHint != null) {
                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        text = variant.statusHint,
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                DashedDivider()

                SheetLabel("Details")
                SheetRow("Created by", order?.createdByName ?: "—")
                SheetRow("Paid at", OrderInfoFormat.fullTime(details.confirmedAt, zone) ?: "—")
                SheetRow("Note", note ?: "—")

                DashedDivider()

                SheetLabel("Pricing")
                SheetRow("Invoice amount", invoice?.let(OrderInfoFormat::fiat) ?: "—")
                SheetRow("Rate", rate?.let { OrderInfoFormat.rate(details.asset, it) } ?: "—")
                OrderInfoFormat.rateSource(rate?.source)?.let { SheetRow("Rate source", it) }
                OrderInfoFormat.fullTime(rate?.fetchedAt, zone)?.let { SheetRow("Rate time", it) }
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("TOTAL", fontWeight = FontWeight.Black, letterSpacing = 2.sp, modifier = Modifier.weight(1f))
                    Text(amountLine, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                }

                DashedDivider()

                SheetLabel("Blockchain")
                SheetRow("Network", networkLabel)
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "Transaction",
                        fontSize = 14.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.width(130.dp),
                    )
                    Text(
                        text = details.txHash?.let(OrderInfoFormat::shortHash) ?: "—",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                        fontFamily = FontFamily.Monospace,
                        textAlign = TextAlign.End,
                        modifier = Modifier.weight(1f),
                    )
                    if (!details.txHash.isNullOrBlank()) {
                        Icon(
                            Icons.Outlined.ContentCopy,
                            contentDescription = "Copy tx id",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier
                                .padding(start = 8.dp)
                                .size(18.dp)
                                .clickable { copyTx() },
                        )
                    }
                }
                if (!details.txHash.isNullOrBlank()) {
                    SheetRow("Confirmations", "${details.confirmations} / ${details.requiredConfirmations}")
                }

                DashedDivider()

                InvoiceQrFooter(
                    payload = invoiceQrPayload(details, variant),
                    orderNumber = details.orderNumber,
                    variant = variant,
                )
            }

            Spacer(modifier = Modifier.height(18.dp))
            val showShare = details.status == OrderStatusUi.PENDING && PayLinkShare.canShare(details)
            fun print() {
                scope.launch {
                    printing = true
                    try {
                        when (val outcome = onPrintReceipt!!()) {
                            PrintOutcome.Ok ->
                                Toast.makeText(context, "Receipt sent to local printer", Toast.LENGTH_SHORT).show()
                            is PrintOutcome.Failed ->
                                Toast.makeText(context, printFailureMessage(outcome), Toast.LENGTH_LONG).show()
                        }
                    } finally {
                        printing = false
                    }
                }
            }
            if (showResume) {
                Button(
                    onClick = { onResumePayment?.invoke() },
                    modifier = Modifier.fillMaxWidth().height(58.dp),
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Icon(Icons.Outlined.PlayCircleOutline, contentDescription = null, modifier = Modifier.size(26.dp))
                    Spacer(modifier = Modifier.width(12.dp))
                    Text("Resume payment", fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                }
                Spacer(modifier = Modifier.height(12.dp))
            }
            if (!showResume && showPrint && !showShare) {
                Button(
                    onClick = { print() },
                    enabled = !printing,
                    modifier = Modifier.fillMaxWidth().height(58.dp),
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Icon(Icons.Outlined.Print, contentDescription = null, modifier = Modifier.size(24.dp))
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(if (printing) "Printing…" else "Print receipt", fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                }
            } else if (showShare || showPrint) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (showShare) {
                        SecondaryAction(
                            icon = Icons.Outlined.Link,
                            label = "Send payment link",
                            modifier = Modifier.weight(1f),
                        ) { PayLinkShare.share(context, details) }
                    }
                    if (showPrint) {
                        SecondaryAction(
                            icon = Icons.Outlined.Print,
                            label = if (printing) "Printing…" else "Print receipt",
                            enabled = !printing,
                            modifier = Modifier.weight(1f),
                        ) { print() }
                    }
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
        }
    }
}

/** Paper sheet with a torn (zig-zag) bottom edge. */
@Composable
private fun InvoiceSheet(content: @Composable ColumnScope.() -> Unit) {
    val shape = remember { TornPaperShape() }
    Surface(
        shape = shape,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shadowElevation = if (com.paymentgate.cashier.ui.theme.LocalPosDark.current) 0.dp else 3.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(start = 22.dp, end = 22.dp, top = 22.dp, bottom = 26.dp), content = content)
    }
}

private class TornPaperShape : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val corner = with(density) { 18.dp.toPx() }
        val tooth = with(density) { 8.dp.toPx() }
        val w = size.width
        val h = size.height
        val teeth = (w / (tooth * 2f)).toInt().coerceAtLeast(1)
        val step = w / teeth
        val path = Path().apply {
            moveTo(0f, corner)
            quadraticTo(0f, 0f, corner, 0f)
            lineTo(w - corner, 0f)
            quadraticTo(w, 0f, w, corner)
            lineTo(w, h - tooth)
            for (i in 0 until teeth) {
                val x = w - i * step
                lineTo(x - step / 2f, h)
                lineTo(x - step, h - tooth)
            }
            close()
        }
        return Outline.Generic(path)
    }
}

/** Tilted rubber-stamp status mark. */
@Composable
private fun StatusStamp(variant: OrderDetailVariant, date: String?, modifier: Modifier = Modifier) {
    val ink = when (variant) {
        OrderDetailVariant.Paid -> Color(0xFF16A34A)
        OrderDetailVariant.Open -> MaterialTheme.colorScheme.primary
        else -> MaterialTheme.colorScheme.error
    }.copy(alpha = 0.82f)
    val outer = RoundedCornerShape(10.dp)
    val inner = RoundedCornerShape(6.dp)
    Box(
        modifier = modifier
            .rotate(-14f)
            .border(3.dp, ink, outer)
            .padding(4.dp)
            .border(1.dp, ink, inner)
            .padding(horizontal = 14.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = variant.stamp,
                color = ink,
                fontSize = 26.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 3.sp,
            )
            if (date != null) {
                Text(
                    text = date,
                    color = ink,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.5.sp,
                )
            }
        }
    }
}

private fun stampDate(iso: String?, zone: ZoneId): String? =
    iso?.let {
        runCatching {
            Instant.parse(it).atZone(zone).format(DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH))
                .uppercase()
        }.getOrNull()
    }

@Composable
private fun DashedDivider() {
    val color = MaterialTheme.colorScheme.outline.copy(alpha = 0.6f)
    Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 16.dp)
            .height(1.dp),
    ) {
        drawLine(
            color = color,
            start = Offset(0f, 0f),
            end = Offset(size.width, 0f),
            strokeWidth = size.height,
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(12f, 8f)),
        )
    }
}

/** Decorative barcode derived from the order number. */
/** What the invoice QR opens: the on-chain transaction once paid, else the guest payment page. */
private fun invoiceQrPayload(details: PaymentDetails, variant: OrderDetailVariant): String {
    val tx = details.txHash?.takeIf { it.isNotBlank() }
    if (tx != null && variant != OrderDetailVariant.Open) {
        ChainExplorer.txUrl(details.network, tx)?.let { return it }
    }
    return details.paymentPageUrl.ifBlank { details.orderNumber }
}

@Composable
private fun InvoiceQrFooter(payload: String, orderNumber: String, variant: OrderDetailVariant) {
    val colors = MaterialTheme.colorScheme
    val qr = remember(payload) { runCatching { QrBitmaps.encode(payload, sizePx = 360).asImageBitmap() }.getOrNull() }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(IntrinsicSize.Min)
            .padding(top = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (qr != null) {
            Image(
                bitmap = qr,
                contentDescription = "Invoice QR",
                modifier = Modifier.size(120.dp),
            )
            VerticalDivider(
                modifier = Modifier
                    .fillMaxHeight()
                    .padding(horizontal = 20.dp, vertical = 6.dp),
                color = colors.outlineVariant,
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(orderNumber, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = colors.onSurface)
            Text(
                variant.headline,
                fontSize = 19.sp,
                color = colors.primary.copy(alpha = 0.8f),
                modifier = Modifier.padding(top = 4.dp),
            )
            Text(
                variant.footer,
                fontSize = 14.sp,
                color = colors.onSurfaceVariant,
                modifier = Modifier.padding(top = 8.dp),
            )
        }
    }
}

@Composable
private fun SecondaryAction(
    icon: ImageVector,
    label: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(56.dp),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.35f)),
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(24.dp))
        Spacer(modifier = Modifier.width(10.dp))
        Text(label, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

@Composable
private fun SheetLabel(text: String) {
    Text(
        text = text.uppercase(),
        fontSize = 11.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 1.6.sp,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(bottom = 6.dp),
    )
}

@Composable
private fun SheetRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            fontSize = 14.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(130.dp),
        )
        Text(
            text = value,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.End,
            modifier = Modifier.weight(1f),
        )
    }
}

private enum class OrderDetailVariant(
    val stamp: String,
    val statusHint: String?,
    val headline: String,
    val footer: String,
) {
    Paid(
        "PAID",
        null,
        "Payment completed",
        "Scan to view the transaction.",
    ),
    Open(
        "PENDING",
        "Payment still open — resume to show the QR on this terminal.",
        "Awaiting payment",
        "Resume or print a provisional slip.",
    ),
    Failed(
        "FAILED",
        "This order failed. Create a new order from Charge if the guest still needs to pay.",
        "Payment failed",
        "No on-chain settlement recorded.",
    ),
    Cancelled(
        "CANCELLED",
        "This order was cancelled before payment. Create a new order from Charge if the guest still needs to pay.",
        "Payment cancelled",
        "No on-chain settlement recorded.",
    ),
    Expired(
        "EXPIRED",
        "This order expired. Create a new order to collect payment again.",
        "Invoice expired",
        "Start a new payment from Charge.",
    ),
    Anomaly(
        "REVIEW",
        "Attention — resolve on the merchant web portal before reprinting as paid.",
        "Needs review",
        "Do not treat as paid on POS.",
    ),
}

private fun orderDetailVariant(status: String): OrderDetailVariant =
    when {
        OrderStatusUi.showsCompleted(status) -> OrderDetailVariant.Paid
        OrderStatusUi.isAnomaly(status) -> OrderDetailVariant.Anomaly
        OrderStatusUi.isOpenPaymentOrder(status) -> OrderDetailVariant.Open
        status == OrderStatusUi.FAILED -> OrderDetailVariant.Failed
        status == OrderStatusUi.CANCELLED -> OrderDetailVariant.Cancelled
        status == OrderStatusUi.EXPIRED -> OrderDetailVariant.Expired
        else -> OrderDetailVariant.Open
    }
