package com.paymentgate.cashier.ui

import android.widget.Toast
import androidx.compose.ui.graphics.Color
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Print
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Wallpaper
import androidx.compose.material.icons.automirrored.outlined.VolumeUp
import androidx.compose.material3.VerticalDivider
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.paymentgate.cashier.hardware.PrintOutcome
import com.paymentgate.cashier.hardware.PrinterHwStatus
import com.paymentgate.cashier.hardware.ReceiptJob
import kotlinx.coroutines.launch

/**
 * G9 — minimal POS settings. No settlement / xPub / matching / API keys.
 */
@Composable
fun SettingsScreen(
    appVersion: String,
    appEnv: String,
    apiBaseUrl: String,
    deviceId: String,
    darkTheme: Boolean,
    onDarkThemeChange: (Boolean) -> Unit,
    printerAvailable: Boolean,
    printerStatusLabel: String,
    lastReceipt: ReceiptJob?,
    onReprint: suspend () -> PrintOutcome,
    onTestPrint: (suspend () -> PrintOutcome)? = null,
    orgName: String,
    orgTypeLabel: String,
    orgIconKey: String?,
    operatorName: String,
    operatorRoleLabel: String,
    operatorAvatarUrl: String?,
    canUnbind: Boolean,
    onUnbind: suspend () -> String?,
    idleLockMinutes: Int = 5,
    onIdleLockMinutesChange: ((Int) -> Unit)? = null,
    screenSaverMinutes: Int = 2,
    onScreenSaverMinutesChange: ((Int) -> Unit)? = null,
    soundLevel: Int = 3,
    onSoundLevelChange: ((Int) -> Unit)? = null,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var reprinting by remember { mutableStateOf(false) }
    var testing by remember { mutableStateOf(false) }
    var confirmUnbind by remember { mutableStateOf(false) }
    var unbinding by remember { mutableStateOf(false) }
    var unbindError by remember { mutableStateOf<String?>(null) }

    if (confirmUnbind) {
        AlertDialog(
            onDismissRequest = { if (!unbinding) confirmUnbind = false },
            title = { Text("Unbind this POS?") },
            text = {
                Column {
                    Text(
                        "This POS stops charging for $orgName. PINs stop working here " +
                            "until an Owner or Admin sets it up again with email and password.",
                    )
                    if (unbindError != null) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(unbindError.orEmpty(), color = MaterialTheme.colorScheme.error)
                    }
                }
            },
            confirmButton = {
                TextButton(
                    enabled = !unbinding,
                    onClick = {
                        scope.launch {
                            unbinding = true
                            unbindError = onUnbind()
                            unbinding = false
                            if (unbindError == null) confirmUnbind = false
                        }
                    },
                ) {
                    Text(
                        if (unbinding) "Unbinding…" else "Unbind",
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            },
            dismissButton = {
                TextButton(enabled = !unbinding, onClick = { confirmUnbind = false }) {
                    Text("Cancel")
                }
            },
        )
    }

    fun runPrint(action: suspend () -> PrintOutcome, okMessage: String, setBusy: (Boolean) -> Unit) {
        scope.launch {
            setBusy(true)
            try {
                when (val outcome = action()) {
                    PrintOutcome.Ok -> Toast.makeText(context, okMessage, Toast.LENGTH_SHORT).show()
                    is PrintOutcome.Failed ->
                        Toast.makeText(context, printFailureMessage(outcome), Toast.LENGTH_LONG).show()
                }
            } finally {
                setBusy(false)
            }
        }
    }

    PosScreenFrame(applySystemBars = false) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            SettingsCard {
                Row(
                    modifier = Modifier.height(IntrinsicSize.Min),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(modifier = Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                        OrgBrandMark(iconKey = orgIconKey, size = 60.dp)
                        Spacer(modifier = Modifier.width(16.dp))
                        Column {
                            Text(
                                text = orgName,
                                fontSize = 20.sp,
                                fontWeight = FontWeight.Bold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                text = orgTypeLabel,
                                fontSize = 14.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    VerticalDivider(
                        modifier = Modifier
                            .fillMaxHeight()
                            .padding(horizontal = 18.dp, vertical = 6.dp),
                        color = MaterialTheme.colorScheme.outlineVariant,
                    )
                    Row(modifier = Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                        UserAvatar(name = operatorName, avatarUrl = operatorAvatarUrl, size = 48.dp)
                        Spacer(modifier = Modifier.width(14.dp))
                        Column {
                            Text(
                                text = operatorName,
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Bold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                text = operatorRoleLabel,
                                fontSize = 14.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                            )
                        }
                    }
                }
            }

            SettingsCard {
                SectionHeader(Icons.Outlined.LightMode, "Appearance")
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(14.dp)),
                ) {
                    ThemeOption("Light", Icons.Outlined.LightMode, selected = !darkTheme, Modifier.weight(1f)) {
                        onDarkThemeChange(false)
                    }
                    ThemeOption("Dark", Icons.Outlined.DarkMode, selected = darkTheme, Modifier.weight(1f)) {
                        onDarkThemeChange(true)
                    }
                }
                HorizontalDivider(
                    modifier = Modifier.padding(vertical = 16.dp),
                    color = MaterialTheme.colorScheme.outlineVariant,
                )
                SectionHeader(Icons.Outlined.Schedule, "Auto-lock", subtitle = "After inactivity")
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    listOf(0 to "Off", 5 to "5 min", 10 to "10 min", 15 to "15 min", 30 to "30 min")
                        .forEach { (mins, label) ->
                            AutoLockOption(
                                label = label,
                                selected = idleLockMinutes == mins,
                                enabled = onIdleLockMinutesChange != null,
                                modifier = Modifier.weight(1f),
                            ) { onIdleLockMinutesChange?.invoke(mins) }
                        }
                }
                HorizontalDivider(
                    modifier = Modifier.padding(vertical = 16.dp),
                    color = MaterialTheme.colorScheme.outlineVariant,
                )
                SectionHeader(Icons.Outlined.Wallpaper, "Screen saver", subtitle = "After inactivity")
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    listOf(0 to "Off", 1 to "1 min", 2 to "2 min", 5 to "5 min", 10 to "10 min")
                        .forEach { (mins, label) ->
                            AutoLockOption(
                                label = label,
                                selected = screenSaverMinutes == mins,
                                enabled = onScreenSaverMinutesChange != null,
                                modifier = Modifier.weight(1f),
                            ) { onScreenSaverMinutesChange?.invoke(mins) }
                        }
                }
                HorizontalDivider(
                    modifier = Modifier.padding(vertical = 16.dp),
                    color = MaterialTheme.colorScheme.outlineVariant,
                )
                SectionHeader(
                    Icons.AutoMirrored.Outlined.VolumeUp,
                    "Sounds",
                    subtitle = "Paid, problem and new orders",
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    listOf(0 to "Off", 1 to "Low", 2 to "Medium", 3 to "High")
                        .forEach { (level, label) ->
                            AutoLockOption(
                                label = label,
                                selected = soundLevel == level,
                                enabled = onSoundLevelChange != null,
                                modifier = Modifier.weight(1f),
                            ) { onSoundLevelChange?.invoke(level) }
                        }
                }
            }

            SettingsCard {
                SectionHeader(
                    Icons.Outlined.Print,
                    "Printer",
                    trailing = if (printerAvailable) "Thermal 80 mm" else "Not available",
                )
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    if (onTestPrint != null) {
                        OutlinedButton(
                            onClick = { runPrint(onTestPrint, "Test feed sent") { testing = it } },
                            enabled = !testing && printerAvailable,
                            shape = RoundedCornerShape(12.dp),
                            border = BorderStroke(1.dp, if (printerAvailable) PrinterTeal else MaterialTheme.colorScheme.outlineVariant),
                            modifier = Modifier
                                .weight(1f)
                                .height(50.dp),
                        ) {
                            Text(
                                if (testing) "Testing…" else "Test feed",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = if (printerAvailable) PrinterTeal else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    Button(
                        onClick = { runPrint(onReprint, "Receipt sent to printer") { reprinting = it } },
                        enabled = !reprinting && lastReceipt != null && printerAvailable,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .weight(1f)
                            .height(50.dp),
                    ) {
                        Text(if (reprinting) "Printing…" else "Reprint last", fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
                if (lastReceipt != null) {
                    Spacer(modifier = Modifier.height(10.dp))
                    InfoRow("Last receipt", "${lastReceipt.orderNumber} · ${lastReceipt.amountLine}", divider = false)
                }
            }

            SettingsCard {
                SectionHeader(Icons.Outlined.Info, "Device details")
                InfoRow("App", appVersion)
                InfoRow("Environment") { EnvChip(appEnv) }
                InfoRow("API", apiBaseUrl)
                InfoRow("Device ID", deviceId, divider = false)
            }

            if (canUnbind) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(MaterialTheme.colorScheme.error.copy(alpha = 0.07f))
                        .border(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.45f), RoundedCornerShape(12.dp))
                        .clickable {
                            unbindError = null
                            confirmUnbind = true
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "Unbind this POS",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
        }
    }
}

private val PrinterTeal = Color(0xFF0F9C8C)

@Composable
private fun SettingsCard(
    title: String? = null,
    trailing: String? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(18.dp)) {
            if (title != null) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = title.uppercase(),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = 1.4.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                    )
                    if (trailing != null) {
                        Text(text = trailing, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
                Spacer(modifier = Modifier.height(10.dp))
            }
            content()
        }
    }
}

@Composable
private fun SectionHeader(
    icon: ImageVector,
    title: String,
    subtitle: String? = null,
    trailing: String? = null,
) {
    val colors = MaterialTheme.colorScheme
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 14.dp),
        verticalAlignment = if (subtitle == null) Alignment.CenterVertically else Alignment.Top,
    ) {
        Icon(icon, contentDescription = null, tint = colors.onSurface, modifier = Modifier.size(24.dp))
        Spacer(modifier = Modifier.width(14.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(title, fontSize = 17.sp, fontWeight = FontWeight.Bold, color = colors.onSurface)
            if (subtitle != null) {
                Text(subtitle, fontSize = 13.sp, color = colors.onSurfaceVariant)
            }
        }
        if (trailing != null) {
            Text(trailing, fontSize = 14.sp, color = colors.onSurfaceVariant)
        }
    }
}

