package com.paymentgate.cashier.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import com.paymentgate.cashier.api.AssetNetworkCatalog
import com.paymentgate.cashier.api.ChargeCurrency
import com.paymentgate.cashier.api.OrderStatusUi
import com.paymentgate.cashier.api.PaymentDetails
import com.paymentgate.cashier.qr.QrBitmaps
import com.paymentgate.cashier.qr.QrMode
import com.paymentgate.cashier.qr.qrPayloadFor
import java.time.Instant
import kotlinx.coroutines.delay

/** What the customer-facing second screen should show; set by the cashier UI. */
sealed interface CustomerView {
    data object Ready : CustomerView

    data class Charge(
        val amount: String,
        val chargeIn: ChargeCurrency,
        val asset: String,
        val network: String,
    ) : CustomerView

    data class Payment(
        val amount: String,
        val asset: String,
        val network: String,
        val qrPayload: String,
        val status: String,
        val expiresAt: String?,
        val confirmations: Int,
        val requiredConfirmations: Int,
        /** Counter policy and the payment is seen; the customer is done. */
        val releaseReady: Boolean = false,
    ) : CustomerView
}

fun PaymentDetails.toCustomerView(qrMode: QrMode): CustomerView.Payment =
    CustomerView.Payment(
        amount = payableAmount.amount,
        asset = asset,
        network = network,
        qrPayload = qrPayloadFor(qrMode),
        status = status,
        expiresAt = expiresAt,
        confirmations = confirmations,
        requiredConfirmations = requiredConfirmations,
        releaseReady =
            confirmationProgress(status, confirmations, requiredConfirmations, fulfillmentPolicy).releaseReady,
    )

object CustomerScreen {
    /** Without cashier input for this long, only an open QR stays up; everything else falls back to Ready. */
    const val IDLE_MS = 120_000L

    var requested by mutableStateOf<CustomerView>(CustomerView.Ready)
    var orgName by mutableStateOf<String?>(null)
    var orgIconKey by mutableStateOf<String?>(null)
    var lastInteractionAt by mutableLongStateOf(System.currentTimeMillis())
        private set

    /**
     * Called for every touch and key event, including each finger move. Readers only need
     * second precision, so the state changes at most once a second instead of recomposing
     * observers on every event.
     */
    fun touch() {
        val now = System.currentTimeMillis()
        if (now - lastInteractionAt >= 1_000L) lastInteractionAt = now
    }
}

private val PanelBg = Color(0xFF0B1220)
private val CardBg = Color(0xFF141C2E)
private val CardBorder = Color(0xFF26324A)
private val Muted = Color(0xFF94A3B8)
private val Accent = Color(0xFF60A5FA)
private val Amber = Color(0xFFF59E0B)

@Composable
fun CustomerScreenContent() {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(5_000)
            now = System.currentTimeMillis()
        }
    }
    val requested = CustomerScreen.requested
    val idle = now - CustomerScreen.lastInteractionAt >= CustomerScreen.IDLE_MS
    val keepQr = requested is CustomerView.Payment && OrderStatusUi.isOpenPaymentOrder(requested.status)
    val view = if (idle && !keepQr) CustomerView.Ready else requested

    Box(modifier = Modifier.fillMaxSize().background(PanelBg)) {
        if (view == CustomerView.Ready) LoginSceneBackground(
            dark = true,
            still = true,
            waveAmplitude = 1.6f,
            showBlocks = false,
            showGradients = false,
            centerDip = true,
        )
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp),
            contentAlignment = Alignment.Center,
        ) {
            when (view) {
                CustomerView.Ready -> ReadyView(CustomerScreen.orgName, CustomerScreen.orgIconKey)
                is CustomerView.Charge -> ChargeView(view)
                is CustomerView.Payment -> PaymentView(view, now)
            }
        }
    }
}

