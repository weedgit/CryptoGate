package com.paymentgate.cashier.ui

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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.paymentgate.cashier.api.CashierPosSurface
import kotlinx.coroutines.delay

const val PIN_MIN_LENGTH = 6
const val PIN_MAX_LENGTH = 8

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
    onPinSubmit: (String) -> Unit,
    onClearError: () -> Unit,
) {
    var digits by remember { mutableStateOf("") }
    var remaining by remember(lockedSeconds) { mutableIntStateOf(lockedSeconds) }
    val locked = remaining > 0
    val enabled = !busy && !locked

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
            if (lockedSeconds <= 0) {
                delay(2000)
                onClearError()
            }
        }
    }

    fun submit() {
        if (enabled && digits.length >= PIN_MIN_LENGTH) onPinSubmit(digits)
    }

    PosScreenFrame {
        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "POS LOCKED",
                    fontFamily = FontFamily.Monospace,
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = orgTypeLabel,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(modifier = Modifier.height(20.dp))
            OrgBrandMark(
                iconKey = LocalPosOrg.current?.iconKey,
                size = 72.dp,
                modifier = Modifier.align(Alignment.CenterHorizontally),
            )
            Spacer(modifier = Modifier.height(14.dp))
            Text(
                text = orgName,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
                maxLines = 2,
                modifier = Modifier.fillMaxWidth(),
            )
            Text(
                text = "Enter your PIN",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
            val notice =
                when {
                    locked -> CashierPosSurface.unlockLockedMessage(remaining)
                    else -> error
                }
            Box(
                modifier = Modifier.fillMaxWidth().height(44.dp),
                contentAlignment = Alignment.Center,
            ) {
                if (!notice.isNullOrBlank()) {
                    Text(
                        text = notice,
                        color = MaterialTheme.colorScheme.error,
                        fontWeight = FontWeight.SemiBold,
                        textAlign = TextAlign.Center,
                    )
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth().height(24.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (busy) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    repeat(maxOf(PIN_MIN_LENGTH, digits.length)) { i ->
                        Box(
                            modifier =
                                Modifier
                                    .padding(horizontal = 8.dp)
                                    .size(14.dp)
                                    .clip(CircleShape)
                                    .background(
                                        if (i < digits.length) MaterialTheme.colorScheme.primary
                                        else MaterialTheme.colorScheme.outline,
                                    ),
                        )
                    }
                }
            }
            Spacer(modifier = Modifier.height(24.dp))
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 1.dp,
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    listOf(
                        listOf("1", "2", "3"),
                        listOf("4", "5", "6"),
                        listOf("7", "8", "9"),
                        listOf(KEY_BACK, "0", KEY_ENTER),
                    ).forEach { row ->
                        Row(
                            modifier =
                                Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            row.forEach { key ->
                                val isEnter = key == KEY_ENTER
                                val keyEnabled =
                                    enabled && (!isEnter || digits.length >= PIN_MIN_LENGTH)
                                Surface(
                                    modifier =
                                        Modifier
                                            .weight(1f)
                                            .height(64.dp)
                                            .clickable(enabled = keyEnabled) {
                                                when (key) {
                                                    KEY_BACK -> digits = digits.dropLast(1)
                                                    KEY_ENTER -> submit()
                                                    else ->
                                                        if (digits.length < PIN_MAX_LENGTH) digits += key
                                                }
                                            },
                                    shape = RoundedCornerShape(14.dp),
                                    color =
                                        if (isEnter && keyEnabled) MaterialTheme.colorScheme.primary
                                        else MaterialTheme.colorScheme.surfaceVariant,
                                ) {
                                    Box(
                                        modifier = Modifier.fillMaxSize(),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Text(
                                            text = key,
                                            fontSize = 22.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            textAlign = TextAlign.Center,
                                            color =
                                                when {
                                                    isEnter && keyEnabled -> MaterialTheme.colorScheme.onPrimary
                                                    keyEnabled -> MaterialTheme.colorScheme.onSurface
                                                    else -> MaterialTheme.colorScheme.outline
                                                },
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.weight(1f))
            SecuredByPaymentGate(
                modifier = Modifier
                    .align(Alignment.CenterHorizontally)
                    .padding(bottom = 4.dp),
            )
        }
    }
}

private const val KEY_BACK = "⌫"
private const val KEY_ENTER = "OK"
