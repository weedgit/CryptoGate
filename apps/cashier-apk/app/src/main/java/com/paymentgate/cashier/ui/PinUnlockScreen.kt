package com.paymentgate.cashier.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.ui.draw.shadow
import com.paymentgate.cashier.ui.theme.LocalPosDark
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Backspace
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.paymentgate.cashier.api.CashierPosSurface
import kotlinx.coroutines.delay

/** Server-generated PINs are 6 digits; the 6th digit signs in (no OK key). */
const val PIN_LENGTH = 6

/**
 * PIN-only unlock for a bound POS. The server identifies the person inside
 * [orgName]'s org from the PIN alone — there is no name picker.
 *
 * @param lockedSeconds Seconds left on a `pos_unlock_locked` lockout; the pad is disabled until 0.
 */
@Composable
fun PinUnlockScreen(
    orgName: String,
    orgTypeLabel: String,
    error: String?,
    busy: Boolean,
    lockedSeconds: Int,
    darkTheme: Boolean,
    onToggleTheme: () -> Unit,
    onPinSubmit: (String) -> Unit,
    onClearError: () -> Unit,
) {
    var digits by remember { mutableStateOf("") }
    var remaining by remember(lockedSeconds) { mutableIntStateOf(lockedSeconds) }
    val locked = remaining > 0
    val enabled = !busy && !locked
    val shake = remember { Animatable(0f) }

    LaunchedEffect(lockedSeconds) {
        while (remaining > 0) {
            delay(1000)
            remaining -= 1
        }
        if (lockedSeconds > 0) onClearError()
    }

    LaunchedEffect(error) {
        if (error != null) {
            digits = ""
            shake.animateTo(
                0f,
                keyframes {
                    durationMillis = 420
                    -14f at 60
                    12f at 140
                    -8f at 220
                    5f at 300
                    0f at 420
                },
            )
            if (lockedSeconds <= 0) {
                delay(2000)
                onClearError()
            }
        }
    }

    fun submit() {
        if (enabled && digits.length == PIN_LENGTH) onPinSubmit(digits)
    }

    val colors = MaterialTheme.colorScheme
    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
            .padding(horizontal = posHorizontalPadding(), vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(colors.surface.copy(alpha = if (darkTheme) 0.6f else 1f))
                    .border(1.dp, colors.outlineVariant, RoundedCornerShape(50))
                    .padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(Icons.Outlined.Lock, null, tint = colors.primary, modifier = Modifier.size(16.dp))
                Text(
                    text = "POS locked",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = colors.onSurfaceVariant,
                )
            }
            PosThemeToggle(darkTheme = darkTheme, onToggle = onToggleTheme)
        }

        Spacer(modifier = Modifier.weight(1f))

        OrgBrandMark(iconKey = LocalPosOrg.current?.iconKey, size = 112.dp)
        Spacer(modifier = Modifier.height(20.dp))
        Text(
            text = orgName,
            fontSize = 34.sp,
            lineHeight = 40.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = (-0.6).sp,
            color = colors.onBackground,
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(modifier = Modifier.height(4.dp))
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(50))
                .background(colors.primaryContainer)
                .padding(start = 8.dp, end = 12.dp, top = 4.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Icon(Icons.Filled.Verified, contentDescription = null, tint = colors.primary, modifier = Modifier.size(16.dp))
            Text(
                text = orgTypeLabel,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = colors.primary,
            )
        }
        Spacer(modifier = Modifier.height(22.dp))
        Text(
            text = "Enter your PIN",
            fontSize = 21.sp,
            fontWeight = FontWeight.Medium,
            color = colors.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(18.dp))

        Row(
            modifier = Modifier
                .height(28.dp)
                .graphicsLayer { translationX = shake.value.dp.toPx() },
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (busy) {
                CircularProgressIndicator(
                    color = colors.primary,
                    modifier = Modifier.size(26.dp),
                    strokeWidth = 2.5.dp,
                )
            } else {
                repeat(PIN_LENGTH) { i ->
                    PinDot(filled = i < digits.length, error = error != null && !locked)
                }
            }
        }

        val notice = if (locked) CashierPosSurface.unlockLockedMessage(remaining) else error
        Box(
            modifier = Modifier.fillMaxWidth().height(44.dp),
            contentAlignment = Alignment.Center,
        ) {
            if (!notice.isNullOrBlank()) {
                Text(
                    text = notice,
                    color = colors.error,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center,
                )
            }
        }

        Box(modifier = Modifier.widthIn(max = 440.dp).fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                listOf(
                    listOf("1", "2", "3"),
                    listOf("4", "5", "6"),
                    listOf("7", "8", "9"),
                    listOf(KEY_CLEAR, "0", KEY_BACK),
                ).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        row.forEach { key ->
                            val isEdit = key == KEY_BACK || key == KEY_CLEAR
                            PinKey(
                                key = key,
                                enabled = enabled && (!isEdit || digits.isNotEmpty()),
                                modifier = Modifier.weight(1f),
                            ) {
                                when (key) {
                                    KEY_BACK -> digits = digits.dropLast(1)
                                    KEY_CLEAR -> digits = ""
                                    else -> if (digits.length < PIN_LENGTH) {
                                        digits += key
                                        if (digits.length == PIN_LENGTH) submit()
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.weight(1f))
        SecuredByPaymentGate(modifier = Modifier.padding(top = 12.dp, bottom = 4.dp))
    }
}

@Composable
private fun PinDot(filled: Boolean, error: Boolean) {
    val colors = MaterialTheme.colorScheme
    val fill by animateColorAsState(
        targetValue = when {
            error -> colors.error
            filled -> colors.primary
            else -> Color.Transparent
        },
        animationSpec = tween(140),
        label = "pin-dot",
    )
    Box(
        modifier = Modifier
            .size(22.dp)
            .clip(CircleShape)
            .background(fill)
            .border(2.dp, if (filled || error) fill else colors.outline, CircleShape),
    )
}

@Composable
private fun PinKey(
    key: String,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val colors = MaterialTheme.colorScheme
    val isClear = key == KEY_CLEAR
    val dark = LocalPosDark.current
    val isEdit = isClear || key == KEY_BACK
    val bg = when {
        dark -> if (isEdit) colors.surfaceVariant.copy(alpha = 0.55f) else colors.surfaceVariant
        isEdit -> colors.surface.copy(alpha = 0.7f)
        else -> colors.surface
    }
    val fg = when {
        !enabled -> colors.outline
        isClear -> colors.error
        else -> colors.onSurface
    }
    val shape = RoundedCornerShape(18.dp)
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val elevation by animateDpAsState(
        targetValue = when {
            !enabled -> 0.dp
            pressed -> 1.dp
            else -> 6.dp
        },
        animationSpec = tween(120),
        label = "pin-key-shadow",
    )
    val shadowTint = if (dark) Color.Black.copy(alpha = 0.55f) else Color(0xFF1E3A8A).copy(alpha = 0.22f)
    Box(
        modifier = modifier
            .height(70.dp)
            .shadow(elevation, shape, ambientColor = shadowTint, spotColor = shadowTint)
            .clip(shape)
            .background(bg)
            .border(1.dp, posKeyBorder(), shape)
            .clickable(interactionSource = interaction, indication = LocalIndication.current, enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (key == KEY_BACK) {
            Icon(
                Icons.AutoMirrored.Outlined.Backspace,
                contentDescription = "Delete",
                tint = fg,
                modifier = Modifier.size(26.dp),
            )
        } else {
            Text(
                text = key,
                fontSize = if (isClear) 18.sp else 28.sp,
                fontWeight = if (isClear) FontWeight.Bold else FontWeight.SemiBold,
                color = fg,
            )
        }
    }
}

private const val KEY_BACK = "⌫"
private const val KEY_CLEAR = "Clear"