@Composable
private fun ReadyView(orgName: String?, orgIconKey: String?) {
    val shadow = Shadow(color = Color.Black.copy(alpha = 0.6f), offset = Offset(0f, 2f), blurRadius = 8f)
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.offset(y = (-45).dp),
    ) {
        OrgBrandMark(iconKey = orgIconKey, size = 134.dp)
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = orgName?.takeIf { it.isNotBlank() } ?: "PaymentGate",
            fontSize = 36.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White,
            textAlign = TextAlign.Center,
            style = TextStyle(shadow = shadow),
        )
        Spacer(modifier = Modifier.height(10.dp))
        Text(
            "Ready to accept crypto payments",
            fontSize = 18.sp,
            color = Color.White.copy(alpha = 0.8f),
            textAlign = TextAlign.Center,
            style = TextStyle(shadow = shadow),
        )
        Spacer(modifier = Modifier.height(28.dp))
        Text(
            "Powered by PaymentGate",
            fontSize = 14.sp,
            color = Color(0xFFF5C542).copy(alpha = 0.85f),
            style = TextStyle(shadow = shadow),
        )
    }
}

@Composable
private fun PanelCard(content: @Composable () -> Unit) {
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = CardBg,
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, CardBorder, RoundedCornerShape(20.dp)),
    ) {
        Box(modifier = Modifier.padding(20.dp)) { content() }
    }
}

@Composable
private fun ChargeView(view: CustomerView.Charge) {
    val networkLabel = AssetNetworkCatalog.find(view.asset, view.network, null)?.shortNetworkLabel ?: view.network.uppercase()
    PanelCard {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
            Text(
                text = if (view.chargeIn == ChargeCurrency.TOKEN) view.asset else view.chargeIn.name,
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
                color = Accent,
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(Accent.copy(alpha = 0.14f))
                    .padding(horizontal = 16.dp, vertical = 4.dp),
            )
            Spacer(modifier = Modifier.height(18.dp))
            val typed = view.chargeIn.symbol + view.amount.ifBlank { "0" }
            val hint = decimalsHint(view.amount)
            val size = when {
                (typed + hint).length <= 7 -> 76
                (typed + hint).length <= 10 -> 60
                else -> 46
            }
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    text = buildAnnotatedString {
                        withStyle(SpanStyle(color = if (view.amount.isBlank()) Color.White.copy(alpha = 0.35f) else Color.White)) {
                            append(typed)
                        }
                        withStyle(SpanStyle(color = Color.White.copy(alpha = 0.35f))) { append(hint) }
                    },
                    fontSize = size.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                )
                if (view.chargeIn == ChargeCurrency.TOKEN) {
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(view.asset, fontSize = 22.sp, color = Muted, modifier = Modifier.padding(bottom = 10.dp))
                }
            }
            HorizontalDivider(modifier = Modifier.padding(vertical = 18.dp), color = CardBorder)
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                AssetBadge(view.asset, view.network, 44)
                Spacer(modifier = Modifier.width(14.dp))
                Column {
                    Text(view.asset, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    Text(networkLabel, fontSize = 16.sp, color = Accent)
                }
            }
        }
    }
}

@Composable
private fun AssetBadge(asset: String, network: String, sizeDp: Int) {
    Box {
        AssetIcon(asset = asset, size = sizeDp.dp)
        NetworkIcon(
            network = network,
            size = (sizeDp / 2.2f).dp,
            modifier = Modifier.align(Alignment.BottomEnd).offset(x = 4.dp, y = 4.dp),
        )
    }
}