@Composable
private fun ThemeOption(
    label: String,
    icon: ImageVector,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val colors = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(14.dp)
    Row(
        modifier = modifier
            .height(50.dp)
            .clip(shape)
            .background(if (selected) colors.primary.copy(alpha = 0.14f) else Color.Transparent)
            .border(if (selected) 1.5.dp else 0.dp, if (selected) colors.primary else Color.Transparent, shape)
            .clickable(onClick = onClick),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = if (selected) colors.primary else colors.onSurface, modifier = Modifier.size(22.dp))
        Spacer(modifier = Modifier.width(10.dp))
        Text(
            text = label,
            fontSize = 17.sp,
            fontWeight = FontWeight.SemiBold,
            color = if (selected) colors.primary else colors.onSurface,
        )
    }
}

@Composable
private fun AutoLockOption(
    label: String,
    selected: Boolean,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val colors = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(10.dp)
    Box(
        modifier = modifier
            .height(46.dp)
            .clip(shape)
            .background(if (selected) colors.primary.copy(alpha = 0.14f) else colors.surface)
            .border(1.dp, if (selected) Color.Transparent else colors.outlineVariant, shape)
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            fontSize = 15.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            color = if (selected) colors.onSurface else colors.onSurfaceVariant,
        )
    }
}

@Composable
private fun InfoRow(label: String, value: String, divider: Boolean = true) {
    InfoRow(label, divider) {
        Text(
            text = value,
            fontSize = 15.sp,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun InfoRow(label: String, divider: Boolean = true, value: @Composable () -> Unit) {
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = label,
                fontSize = 15.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.width(200.dp),
            )
            Box(modifier = Modifier.weight(1f)) { value() }
        }
        if (divider) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f))
    }
}

