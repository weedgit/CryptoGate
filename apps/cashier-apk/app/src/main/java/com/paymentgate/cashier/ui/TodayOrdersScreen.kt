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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.paymentgate.cashier.api.AssetNetworkCatalog
import com.paymentgate.cashier.api.OrderStatusUi
import com.paymentgate.cashier.api.PaymentOrder
import java.math.BigDecimal
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/** V3 Today — collected KPI + recent activity. */
@Composable
fun TodayOrdersScreen(
    orders: List<PaymentOrder>,
    loading: Boolean,
    error: String?,
    cashierName: String? = null,
    onSelect: (PaymentOrder) -> Unit,
    onSeeAllOrders: () -> Unit,
    onBack: () -> Unit = {},
) {
    val paid = remember(orders) { orders.filter { OrderStatusUi.showsCompleted(it.status) } }
    val open = remember(orders) { orders.filter { OrderStatusUi.isOpenPaymentOrder(it.status) } }
    val collected =
        remember(paid) {
            paid.fold(BigDecimal.ZERO) { acc, o ->
                acc + (o.payableAmount.amount.toBigDecimalOrNull() ?: BigDecimal.ZERO)
            }
        }
    val dateLabel =
        remember {
            LocalDate.now().format(DateTimeFormatter.ofPattern("EEE, d MMM", Locale.ENGLISH))
        }
    val recent = remember(orders) { orders.take(8) }

    PosScreenFrame(applySystemBars = false) {
        Column(modifier = Modifier.fillMaxSize()) {
            PaymentGateBrand()
            if (!cashierName.isNullOrBlank()) {
                Text(
                    text = cashierName,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "TODAY",
                fontFamily = FontFamily.Monospace,
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = dateLabel,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(12.dp))
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 1.dp,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Text(
                        text = "Collected today",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = collected.stripTrailingZeros().toPlainString(),
                        fontSize = 40.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                    )
                    Text(
                        text = "USDT-equivalent list total · mixed assets shown as sum of amounts",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "${paid.size} paid  ·  ${open.size} open",
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = "RECENT ACTIVITY",
                    fontFamily = FontFamily.Monospace,
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                TextButton(onClick = onSeeAllOrders) { Text("See all orders →") }
            }
            when {
                loading -> CircularProgressIndicator()
                !error.isNullOrBlank() -> Text(error, color = MaterialTheme.colorScheme.error)
                recent.isEmpty() -> Text("No orders yet.", style = MaterialTheme.typography.bodyMedium)
                else ->
                    LazyColumn(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(recent, key = { it.id }) { order ->
                            val net =
                                AssetNetworkCatalog.find(order.asset, order.network, null)
                                    ?.shortNetworkLabel ?: order.network
                            Surface(
                                modifier =
                                    Modifier
                                        .fillMaxWidth()
                                        .clickable { onSelect(order) },
                                shape = RoundedCornerShape(14.dp),
                                tonalElevation = 1.dp,
                            ) {
                                Row(
                                    modifier =
                                        Modifier
                                            .fillMaxWidth()
                                            .padding(14.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            "${order.payableAmount.amount} ${order.asset}",
                                            fontWeight = FontWeight.SemiBold,
                                            fontFamily = FontFamily.Monospace,
                                        )
                                        Text(
                                            net,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                    Text(
                                        text = OrderStatusUi.label(order.status).uppercase(),
                                        fontWeight = FontWeight.SemiBold,
                                        color =
                                            when {
                                                OrderStatusUi.showsCompleted(order.status) ->
                                                    MaterialTheme.colorScheme.secondary
                                                OrderStatusUi.isOpenPaymentOrder(order.status) ->
                                                    MaterialTheme.colorScheme.primary
                                                else -> MaterialTheme.colorScheme.error
                                            },
                                    )
                                }
                            }
                        }
                    }
            }
        }
    }
}
