package com.paymentgate.cashier.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Backspace
import androidx.compose.material3.Icon
import com.paymentgate.cashier.ui.theme.LocalPosDark
import androidx.compose.ui.graphics.Color
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val Keys =
    listOf(
        listOf("1", "2", "3"),
        listOf("4", "5", "6"),
        listOf("7", "8", "9"),
        listOf(".", "0", "del"),
    )

/** Cashier number pad; rows share the height it is given (min 56dp per key). */
@Composable
fun AmountKeypad(
    enabled: Boolean,
    onKey: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = MaterialTheme.colorScheme
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Keys.forEach { row ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .heightIn(min = 56.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                row.forEach { key ->
                    val interaction = remember(key) { MutableInteractionSource() }
                    val shape = RoundedCornerShape(16.dp)
                    val isDel = key == "del"
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .posPressScale(interaction)
                            .clip(shape)
                            .background(if (isDel) colors.surfaceContainerHighest else colors.surfaceVariant)
                            .border(1.dp, posKeyBorder(), shape)
                            .clickable(
                                enabled = enabled,
                                interactionSource = interaction,
                                indication = androidx.compose.material3.ripple(),
                            ) { onKey(key) },
                        contentAlignment = Alignment.Center,
                    ) {
                        val fg = if (enabled) colors.onSurface else colors.outline
                        if (isDel) {
                            Icon(
                                Icons.AutoMirrored.Outlined.Backspace,
                                contentDescription = "Delete",
                                tint = fg,
                                modifier = Modifier.size(26.dp),
                            )
                        } else {
                            Text(
                                text = key,
                                fontSize = 34.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = fg,
                            )
                        }
                    }
                }
            }
        }
    }
}

/** Key outline that sits softly on the web palette: blue-grey in light, a faint glass edge in dark. */
@Composable
internal fun posKeyBorder(): Color =
    if (LocalPosDark.current) Color.White.copy(alpha = 0.09f) else Color(0xFFD5DFEE)
