package com.paymentgate.cashier.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.material.icons.outlined.Close
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ReceiptLong
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.paymentgate.cashier.api.Money
import com.paymentgate.cashier.api.OrderStatusUi
import com.paymentgate.cashier.api.PaymentOrder
import com.paymentgate.cashier.ui.theme.LocalPosDark
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

private const val CHART_HOURS = 12
private const val RECENT_LIMIT = 40
private val PaidGreen = Color(0xFF22C55E)

private data class TodaySummary(
    val orders: List<PaymentOrder>,
    val paid: Int,
    val open: Int,
    val closed: Int,
    val attention: Int,
    val collectedUsd: BigDecimal,
    val byAsset: List<Pair<String, BigDecimal>>,
    /** Invoices per hour for the last [CHART_HOURS] hours: (hour, total, paid). */
    val hourly: List<Triple<Int, Int, Int>>,
)

private fun summarize(all: List<PaymentOrder>, zone: ZoneId): TodaySummary {
    val today = LocalDate.now(zone)
    val stamped = all.mapNotNull { o ->
        val at = o.createdAt?.let { runCatching { Instant.parse(it).atZone(zone) }.getOrNull() }
        if (at?.toLocalDate() == today) o to at else null
    }
    val orders = stamped.map { it.first }
    val paidOrders = orders.filter { OrderStatusUi.showsCompleted(it.status) }
    val byAsset = paidOrders
        .groupBy { it.asset }
        .map { (asset, list) ->
            asset to list.fold(BigDecimal.ZERO) { acc, o -> acc + (o.payableAmount.amount.toBigDecimalOrNull() ?: BigDecimal.ZERO) }
        }
        .sortedByDescending { it.second }
    val nowHour = ZonedDateTime.now(zone).hour
    val firstHour = (nowHour - CHART_HOURS + 1).coerceAtLeast(0)
    val hourly = (firstHour..nowHour).map { h ->
        val inHour = stamped.filter { it.second.hour == h }.map { it.first }
        Triple(h, inHour.size, inHour.count { OrderStatusUi.showsCompleted(it.status) })
    }
    return TodaySummary(
        orders = orders,
        paid = paidOrders.size,
        open = orders.count { OrderStatusUi.isOpenPaymentOrder(it.status) },
        closed = orders.count { OrderStatusUi.isClosed(it.status) },
        attention = orders.count { OrderStatusUi.isAnomaly(it.status) },
        collectedUsd = paidOrders.fold(BigDecimal.ZERO) { acc, o -> acc + (usdValue(o) ?: BigDecimal.ZERO) },
        byAsset = byAsset,
        hourly = hourly,
    )
}

/** USD value of an order: the USD invoice, else amount × USD rate. */
private fun usdValue(order: PaymentOrder): BigDecimal? {
    order.invoice?.takeIf { it.currency.equals("USD", ignoreCase = true) }
        ?.amount?.toBigDecimalOrNull()?.let { return it }
    val rate = order.rate?.takeIf { it.quote == "USD" }?.value?.toBigDecimalOrNull() ?: return null
    return order.payableAmount.amount.toBigDecimalOrNull()?.multiply(rate)
}

/** "Wednesday, 30 September" in the staff zone; shown under the Today title. */
fun todayDateLabel(zone: ZoneId): String =
    LocalDate.now(zone).format(DateTimeFormatter.ofPattern("EEEE, d MMMM", Locale.ENGLISH))

/** V3 Today — collected KPI, status tiles, hourly activity and recent invoices. */
@Composable
fun TodayOrdersScreen(
    orders: List<PaymentOrder>,
    loading: Boolean,
    error: String?,
    cashierName: String? = null,
    zone: ZoneId = ZoneId.systemDefault(),
    onSelect: (PaymentOrder) -> Unit,
    onSeeAllOrders: () -> Unit,
    onBack: () -> Unit = {},
) {
    val summary = remember(orders, zone) { summarize(orders, zone) }
    var statusFilter by remember { mutableStateOf<TodayFilter?>(null) }
    val recent = remember(summary, statusFilter) {
        summary.orders.filter { statusFilter?.matches(it.status) ?: true }.take(RECENT_LIMIT)
    }

    PosScreenFrame(applySystemBars = false) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            if (loading) {
                item {
                    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    }
                }
            }
            item {
                Row(
                    modifier = Modifier.height(IntrinsicSize.Min),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    CollectedCard(summary, Modifier.weight(1.7f).fillMaxHeight())
                    StatusCountsCard(
                        summary = summary,
                        selected = statusFilter,
                        onSelect = { statusFilter = if (statusFilter == it) null else it },
                        modifier = Modifier.weight(1f).fillMaxHeight(),
                    )
                }
            }
            item { HourlyCard(summary.hourly) }
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Row(modifier = Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                        Text("Recent activity", fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        statusFilter?.let { f ->
                            Spacer(modifier = Modifier.width(10.dp))
                            Row(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(50))
                                    .background(f.tone.copy(alpha = 0.14f))
                                    .clickable { statusFilter = null }
                                    .padding(start = 12.dp, end = 8.dp, top = 4.dp, bottom = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(f.label, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = f.tone)
                                Icon(
                                    Icons.Outlined.Close,
                                    contentDescription = "Clear filter",
                                    tint = f.tone,
                                    modifier = Modifier.padding(start = 4.dp).size(16.dp),
                                )
                            }
                        }
                    }
                    Text(
                        "See all",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .clickable(onClick = onSeeAllOrders)
                            .padding(horizontal = 6.dp, vertical = 4.dp),
                    )
                }
            }
            when {
                !error.isNullOrBlank() -> item {
                    Text(error, color = MaterialTheme.colorScheme.error)
                }
                recent.isEmpty() && !loading -> item {
                    EmptyToday(if (statusFilter == null) "No invoices yet today" else "No ${statusFilter!!.label.lowercase()} invoices today")
                }
                else -> items(recent, key = { it.id }) { order ->
                    RecentRow(order = order, zone = zone, onClick = { onSelect(order) })
                }
            }
            item { Spacer(modifier = Modifier.height(4.dp)) }
        }
    }
}

