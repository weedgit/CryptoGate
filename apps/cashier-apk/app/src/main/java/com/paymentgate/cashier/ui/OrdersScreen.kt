package com.paymentgate.cashier.ui

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.VerticalDivider
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.paymentgate.cashier.api.OrderStatusUi
import com.paymentgate.cashier.api.PaymentOrder
import java.time.ZoneId

private enum class OrdersFilter { All, Paid, Open, Failed }

/** V3 Invoices — filter chips + search (All activity). */
@Composable
fun OrdersScreen(
    orders: List<PaymentOrder>,
    loading: Boolean,
    error: String?,
    onSelect: (PaymentOrder) -> Unit,
    zone: ZoneId = ZoneId.systemDefault(),
) {
    var filter by remember { mutableStateOf(OrdersFilter.All) }
    var query by remember { mutableStateOf("") }

    val filtered =
        remember(orders, filter, query) {
            orders
                .filter { order ->
                    when (filter) {
                        OrdersFilter.All -> true
                        OrdersFilter.Paid -> OrderStatusUi.showsCompleted(order.status)
                        OrdersFilter.Open -> OrderStatusUi.isOpenPaymentOrder(order.status)
                        OrdersFilter.Failed ->
                            order.status == OrderStatusUi.FAILED ||
                                order.status == OrderStatusUi.EXPIRED ||
                                OrderStatusUi.isAnomaly(order.status)
                    }
                }
                .filter { order ->
                    val q = query.trim()
                    if (q.isEmpty()) true
                    else {
                        order.orderNumber.contains(q, ignoreCase = true) ||
                            order.payableAmount.amount.contains(q) ||
                            order.asset.contains(q, ignoreCase = true) ||
                            order.merchantReference?.contains(q, ignoreCase = true) == true ||
                            order.createdByName?.contains(q, ignoreCase = true) == true
                    }
                }
        }

    PosScreenFrame(applySystemBars = false) {
    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            text = "All activity",
            fontSize = 15.sp,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.primary,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OrdersFilter.entries.forEach { f ->
                FilterTab(
                    label = f.name,
                    selected = filter == f,
                    modifier = Modifier.weight(1f),
                ) { filter = f }
            }
        }
        Spacer(modifier = Modifier.height(14.dp))
        SearchBox(query = query, onQueryChange = { query = it })
        Spacer(modifier = Modifier.height(14.dp))
        when {
            loading && orders.isEmpty() -> Text("Loading…", color = MaterialTheme.colorScheme.onSurfaceVariant)
            !error.isNullOrBlank() -> Text(error, color = MaterialTheme.colorScheme.error)
            filtered.isEmpty() -> Text(
                "No invoices match.",
                fontSize = 15.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            else ->
                LazyColumn(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    items(filtered, key = { it.id }) { order ->
                        InvoiceCard(order = order, zone = zone, onClick = { onSelect(order) })
                    }
                }
        }
    }
    }
}

@Composable
private fun FilterTab(label: String, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(10.dp)
    Box(
        modifier = modifier
            .height(48.dp)
            .clip(shape)
            .background(if (selected) colors.primary.copy(alpha = 0.14f) else colors.surface)
            .border(1.dp, if (selected) Color.Transparent else colors.outlineVariant, shape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            fontSize = 16.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            color = if (selected) colors.onSurface else colors.primary.copy(alpha = 0.8f),
        )
    }
}

@Composable
private fun SearchBox(query: String, onQueryChange: (String) -> Unit) {
    val colors = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(12.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(58.dp)
            .clip(shape)
            .background(colors.surface)
            .border(1.dp, colors.outlineVariant, shape)
            .padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.Search, contentDescription = null, tint = colors.primary, modifier = Modifier.size(26.dp))
        Spacer(modifier = Modifier.width(14.dp))
        Box(modifier = Modifier.weight(1f)) {
            if (query.isEmpty()) {
                Text("Search order, amount, note or cashier", fontSize = 16.sp, color = colors.onSurfaceVariant)
            }
            BasicTextField(
                value = query,
                onValueChange = onQueryChange,
                singleLine = true,
                textStyle = TextStyle(fontSize = 16.sp, color = colors.onSurface),
                cursorBrush = SolidColor(colors.primary),
                modifier = Modifier.fillMaxWidth(),
            )
        }
        if (query.isNotEmpty()) {
            Icon(
                Icons.Outlined.Close,
                contentDescription = "Clear search",
                tint = colors.onSurfaceVariant,
                modifier = Modifier
                    .size(22.dp)
                    .clip(RoundedCornerShape(50))
                    .clickable { onQueryChange("") },
            )
        }
    }
}

/** "698868885.5" → "698,868,885.5"; leaves the decimals as sent. */
internal fun groupThousands(amount: String): String {
    val dot = amount.indexOf('.')
    val whole = if (dot < 0) amount else amount.substring(0, dot)
    if (whole.length <= 3 || !whole.all { it.isDigit() }) return amount
    val grouped = whole.reversed().chunked(3).joinToString(",").reversed()
    return if (dot < 0) grouped else grouped + amount.substring(dot)
}

@Composable
private fun InvoiceCard(order: PaymentOrder, zone: ZoneId, onClick: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    val muted = colors.onSurfaceVariant
    val shape = RoundedCornerShape(14.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(colors.surface)
            .border(1.dp, colors.outlineVariant, shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            AssetIcon(asset = order.asset, size = 48.dp)
            Spacer(modifier = Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = order.orderNumber,
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                    color = colors.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = listOfNotNull(
                        OrderInfoFormat.shortTime(order.createdAt, zone),
                        order.createdByName,
                    ).joinToString(" · ").ifEmpty { "—" },
                    fontSize = 15.sp,
                    color = muted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = "${groupThousands(order.payableAmount.amount)} ${order.asset}",
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                    color = colors.onSurface,
                    maxLines = 1,
                )
                order.invoice?.let {
                    Text(
                        text = OrderInfoFormat.fiat(it),
                        fontSize = 15.sp,
                        color = colors.primary.copy(alpha = 0.8f),
                        maxLines = 1,
                    )
                }
            }
        }
        Spacer(modifier = Modifier.height(12.dp))
        Row(
            modifier = Modifier.height(IntrinsicSize.Min),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            StatusPill(order.status, large = true)
            val detail = order.rate?.let { OrderInfoFormat.rate(order.asset, it) } ?: order.merchantReference
            if (!detail.isNullOrBlank()) {
                VerticalDivider(
                    modifier = Modifier
                        .fillMaxHeight()
                        .padding(horizontal = 14.dp, vertical = 2.dp),
                    color = colors.outlineVariant,
                )
                Text(
                    text = detail,
                    fontSize = 14.sp,
                    color = muted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

/** Coloured status chip shared by the invoice list and detail. */
@Composable
internal fun StatusPill(status: String, large: Boolean = false, caps: Boolean = true) {
    val tone: Color = when {
        OrderStatusUi.showsCompleted(status) -> Color(0xFF22C55E)
        OrderStatusUi.isOpenPaymentOrder(status) -> MaterialTheme.colorScheme.primary
        else -> MaterialTheme.colorScheme.error
    }
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(tone.copy(alpha = 0.14f))
            .padding(horizontal = if (large) 14.dp else 10.dp, vertical = if (large) 6.dp else 3.dp),
    ) {
        Text(
            text = OrderStatusUi.label(status).let { if (caps) it.uppercase() else it },
            fontSize = if (large) 13.sp else 11.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.8.sp,
            color = tone,
        )
    }
}
