package com.paymentgate.cashier.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.paymentgate.cashier.api.CashierPosSurface
import com.paymentgate.cashier.api.Session


@Composable
fun HomeScreen(
    session: Session?,
    emailFallback: String?,
    online: Boolean,
    appEnv: String,
    onCreateOrder: () -> Unit,
    onTodayOrders: () -> Unit,
    onSettings: () -> Unit,
    onSignOut: () -> Unit,
) {
    val createPress = remember { MutableInteractionSource() }
    val onlineColor by animateColorAsState(
        targetValue = if (online) {
            MaterialTheme.colorScheme.primaryContainer
        } else {
            MaterialTheme.colorScheme.error.copy(alpha = 0.12f)
        },
        animationSpec = tween(PosMotion.Medium),
        label = "online-bg",
    )
    val onlineText by animateColorAsState(
        targetValue = if (online) {
            MaterialTheme.colorScheme.onPrimaryContainer
        } else {
            MaterialTheme.colorScheme.error
        },
        animationSpec = tween(PosMotion.Medium),
        label = "online-text",
    )

    PosScreenFrame {
        Column(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.Top,
        ) {
            PaymentGateBrand(iconSize = 36.dp)
            Text(
                text = "Cashier POS",
                style = MaterialTheme.typography.titleMedium,
            )
            if (appEnv.equals("staging", ignoreCase = true)) {
                Text(
                    text = "TEST BUILD — staging API",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.error,
                    fontWeight = FontWeight.Bold,
                )
            }
            Text(
                text = session?.email ?: emailFallback ?: "Cashier",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(12.dp))
            Surface(
                color = onlineColor,
                shape = RoundedCornerShape(12.dp),
            ) {
                Text(
                    text = if (online) "Online" else CashierPosSurface.OFFLINE_BANNER,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = onlineText,
                )
            }
            Spacer(modifier = Modifier.height(28.dp))
            Button(
                onClick = onCreateOrder,
                enabled = online,
                interactionSource = createPress,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(72.dp)
                    .posPressScale(createPress),
                shape = RoundedCornerShape(18.dp),
            ) {
                Text("Create order", fontSize = 22.sp, fontWeight = FontWeight.Bold)
            }
            Spacer(modifier = Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedButton(
                    onClick = onTodayOrders,
                    enabled = online,
                    modifier = Modifier
                        .weight(1f)
                        .height(52.dp),
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Text("Today")
                }
                OutlinedButton(
                    onClick = onSettings,
                    modifier = Modifier
                        .weight(1f)
                        .height(52.dp),
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Text("Settings")
                }
            }
            Spacer(modifier = Modifier.weight(1f))
            TextButton(
                onClick = onSignOut,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.textButtonColors(
                    contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
                ),
            ) {
                Text("Sign out")
            }
        }
    }
}
