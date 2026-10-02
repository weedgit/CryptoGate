package com.paymentgate.cashier.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Cancel
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.paymentgate.cashier.api.OrderAlertKind
import com.paymentgate.cashier.api.OrderStatusUi
import com.paymentgate.cashier.api.PaymentOrder
import kotlinx.coroutines.delay

/** One order change to explain on screen; [more] counts the other changes that arrived with it. */
data class OrderToast(
    val key: Long,
    val kind: OrderAlertKind,
    val order: PaymentOrder,
    val more: Int = 0,
)

private val ToastGreen = Color(0xFF16A34A)
private val ToastAmber = Color(0xFFD97706)
private val ToastGrey = Color(0xFF64748B)
private const val AUTO_HIDE_MS = 4_500L

private class ToastLook(val title: String, val icon: ImageVector, val tone: Color)

@Composable
private fun lookOf(toast: OrderToast): ToastLook {
    val status = toast.order.status
    return when (toast.kind) {
        OrderAlertKind.Paid ->
            if (OrderStatusUi.showsCompleted(status)) {
                ToastLook("Payment completed", Icons.Outlined.CheckCircle, ToastGreen)
            } else {
                ToastLook("Payment received", Icons.Outlined.CheckCircle, ToastGreen)
            }
        OrderAlertKind.Attention -> ToastLook("Payment needs attention", Icons.Outlined.WarningAmber, ToastAmber)
        OrderAlertKind.Ended -> when (status) {
            OrderStatusUi.CANCELLED -> ToastLook("Invoice cancelled", Icons.Outlined.Cancel, ToastGrey)
            OrderStatusUi.FAILED -> ToastLook("Payment failed", Icons.Outlined.ErrorOutline, ToastGrey)
            else -> ToastLook("Invoice expired", Icons.Outlined.Schedule, ToastGrey)
        }
        OrderAlertKind.Created ->
            ToastLook("New invoice", Icons.Outlined.ReceiptLong, MaterialTheme.colorScheme.primary)
    }
}

/**
 * Top-center card that says what an alert sound meant. Attention stays until tapped or closed;
 * the rest hide on their own.
 */
@Composable
fun OrderAlertToast(
    toast: OrderToast?,
    onView: (OrderToast) -> Unit,
    onSeeAll: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var last by remember { mutableStateOf(toast) }
    if (toast != null) last = toast

    LaunchedEffect(toast?.key) {
        if (toast == null || toast.kind == OrderAlertKind.Attention) return@LaunchedEffect
        delay(AUTO_HIDE_MS)
        onDismiss()
    }

    AnimatedVisibility(
        visible = toast != null,
        enter = slideInVertically(tween(160)) { -it / 3 } + fadeIn(tween(160)),
        exit = fadeOut(tween(120)),
        modifier = modifier,
    ) {
        val shown = last ?: return@AnimatedVisibility
        ToastCard(shown, onView, onSeeAll, onDismiss)
    }
}

@Composable
private fun ToastCard(
    toast: OrderToast,
    onView: (OrderToast) -> Unit,
    onSeeAll: () -> Unit,
    onDismiss: () -> Unit,
) {
    val colors = MaterialTheme.colorScheme
    val look = lookOf(toast)
    val order = toast.order
    val shape = RoundedCornerShape(16.dp)
    Surface(
        shape = shape,
        color = colors.surface,
        shadowElevation = 8.dp,
        modifier = Modifier
            .padding(horizontal = 16.dp)
            .widthIn(max = 520.dp)
            .fillMaxWidth()
            .border(1.dp, look.tone.copy(alpha = 0.45f), shape),
    ) {
        Row(
            modifier = Modifier
                .clickable { onView(toast) }
                .padding(start = 14.dp, end = 6.dp, top = 12.dp, bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(look.tone.copy(alpha = 0.14f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(look.icon, contentDescription = null, tint = look.tone, modifier = Modifier.size(24.dp))
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    look.title,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                    color = look.tone,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    listOfNotNull(
                        "${order.payableAmount.amount} ${order.asset}",
                        order.orderNumber,
                        order.createdByName,
                    ).joinToString(" · "),
                    fontSize = 14.sp,
                    color = colors.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (toast.more > 0) {
                    Text(
                        "+${toast.more} more ${if (toast.more == 1) "update" else "updates"} · See all",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = colors.primary,
                        modifier = Modifier
                            .padding(top = 2.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .clickable(onClick = onSeeAll)
                            .padding(vertical = 2.dp),
                    )
                }
            }
            Text(
                "View",
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = look.tone,
                modifier = Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .clickable { onView(toast) }
                    .padding(horizontal = 12.dp, vertical = 10.dp),
            )
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .clickable(onClick = onDismiss),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Outlined.Close,
                    contentDescription = "Dismiss",
                    tint = colors.onSurfaceVariant,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
    }
}