@Composable
private fun PaymentView(view: CustomerView.Payment, now: Long) {
    val networkLabel = AssetNetworkCatalog.find(view.asset, view.network, null)?.shortNetworkLabel ?: view.network.uppercase()
    val qr = remember(view.qrPayload) {
        runCatching { QrBitmaps.encode(view.qrPayload, errorCorrection = ErrorCorrectionLevel.H) }.getOrNull()?.asImageBitmap()
    }
    val stamp = customerStamp(view.status, view.releaseReady)
    val open = OrderStatusUi.isOpenPaymentOrder(view.status) && stamp == null
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxSize()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            AssetBadge(view.asset, view.network, 34)
            Spacer(modifier = Modifier.width(12.dp))
            Column {
                Text(
                    "${groupThousands(view.amount)} ${view.asset}",
                    fontSize = 30.sp,
                    fontWeight = FontWeight.Black,
                    color = Color.White,
                    maxLines = 1,
                )
                Text(networkLabel, fontSize = 15.sp, color = Accent)
            }
        }
        Spacer(modifier = Modifier.height(12.dp))
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentAlignment = Alignment.Center,
        ) {
            val qrAlpha = if (stamp != null) 0.15f else 1f
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(14.dp))
                    .background(Color.White.copy(alpha = if (stamp != null) 0.2f else 1f))
                    .padding(10.dp),
                contentAlignment = Alignment.Center,
            ) {
                if (qr != null) {
                    Image(
                        bitmap = qr,
                        contentDescription = "Payment QR",
                        modifier = Modifier
                            .size(270.dp)
                            .graphicsLayer { alpha = qrAlpha },
                    )
                }
                Box(
                    modifier = Modifier
                        .graphicsLayer { alpha = qrAlpha }
                        .clip(RoundedCornerShape(10.dp))
                        .background(Color.White)
                        .padding(4.dp),
                ) { NetworkIcon(network = view.network, size = 40.dp) }
            }
            if (stamp != null) CustomerStampMark(stamp)
        }
        Spacer(modifier = Modifier.height(10.dp))
        when {
            open -> {
                Text(
                    text = when (view.status) {
                        OrderStatusUi.PENDING -> "${view.asset} on $networkLabel only"
                        else -> "Payment detected · confirming ${view.confirmations}/${view.requiredConfirmations.coerceAtLeast(1)}"
                    },
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = if (view.status == OrderStatusUi.PENDING) Amber else Accent,
                )
                minutesLeft(view.expiresAt, now)?.takeIf { view.status == OrderStatusUi.PENDING }?.let {
                    Text(it, fontSize = 14.sp, color = Muted)
                }
            }
            stamp != null -> Text(stamp.caption, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = stamp.tone)
        }
    }
}

private data class CustomerStamp(val label: String, val tone: Color, val caption: String)

private fun customerStamp(status: String, releaseReady: Boolean): CustomerStamp? =
    when {
        OrderStatusUi.showsCompleted(status) -> CustomerStamp("PAID", Color(0xFF22C55E), "Payment received · thank you")
        releaseReady -> CustomerStamp("RECEIVED", Color(0xFF22C55E), "Payment received · thank you")
        OrderStatusUi.isAnomaly(status) -> CustomerStamp("REVIEW", Amber, "Please wait for the cashier")
        status == OrderStatusUi.EXPIRED -> CustomerStamp("EXPIRED", Color(0xFFEF4444), "This payment request expired")
        status == OrderStatusUi.FAILED -> CustomerStamp("FAILED", Color(0xFFEF4444), "Payment failed")
        status == OrderStatusUi.CANCELLED -> CustomerStamp("CANCELLED", Color(0xFFEF4444), "Payment cancelled")
        else -> null
    }

/** One short drop; the panel is streamed over a slow serial link, so nothing loops here. */
@Composable
private fun CustomerStampMark(stamp: CustomerStamp) {
    var landed by remember(stamp.label) { mutableStateOf(false) }
    LaunchedEffect(stamp.label) { landed = true }
    val scale by animateFloatAsState(if (landed) 1f else 1.8f, tween(280), label = "customer-stamp")
    Box(
        modifier = Modifier
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                rotationZ = -14f
            }
            .border(5.dp, stamp.tone, RoundedCornerShape(16.dp))
            .padding(4.dp)
            .border(2.dp, stamp.tone, RoundedCornerShape(12.dp))
            .padding(horizontal = 24.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(stamp.label, fontSize = if (stamp.label.length > 7) 42.sp else 52.sp, fontWeight = FontWeight.Black, letterSpacing = 4.sp, color = stamp.tone)
    }
}

private fun minutesLeft(expiresAt: String?, now: Long): String? {
    val end = expiresAt?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() } ?: return null
    val minutes = ((end - now) / 60_000L).toInt()
    return when {
        end <= now -> null
        minutes < 1 -> "Expires in less than a minute"
        else -> "Expires in $minutes min"
    }
}

private fun decimalsHint(amount: String): String {
    val dot = amount.indexOf('.')
    if (dot < 0) return ".00"
    val decimals = amount.length - dot - 1
    return if (decimals < 2) "0".repeat(2 - decimals) else ""
}