private val OpenBlue = Color(0xFF2563EB)
private val ClosedGrey = Color(0xFF94A3B8)
private val AttentionAmber = Color(0xFFD97706)

/** Same groups as the web invoice filters: Attention, Open, Paid (Completed), Closed. */
private enum class TodayFilter(val label: String, val tone: Color) {
    Paid("Paid", PaidGreen),
    Open("Open", OpenBlue),
    Closed("Closed", ClosedGrey),
    Attention("Attention", AttentionAmber);

    fun matches(status: String): Boolean = when (this) {
        Paid -> OrderStatusUi.showsCompleted(status)
        Open -> OrderStatusUi.isOpenPaymentOrder(status)
        Closed -> OrderStatusUi.isClosed(status)
        Attention -> OrderStatusUi.isAnomaly(status)
    }
}
private val OtherBar = Color(0xFF9DB8F5)

@Composable
private fun CollectedCard(summary: TodaySummary, modifier: Modifier = Modifier) {
    val colors = MaterialTheme.colorScheme
    val dark = LocalPosDark.current
    val shape = RoundedCornerShape(16.dp)
    val background = if (dark) colors.surface else Color(0xFFEAF1FE)
    val border = if (dark) colors.primary.copy(alpha = 0.4f) else Color(0xFF9FBDF7)
    val strong = if (dark) colors.primary else Color(0xFF1E3A8A)
    val muted = colors.onSurfaceVariant
    val avg = if (summary.paid > 0) {
        summary.collectedUsd.divide(BigDecimal(summary.paid), 2, RoundingMode.HALF_UP)
    } else {
        null
    }
    Column(
        modifier = modifier
            .clip(shape)
            .background(background)
            .border(1.5.dp, border, shape)
            .padding(horizontal = 22.dp, vertical = 20.dp),
    ) {
        Text(
            text = "COLLECTED TODAY",
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 1.4.sp,
            color = muted,
        )
        Text(
            text = OrderInfoFormat.fiat(Money(summary.collectedUsd.toPlainString(), "USD")),
            fontSize = 50.sp,
            lineHeight = 56.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = (-1).sp,
            color = strong,
            maxLines = 1,
        )
        summary.byAsset.take(2).forEach { (asset, amount) ->
            Row(
                modifier = Modifier.padding(top = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AssetIcon(asset = asset, size = 30.dp)
                Spacer(modifier = Modifier.width(14.dp))
                Text(
                    text = "${groupThousands(amount.stripTrailingZeros().toPlainString())} $asset",
                    fontSize = 17.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = colors.onSurface,
                )
            }
        }
        Spacer(modifier = Modifier.weight(1f))
        HorizontalDivider(
            modifier = Modifier.padding(top = 14.dp, bottom = 12.dp),
            color = border.copy(alpha = 0.6f),
        )
        Text(
            text = buildString {
                append("${summary.paid} paid of ${summary.orders.size}")
                if (avg != null) append("  ·  Average ${OrderInfoFormat.fiat(Money(avg.toPlainString(), "USD"))}")
            },
            fontSize = 15.sp,
            color = muted,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun StatusCountsCard(
    summary: TodaySummary,
    selected: TodayFilter?,
    onSelect: (TodayFilter) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = MaterialTheme.colorScheme
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(colors.surface)
            .border(1.dp, colors.outlineVariant, RoundedCornerShape(16.dp))
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.SpaceEvenly,
    ) {
        // Attention only shows up when something needs review.
        val rows = TodayFilter.entries.filter {
            it != TodayFilter.Attention || summary.attention > 0 || selected == it
        }
        rows.forEachIndexed { i, f ->
            if (i > 0) HorizontalDivider(modifier = Modifier.padding(horizontal = 10.dp), color = colors.outlineVariant)
            val count = when (f) {
                TodayFilter.Paid -> summary.paid
                TodayFilter.Open -> summary.open
                TodayFilter.Closed -> summary.closed
                TodayFilter.Attention -> summary.attention
            }
            StatusCountRow(f.label, count, f.tone, selected = selected == f) { onSelect(f) }
        }
    }
}

@Composable
private fun StatusCountRow(label: String, value: Int, tone: Color, selected: Boolean, onClick: () -> Unit) {
    val bg by animateColorAsState(
        if (selected) tone.copy(alpha = 0.14f) else Color.Transparent,
        label = "status-filter-bg",
    )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(bg)
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(12.dp)
                .clip(CircleShape)
                .background(tone),
        )
        Spacer(modifier = Modifier.width(12.dp))
        Text(
            label,
            fontSize = 17.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            color = if (selected) tone else MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f),
        )
        Text(
            value.toString(),
            fontSize = 28.sp,
            fontWeight = FontWeight.Bold,
            color = if (selected) tone else MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun HourlyCard(hourly: List<Triple<Int, Int, Int>>) {
    val colors = MaterialTheme.colorScheme
    val max = (hourly.maxOfOrNull { it.second } ?: 0).coerceAtLeast(1)
    val grid = colors.outlineVariant
    val dot = colors.onSurfaceVariant.copy(alpha = 0.35f)
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = colors.surface,
        border = BorderStroke(1.dp, colors.outlineVariant),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(18.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Activity by hour",
                    fontSize = 19.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f),
                )
                LegendDot(PaidGreen, "Paid")
                Spacer(modifier = Modifier.width(18.dp))
                LegendDot(OtherBar, "Other")
            }
            Spacer(modifier = Modifier.height(14.dp))
            Canvas(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(100.dp),
            ) {
                val dotRadius = 3.dp.toPx()
                val chartH = size.height - dotRadius * 2 - 6.dp.toPx()
                val dash = PathEffect.dashPathEffect(floatArrayOf(6f, 8f))
                for (i in 0..3) {
                    val y = chartH * i / 3f
                    drawLine(grid, Offset(0f, y), Offset(size.width, y), strokeWidth = 1f, pathEffect = dash)
                }
                val slot = size.width / hourly.size.coerceAtLeast(1)
                val barW = slot * 0.5f
                val radius = CornerRadius(6.dp.toPx())
                hourly.forEachIndexed { i, (_, total, paid) ->
                    val cx = i * slot + slot / 2f
                    drawCircle(dot, dotRadius, Offset(cx, size.height - dotRadius))
                    if (total > 0) {
                        val x = cx - barW / 2f
                        val totalH = chartH * total / max
                        val paidH = chartH * paid / max
                        drawRoundRect(OtherBar, Offset(x, chartH - totalH), Size(barW, totalH), radius)
                        if (paid > 0) {
                            drawRoundRect(PaidGreen, Offset(x, chartH - paidH), Size(barW, paidH), radius)
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.height(6.dp))
            Row(modifier = Modifier.fillMaxWidth()) {
                hourly.forEachIndexed { i, (hour, _, _) ->
                    Text(
                        text = if (i % 3 == 0 || i == hourly.lastIndex) "%02d".format(hour) else "",
                        fontSize = 13.sp,
                        color = colors.onSurfaceVariant,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

@Composable
private fun LegendDot(color: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(10.dp)
                .clip(CircleShape)
                .background(color),
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text(label, fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun RecentRow(order: PaymentOrder, zone: ZoneId, onClick: () -> Unit) {
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
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = order.orderNumber.substringAfterLast('-'),
                fontSize = 14.sp,
                color = muted,
                modifier = Modifier.weight(1f),
            )
            StatusPill(order.status, caps = false)
        }
        Row(
            modifier = Modifier.padding(top = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AssetIcon(asset = order.asset, size = 34.dp)
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "${groupThousands(order.payableAmount.amount)} ${order.asset}",
                    fontWeight = FontWeight.Bold,
                    fontSize = 19.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = listOfNotNull(
                        OrderInfoFormat.shortTime(order.createdAt, zone),
                        order.createdByName,
                    ).joinToString("  ·  "),
                    fontSize = 14.sp,
                    color = muted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            order.invoice?.let {
                Spacer(modifier = Modifier.width(10.dp))
                Text(OrderInfoFormat.fiat(it), fontSize = 16.sp, fontWeight = FontWeight.Medium)
            }
        }
    }
}

@Composable
private fun EmptyToday(message: String) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(vertical = 28.dp, horizontal = 20.dp).fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(
                Icons.Outlined.ReceiptLong,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(36.dp),
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(message, fontWeight = FontWeight.SemiBold)
        }
    }
}
