package com.paymentgate.cashier.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.paymentgate.cashier.api.OrderStatusUi
import com.paymentgate.cashier.api.PaymentOrder

@Composable
fun TodayOrdersScreen(
    orders: List<PaymentOrder>,
    loading: Boolean,
    error: String?,
    onSelect: (PaymentOrder) -> Unit,
    onBack: () -> Unit,
) {
    PosScreenFrame {
        Column(modifier = Modifier.fillMaxSize()) {
            Text(
                text = "Today's orders",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
            )
            Text(
                text = "Your recent payment orders on this device session.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f),
            )
            Spacer(modifier = Modifier.height(12.dp))
            if (loading) {
                CircularProgressIndicator()
            } else if (!error.isNullOrBlank()) {
                Text(text = error, color = MaterialTheme.colorScheme.error)
            } else if (orders.isEmpty()) {
                Text(text = "No orders yet.", style = MaterialTheme.typography.bodyMedium)
            } else {
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(orders, key = { it.id }) { order ->
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onSelect(order) }
                                .padding(vertical = 8.dp),
                        ) {
                            Text(
                                text = order.orderNumber,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                text = "${order.payableAmount.amount} ${order.asset} · ${OrderStatusUi.label(order.status)}",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
                Text("Back")
            }
        }
    }
}
