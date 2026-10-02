package com.paymentgate.cashier.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.ui.graphics.graphicsLayer
import com.paymentgate.cashier.ui.theme.LocalPosDark
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.ArrowBackIos
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Wifi
import androidx.compose.material.icons.outlined.WifiOff
import androidx.compose.ui.graphics.Color
import androidx.compose.material.icons.outlined.Today
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.paymentgate.cashier.api.OrderStatusUi
import com.paymentgate.cashier.api.PaymentOrder
import java.time.ZoneId
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** V3 PG / Hardware Dock — Create · Today · Invoice · Setting */
enum class HardwareDockTab {
    Create,
    Today,
    Orders,
    More,
}

@Composable
fun HardwareDock(
    active: HardwareDockTab,
    onSelect: (HardwareDockTab) -> Unit,
    modifier: Modifier = Modifier,
    elevated: Boolean = true,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shadowElevation = if (elevated) 4.dp else 0.dp,
    ) {
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = if (elevated) 8.dp else 2.dp, vertical = if (elevated) 10.dp else 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val item = Modifier.weight(1f)
            DockItem("Create", Icons.Outlined.Add, active == HardwareDockTab.Create, item) {
                onSelect(HardwareDockTab.Create)
            }
            DockSeparator()
            DockItem("Today", Icons.Outlined.Today, active == HardwareDockTab.Today, item) {
                onSelect(HardwareDockTab.Today)
            }
            DockSeparator()
            DockItem("Invoice", Icons.Outlined.History, active == HardwareDockTab.Orders, item) {
                onSelect(HardwareDockTab.Orders)
            }
            DockSeparator()
            DockItem("Setting", Icons.Outlined.Settings, active == HardwareDockTab.More, item) {
                onSelect(HardwareDockTab.More)
            }
        }
    }
}

@Composable
private fun DockItem(
    label: String,
    icon: ImageVector,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val color =
        if (selected) MaterialTheme.colorScheme.primary
        else MaterialTheme.colorScheme.onSurfaceVariant
    Column(
        modifier =
            modifier
                .clip(RoundedCornerShape(12.dp))
                .clickable(onClick = onClick)
                .padding(horizontal = 4.dp, vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(icon, contentDescription = label, tint = color, modifier = Modifier.size(22.dp))
        Text(
            text = label,
            fontSize = 12.sp,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
            color = color,
        )
    }
}

@Composable
private fun DockSeparator() {
    Box(
        modifier = Modifier
            .width(1.dp)
            .height(30.dp)
            .background(MaterialTheme.colorScheme.outlineVariant),
    )
}

/** Sub-page header: back to Charge, the PIN-unlocked operator, and lock. */
@Composable
fun OperatorBar(
    operatorName: String,
    roleLabel: String,
    avatarUrl: String?,
    onBack: () -> Unit,
    onLock: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        TopBarIconButton(
            icon = Icons.AutoMirrored.Outlined.ArrowBack,
            contentDescription = "Back",
            onClick = onBack,
            modifier = Modifier.align(Alignment.CenterStart),
        )
        Row(
            modifier = Modifier
                .align(Alignment.Center)
                .padding(horizontal = 96.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            UserAvatar(name = operatorName, avatarUrl = avatarUrl, size = 38.dp)
            Column(modifier = Modifier.padding(start = 10.dp)) {
                Text(
                    text = operatorName,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = roleLabel,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
            }
        }
        LockButton(onLock = onLock, modifier = Modifier.align(Alignment.CenterEnd))
    }
}

@Composable
private fun TopBarIconButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .size(44.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(14.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = contentDescription, tint = MaterialTheme.colorScheme.onSurface, modifier = Modifier.size(22.dp))
    }
}

/** Charge page header: the tab bar on top, with the alerts bell. */
@Composable
fun DockTopBar(
    active: HardwareDockTab,
    onSelect: (HardwareDockTab) -> Unit,
    online: Boolean,
    alerts: List<PaymentOrder>,
    zone: ZoneId,
    onAlertsOpened: () -> Unit,
    onOpenAlert: (PaymentOrder) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        NetworkStatus(online = online)
        HardwareDock(
            active = active,
            onSelect = onSelect,
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 10.dp),
            elevated = false,
        )
        AlertsButton(alerts = alerts, zone = zone, onOpened = onAlertsOpened, onOpenAlert = onOpenAlert)
    }
}

/** Internet connection of this POS: green when online, red when offline. */
@Composable
private fun NetworkStatus(online: Boolean) {
    val dark = LocalPosDark.current
    val target = when {
        !online -> MaterialTheme.colorScheme.error
        dark -> Color(0xFF4ADE80)
        else -> Color(0xFF15803D)
    }
    // No idle pulse: this icon is on every unlocked screen, and an endless animation redrew the whole
    // window ~50 times a second on the G7, which delayed every tap.
    val tone by animateColorAsState(target, tween(400), label = "network-tone")
    val iconScale by animateFloatAsState(if (online) 1f else 0.9f, tween(300), label = "network-scale")
    Column(
        modifier = Modifier.size(52.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            if (online) Icons.Outlined.Wifi else Icons.Outlined.WifiOff,
            contentDescription = if (online) "Online" else "Offline",
            tint = tone,
            modifier = Modifier
                .size(24.dp)
                .graphicsLayer {
                    scaleX = iconScale
                    scaleY = iconScale
                },
        )
        Text(
            text = if (online) "Online" else "Offline",
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            color = tone,
        )
    }
}

