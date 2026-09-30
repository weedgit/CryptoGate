package com.paymentgate.cashier.ui

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.paymentgate.cashier.R
import com.paymentgate.cashier.api.OrgInfo

/** The org this POS is bound to; null before setup. */
val LocalPosOrg = compositionLocalOf<OrgInfo?> { null }

/** Preset marks — same ids, glyphs and gradients as web `ORG_ICON_PRESETS` / `.org-brand-mark--*`. */
private val ORG_ICON_PRESETS: Map<String, Pair<String, List<Color>>> = mapOf(
    "mark" to ("◆" to listOf(Color(0xFF5EEAD4), Color(0xFF14B8A6))),
    "hex" to ("⬡" to listOf(Color(0xFF93C5FD), Color(0xFF3B82F6))),
    "store" to ("▣" to listOf(Color(0xFFFCD34D), Color(0xFFF59E0B))),
    "globe" to ("◎" to listOf(Color(0xFFA5B4FC), Color(0xFF6366F1))),
    "shield" to ("◈" to listOf(Color(0xFF86EFAC), Color(0xFF22C55E))),
    "spark" to ("✦" to listOf(Color(0xFFF9A8D4), Color(0xFFEC4899))),
    "node" to ("◉" to listOf(Color(0xFFFDBA74), Color(0xFFF97316))),
    "grid" to ("▦" to listOf(Color(0xFFC4B5FD), Color(0xFF8B5CF6))),
)

internal fun decodeDataImage(iconKey: String): ImageBitmap? {
    if (!iconKey.startsWith("data:image/")) return null
    val base64 = iconKey.substringAfter("base64,", "").ifEmpty { return null }
    return runCatching {
        val bytes = Base64.decode(base64, Base64.DEFAULT)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
    }.getOrNull()
}

/** Org logo: uploaded image, preset glyph, or the PaymentGate gate when the org has none. */
@Composable
fun OrgBrandMark(
    iconKey: String?,
    size: Dp,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(size * 0.28f)
    val image = remember(iconKey) { iconKey?.let(::decodeDataImage) }
    val preset = iconKey?.let { ORG_ICON_PRESETS[it] }
    when {
        image != null ->
            Image(
                bitmap = image,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = modifier.size(size).clip(shape),
            )
        preset != null -> {
            val fontSize = with(LocalDensity.current) { (size * 0.46f).toSp() }
            Box(
                modifier = modifier
                    .size(size)
                    .clip(shape)
                    .background(Brush.linearGradient(preset.second)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = preset.first,
                    color = Color(0xFF0B0F14),
                    fontSize = fontSize,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
        else ->
            Image(
                painter = painterResource(id = R.drawable.pg_brand_gate),
                contentDescription = null,
                modifier = modifier.size(size),
            )
    }
}

/** Header lockup for a bound POS: the org's mark and name (PaymentGate only before setup). */
@Composable
fun OrgBrand(
    modifier: Modifier = Modifier,
    iconSize: Dp = 28.dp,
) {
    val org = LocalPosOrg.current
    if (org == null || org.name.isBlank()) {
        PaymentGateBrand(modifier = modifier, iconSize = iconSize)
        return
    }
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        OrgBrandMark(iconKey = org.iconKey, size = iconSize)
        Text(
            text = org.name,
            fontSize = 18.sp,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onBackground,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** Quiet platform credit for the lock screen footer. */
@Composable
fun SecuredByPaymentGate(modifier: Modifier = Modifier) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            text = "SECURED BY",
            fontSize = 10.sp,
            fontWeight = FontWeight.Medium,
            letterSpacing = 1.6.sp,
            color = muted.copy(alpha = 0.7f),
        )
        Image(
            painter = painterResource(id = R.drawable.pg_brand_gate),
            contentDescription = null,
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = "PaymentGate",
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = (-0.1).sp,
            color = muted,
        )
    }
}