@Composable
private fun EnvChip(env: String) {
    val production = env.equals("production", ignoreCase = true) || env.equals("prod", ignoreCase = true)
    val fg = if (production) Color(0xFF15803D) else Color(0xFFC2610C)
    Text(
        text = env,
        fontSize = 14.sp,
        fontWeight = FontWeight.SemiBold,
        color = fg,
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(fg.copy(alpha = 0.14f))
            .padding(horizontal = 12.dp, vertical = 3.dp),
    )
}

/** Profile photo, or initials on a tinted circle. */
@Composable
fun UserAvatar(name: String, avatarUrl: String?, size: Dp, modifier: Modifier = Modifier) {
    val image = remember(avatarUrl) { avatarUrl?.let(::decodeDataImage) }
    if (image != null) {
        Image(
            bitmap = image,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = modifier
                .size(size)
                .clip(CircleShape),
        )
        return
    }
    val initials = name.split(' ')
        .filter { it.isNotBlank() }
        .take(2)
        .joinToString("") { it.first().uppercase() }
        .ifEmpty { "?" }
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = initials,
            fontSize = (size.value * 0.38f).sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary,
        )
    }
}

fun printerStatusLabel(status: PrinterHwStatus): String =
    when (status) {
        PrinterHwStatus.Ready -> "Online"
        PrinterHwStatus.OutOfPaper -> "Out of paper"
        PrinterHwStatus.Fault -> "Fault"
        PrinterHwStatus.Unavailable -> "Unavailable"
        PrinterHwStatus.Unknown -> "Unknown"
    }