/** Bell with a badge for invoices still waiting for payment; lists the latest invoice updates. */
@Composable
fun AlertsButton(
    alerts: List<PaymentOrder>,
    zone: ZoneId,
    onOpened: () -> Unit,
    onOpenAlert: (PaymentOrder) -> Unit,
    boxed: Boolean = false,
) {
    var open by remember { mutableStateOf(false) }
    val waiting = alerts.count { OrderStatusUi.isOpenPaymentOrder(it.status) }
    val boxShape = RoundedCornerShape(14.dp)
    Box {
        Box(
            modifier = Modifier
                .size(52.dp)
                .then(
                    if (boxed) {
                        Modifier
                            .clip(boxShape)
                            .background(MaterialTheme.colorScheme.surface)
                            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, boxShape)
                    } else {
                        Modifier.clip(CircleShape)
                    },
                )
                .clickable {
                    open = true
                    onOpened()
                },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Outlined.Notifications,
                contentDescription = "Alerts",
                tint = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.size(if (boxed) 30.dp else 34.dp),
            )
        }
        if (waiting > 0) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = 4.dp, end = 4.dp)
                    .size(18.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.error),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = if (waiting > 9) "9+" else waiting.toString(),
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onError,
                )
            }
        }
        DropdownMenu(
            expanded = open,
            onDismissRequest = { open = false },
            modifier = Modifier.width(320.dp),
        ) {
            Text(
                text = "ALERTS",
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 1.4.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
            val recent = alerts.take(6)
            if (recent.isEmpty()) {
                Text(
                    text = "No invoice updates yet",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                )
            }
            recent.forEach { order ->
                DropdownMenuItem(
                    onClick = {
                        open = false
                        onOpenAlert(order)
                    },
                    leadingIcon = { AssetIcon(asset = order.asset, size = 28.dp) },
                    text = {
                        Column {
                            Text(
                                text = "${order.payableAmount.amount} ${order.asset}",
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                text = listOfNotNull(
                                    order.orderNumber,
                                    OrderInfoFormat.shortTime(order.createdAt, zone),
                                ).joinToString(" · "),
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    },
                    trailingIcon = { StatusPill(order.status) },
                )
            }
        }
    }
}

@Composable
private fun LockButton(onLock: () -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onLock)
            .padding(horizontal = 10.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            Icons.Outlined.Lock,
            contentDescription = "Lock",
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(20.dp),
        )
        Text(
            text = "Lock",
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(start = 4.dp),
        )
    }
}

/** Titled sub-page header: back to Charge, page title, and a trailing action. */
@Composable
fun PageTopBar(
    title: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    trailing: @Composable () -> Unit = {},
) {
    val colors = MaterialTheme.colorScheme
    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Row(
            modifier = Modifier
                .align(Alignment.CenterStart)
                .clip(RoundedCornerShape(12.dp))
                .clickable(onClick = onBack)
                .padding(horizontal = 8.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.AutoMirrored.Outlined.ArrowBackIos,
                contentDescription = null,
                tint = colors.onSurface,
                modifier = Modifier.size(20.dp),
            )
            Text("Back", fontSize = 18.sp, fontWeight = FontWeight.Medium, color = colors.onSurface)
        }
        Column(
            modifier = Modifier.align(Alignment.Center),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = title,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = colors.onSurface,
            )
            if (subtitle != null) {
                Text(text = subtitle, fontSize = 14.sp, color = colors.onSurfaceVariant)
            }
        }
        Box(modifier = Modifier.align(Alignment.CenterEnd)) { trailing() }
    }
}

@Composable
fun LockPosButton(onLock: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(colors.surface)
            .border(1.dp, colors.outlineVariant, RoundedCornerShape(50))
            .clickable(onClick = onLock)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.Lock, contentDescription = null, tint = colors.onSurface, modifier = Modifier.size(20.dp))
        Text(
            "Lock POS",
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
            color = colors.onSurface,
            modifier = Modifier.padding(start = 8.dp),
        )
    }
}

/** Shell with V3 Hardware Dock under tab screens. Children keep [PosScreenFrame]. */
@Composable
fun PosShell(
    dockTab: HardwareDockTab,
    onDockSelect: (HardwareDockTab) -> Unit,
    showDock: Boolean = true,
    topBar: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding(),
    ) {
        topBar?.invoke()
        Box(modifier = Modifier.weight(1f, fill = true)) {
            content()
        }
        if (showDock) {
            HardwareDock(
                active = dockTab,
                onSelect = onDockSelect,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
        }
    }
}
