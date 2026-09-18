package com.paymentgate.cashier.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.paymentgate.cashier.api.OrderStatusUi
import com.paymentgate.cashier.api.PaymentOrder

private enum class OrdersFilter { All, Paid, Open, Failed }

/** V3 Orders — filter chips + search (All activity). */
@Composable
fun OrdersScreen(
    orders: List<PaymentOrder>,
    loading: Boolean,
    error: String?,
    onSelect: (PaymentOrder) -> Unit,
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
                            order.asset.contains(q, ignoreCase = true)
                    }
                }
        }

    PosScreenFrame(applySystemBars = false) {
    Column(modifier = Modifier.fillMaxSize()) {
        PaymentGateBrand()
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Orders",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = "All activity",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OrdersFilter.entries.forEach { f ->
                FilterChip(
                    selected = filter == f,
                    onClick = { filter = f },
                    label = { Text(f.name) },
                )
            }
        }
        Spacer(modifier = Modifier.height(8.dp))
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            label = { Text("Search amount or ref") },
        )
        Spacer(modifier = Modifier.height(10.dp))
        when {
            loading -> Text("Loading…", color = MaterialTheme.colorScheme.onSurfaceVariant)
            !error.isNullOrBlank() -> Text(error, color = MaterialTheme.colorScheme.error)
            filtered.isEmpty() -> Text("No orders match.", style = MaterialTheme.typography.bodyMedium)
            else ->
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(filtered, key = { it.id }) { order ->
                        Surface(
                            modifier =
                                Modifier
                                    .fillMaxWidth()
                                    .clickable { onSelect(order) },
                            tonalElevation = 1.dp,
                            shape = MaterialTheme.shapes.medium,
                        ) {
                            Column(modifier = Modifier.padding(14.dp)) {
                                Text(order.orderNumber, fontWeight = FontWeight.SemiBold)
                                Text(
                                    text =
                                        "${order.payableAmount.amount} ${order.asset} · " +
                                            OrderStatusUi.label(order.status),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
        }
    }
    }
}
