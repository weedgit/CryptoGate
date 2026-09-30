package com.paymentgate.cashier.ui

import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.material.icons.outlined.Close
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.material3.VerticalDivider
import androidx.compose.material3.HorizontalDivider
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.outlined.Notes
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Clear
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import com.paymentgate.cashier.ui.theme.LocalPosDark
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.paymentgate.cashier.api.AssetNetworkCatalog
import com.paymentgate.cashier.api.AssetNetworkPair
import com.paymentgate.cashier.api.BlockingOrder
import com.paymentgate.cashier.api.CashierPosSurface
import com.paymentgate.cashier.api.ChargeCurrency

data class ValidityChoice(val label: String, val seconds: Int)

private val validityChoices = listOf(
    ValidityChoice("15 min", 900),
    ValidityChoice("30 min", 1800),
    ValidityChoice("60 min", 3600),
)

private const val REMOTE_ORDER_HINT =
    "For phone or chat orders. The same amount stays reserved until this order is paid, cancelled, or expires."

internal fun chargeLabel(amount: String, chargeIn: ChargeCurrency, asset: String): String {
    val shown = amount.ifBlank { "0" }
    return if (chargeIn == ChargeCurrency.TOKEN) "$shown $asset" else "${chargeIn.symbol}$shown"
}

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun CreateOrderScreen(
    amount: String,
    asset: String,
    network: String,
    chainEnv: String,
    merchantReference: String,
    validitySeconds: Int,
    chargeIn: ChargeCurrency = ChargeCurrency.TOKEN,
    onChargeInChange: (ChargeCurrency) -> Unit = {},
    error: String?,
    loading: Boolean,
    online: Boolean,
    blockingOrder: BlockingOrder? = null,
    /** Set when the unlock said `liveActionsUnlocked = false`; disables Charge. */
    chargeBlockedNotice: String? = null,
    onOpenBlockingOrder: ((BlockingOrder) -> Unit)? = null,
    onAmountChange: (String) -> Unit,
    onPairChange: (AssetNetworkPair) -> Unit,
    /** Selects asset only — may leave an incompatible network for V3 unsupported-rail UX. */
    onAssetSelect: (String) -> Unit = { next ->
        val first = AssetNetworkCatalog.pairsForAsset(next, chainEnv).firstOrNull()
        if (first != null) onPairChange(first)
    },
    onMerchantReferenceChange: (String) -> Unit,
    onValidityChange: (Int) -> Unit,
    onSubmit: () -> Unit,
    onBack: () -> Unit,
) {
    val assets = AssetNetworkCatalog.assets(chainEnv)
    val selected = AssetNetworkCatalog.find(asset, network, chainEnv)
    val railUnsupported = selected == null
    val networkLabel = AssetNetworkCatalog.networkLabelFor(asset, network, chainEnv)
    val railError =
        if (railUnsupported) {
            CashierPosSurface.unsupportedRailMessage(asset, networkLabel)
        } else {
            null
        }
    val canCreate =
        !loading &&
            online &&
            amount.isNotBlank() &&
            amount != "0." &&
            selected != null &&
            blockingOrder == null &&
            chargeBlockedNotice == null
    val shownError = chargeBlockedNotice ?: error
    val amountPulse = rememberAmountPulse(amount)
    var showRailSheet by remember { mutableStateOf(false) }
    var showNoteSheet by remember { mutableStateOf(false) }
    var showOptions by remember { mutableStateOf(false) }
    val validityLabel = validityChoices.firstOrNull { it.seconds == validitySeconds }?.label
        ?: "${validitySeconds / 60} min"
    var noteDraft by remember(merchantReference) { mutableStateOf(merchantReference) }
    var auxBanner by remember { mutableStateOf<String?>(null) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val noteSheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    LaunchedEffect(auxBanner) {
        if (auxBanner != null) {
            kotlinx.coroutines.delay(3200)
            auxBanner = null
        }
    }

    if (showRailSheet) {
        ModalBottomSheet(
            onDismissRequest = { showRailSheet = false },
            sheetState = sheetState,
            containerColor = MaterialTheme.colorScheme.surface,
        ) {
            Column(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp)
                        .padding(bottom = 28.dp)
                        .verticalScroll(rememberScrollState()),
            ) {
                Row(verticalAlignment = Alignment.Top) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Payment method",
                            fontSize = 28.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = "Choose an asset and network",
                            fontSize = 17.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 2.dp),
                        )
                    }
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .clip(CircleShape)
                            .clickable { showRailSheet = false },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.Outlined.Close,
                            contentDescription = "Close",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(28.dp),
                        )
                    }
                }
                val groups = AssetNetworkCatalog.groups(chainEnv)
                groups.forEachIndexed { index, (group, pairs) ->
                    if (index > 0) {
                        HorizontalDivider(
                            color = MaterialTheme.colorScheme.outlineVariant,
                            modifier = Modifier.padding(top = 10.dp, bottom = 6.dp),
                        )
                    }
                    RailGroupHeader(
                        title = railGroupTitle(group),
                        network = pairs.first().network.substringBefore('_'),
                        modifier = Modifier.padding(top = if (index == 0) 18.dp else 8.dp, bottom = 12.dp),
                    )
                    pairs.chunked(2).forEach { rowPairs ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = 12.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            rowPairs.forEach { pair ->
                                RailOption(
                                    asset = pair.asset,
                                    networkLabel = pair.shortNetworkLabel,
                                    testnet = pair.chainEnv == "testnet",
                                    selected = pair.asset == asset && pair.network == network,
                                    enabled = !loading && online,
                                    modifier = Modifier.weight(1f),
                                ) {
                                    onPairChange(pair)
                                    showRailSheet = false
                                }
                            }
                            if (rowPairs.size == 1) Spacer(modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }

    if (showNoteSheet) {
        ModalBottomSheet(
            onDismissRequest = { showNoteSheet = false },
            sheetState = noteSheetState,
        ) {
            Column(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp)
                        .padding(bottom = 28.dp),
            ) {
                Text(
                    text = "ORDER NOTE",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = "Add note",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = "Visible on the order detail and printed receipt.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 12.dp),
                )
                OutlinedTextField(
                    value = noteDraft,
                    onValueChange = { if (it.length <= 200) noteDraft = it },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3,
                    label = { Text("Note") },
                )
                Text(
                    text = "${(200 - noteDraft.length).coerceAtLeast(0)} characters remaining",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 6.dp, bottom = 12.dp),
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    OutlinedButton(
                        onClick = { showNoteSheet = false },
                        modifier = Modifier.weight(1f),
                    ) { Text("Cancel") }
                    Button(
                        onClick = {
                            onMerchantReferenceChange(noteDraft.trim())
                            showNoteSheet = false
                        },
                        modifier = Modifier.weight(1f),
                    ) { Text("Save note") }
                }
            }
        }
    }

    val colors = MaterialTheme.colorScheme
    val dark = LocalPosDark.current
    val controlsEnabled = !loading && online

    PosScreenFrame(applySystemBars = false) {
        Column(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            AnimatedVisibility(
                visible = !online,
                enter = fadeIn() + expandVertically(),
                exit = fadeOut() + shrinkVertically(),
            ) {
                ChargeNotice(CashierPosSurface.OFFLINE_CREATE, isError = true)
            }

            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                color = colors.surface.copy(alpha = if (dark) 0.85f else 1f),
                border = BorderStroke(1.dp, colors.outlineVariant),
                shadowElevation = if (dark) 0.dp else 4.dp,
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    CurrencySwitch(
                        selected = chargeIn,
                        asset = asset,
                        enabled = controlsEnabled,
                        onSelect = onChargeInChange,
                        modifier = Modifier
                            .fillMaxWidth(0.86f)
                            .align(Alignment.CenterHorizontally),
                    )

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 18.dp)
                            .graphicsLayer {
                                scaleX = amountPulse
                                scaleY = amountPulse
                            },
                        verticalAlignment = Alignment.Bottom,
                        horizontalArrangement = Arrangement.Center,
                    ) {
                        val amountColor = if (dark) colors.primary else Color(0xFF1E3A8A)
                        val typed = chargeIn.symbol + amount.ifBlank { "0" }
                        val hint = amountDecimalsHint(amount)
                        val amountSize = when {
                            (typed + hint).length <= 8 -> 88
                            (typed + hint).length <= 10 -> 72
                            else -> 60
                        }
                        Text(
                            text = buildAnnotatedString {
                                withStyle(SpanStyle(color = if (amount.isBlank()) amountColor.copy(alpha = 0.35f) else amountColor)) {
                                    append(typed)
                                }
                                withStyle(SpanStyle(color = amountColor.copy(alpha = 0.35f))) { append(hint) }
                            },
                            fontSize = amountSize.sp,
                            lineHeight = (amountSize + 4).sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = (-1.2).sp,
                            maxLines = 1,
                        )
                        if (chargeIn == ChargeCurrency.TOKEN) {
                            Spacer(modifier = Modifier.width(10.dp))
                            AnimatedContent(
                                targetState = asset,
                                transitionSpec = {
                                    (fadeIn(tween(PosMotion.Fast)) + scaleIn(initialScale = 0.7f)) togetherWith
                                        (fadeOut(tween(PosMotion.Fast)) + scaleOut(targetScale = 0.7f))
                                },
                                label = "amount-asset",
                            ) { currentAsset ->
                                Text(
                                    text = currentAsset,
                                    fontSize = 22.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = if (railUnsupported) colors.error else colors.onSurfaceVariant,
                                    modifier = Modifier.padding(bottom = 10.dp),
                                )
                            }
                        }
                    }

                    RailCard(
                        asset = asset,
                        network = network,
                        networkLabel = networkLabel,
                        unsupported = railUnsupported,
                        enabled = controlsEnabled,
                        onClick = { showRailSheet = true },
                        modifier = Modifier.padding(top = 10.dp),
                        trailing = {
                            ValidityPill(
                                label = validityLabel,
                                selectedSeconds = validitySeconds,
                                enabled = controlsEnabled,
                                onSelect = onValidityChange,
                            )
                        },
                    )
                }
            }

            AnimatedVisibility(
                visible = railError != null,
                enter = fadeIn() + expandVertically(),
                exit = fadeOut() + shrinkVertically(),
            ) {
                ChargeNotice(railError.orEmpty(), isError = true)
            }

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                // Catalog hidden until a product list is configured (V3: Catalog unavailable).
                ToolButton(
                    icon = Icons.AutoMirrored.Outlined.Notes,
                    label = if (merchantReference.isBlank()) "Add note" else "Note · $merchantReference",
                    enabled = controlsEnabled,
                    highlighted = merchantReference.isNotBlank(),
                    modifier = Modifier.weight(1f),
                ) {
                    noteDraft = merchantReference
                    showNoteSheet = true
                }
                ToolButton(
                    icon = Icons.Outlined.Clear,
                    label = "Clear",
                    enabled = controlsEnabled && (amount.isNotBlank() || merchantReference.isNotBlank()),
                    modifier = Modifier.weight(1f),
                ) {
                    onAmountChange("")
                    onMerchantReferenceChange("")
                }
            }

            AnimatedVisibility(
                visible = auxBanner != null,
                enter = fadeIn() + expandVertically(),
                exit = fadeOut() + shrinkVertically(),
            ) {
                ChargeNotice(auxBanner.orEmpty(), isError = false)
            }
            AnimatedVisibility(
                visible = validitySeconds > 1800,
                enter = fadeIn() + expandVertically(),
                exit = fadeOut() + shrinkVertically(),
            ) {
                ChargeNotice(REMOTE_ORDER_HINT, isError = false)
            }
            AnimatedVisibility(
                visible = blockingOrder != null,
                enter = fadeIn() + expandVertically(),
                exit = fadeOut() + shrinkVertically(),
            ) {
                ChargeNotice(
                    text = "Same amount already open on ${blockingOrder?.orderNumber}.",
                    isError = true,
                    action =
                        if (onOpenBlockingOrder != null && blockingOrder != null) {
                            "Return to payment" to { onOpenBlockingOrder(blockingOrder) }
                        } else {
                            null
                        },
                )
            }
            AnimatedVisibility(
                visible = !shownError.isNullOrBlank(),
                enter = fadeIn() + expandVertically(),
                exit = fadeOut() + shrinkVertically(),
            ) {
                ChargeNotice(shownError.orEmpty(), isError = true)
            }

            AmountKeypad(
                enabled = controlsEnabled,
                onKey = { key -> onAmountChange(AmountEntry.apply(amount, key)) },
                modifier = Modifier.weight(1f),
            )

            ChargeButton(
                label = "Charge ${chargeLabel(amount, chargeIn, asset)}",
                enabled = canCreate,
                loading = loading,
                modifier = Modifier.fillMaxWidth().height(60.dp),
                onClick = onSubmit,
            )
        }
    }
}

/** Faint trailing decimals so the amount always reads as money, e.g. "12" shows as "12.00". */
private fun amountDecimalsHint(amount: String): String {
    val dot = amount.indexOf('.')
    if (dot < 0) return ".00"
    val decimals = amount.length - dot - 1
    return if (decimals < 2) "0".repeat(2 - decimals) else ""
}

private val RailSelectedAccent = Color(0xFFCA9A1B)

private fun railGroupTitle(group: String): String =
    when (group.uppercase()) {
        "TRON" -> "TRON"
        else -> group.lowercase().replaceFirstChar { it.uppercase() }
    }

@Composable
private fun RailGroupHeader(title: String, network: String, modifier: Modifier = Modifier) {
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        NetworkIcon(network = network, size = 28.dp)
        Spacer(modifier = Modifier.width(12.dp))
        Text(
            text = title,
            fontSize = 17.sp,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** One asset + network choice in the rail sheet grid. */
@Composable
private fun RailOption(
    asset: String,
    networkLabel: String,
    testnet: Boolean,
    selected: Boolean,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val colors = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(14.dp)
    val bg by animateColorAsState(
        if (selected) RailSelectedAccent.copy(alpha = 0.12f) else colors.surface,
        tween(PosMotion.Fast),
        label = "rail-bg",
    )
    val borderColor by animateColorAsState(
        if (selected) RailSelectedAccent else colors.outlineVariant,
        tween(PosMotion.Fast),
        label = "rail-border",
    )
    Row(
        modifier = modifier
            .clip(shape)
            .background(bg)
            .border(1.dp, borderColor, shape)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(start = 14.dp, end = 12.dp, top = 14.dp, bottom = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AssetIcon(asset = asset, size = 56.dp)
        Spacer(modifier = Modifier.width(16.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(asset, fontWeight = FontWeight.Bold, fontSize = 19.sp, color = colors.onSurface)
            Row(
                modifier = Modifier.padding(top = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = networkLabel,
                    fontSize = 15.sp,
                    color = colors.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (testnet) {
                    Spacer(modifier = Modifier.width(10.dp))
                    Text(
                        text = "Testnet",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFFA16207),
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(Color(0xFFFDE9B0))
                            .padding(horizontal = 7.dp, vertical = 2.dp),
                    )
                }
            }
        }
        RailRadio(selected = selected, modifier = Modifier.align(Alignment.Top))
    }
}

@Composable
private fun RailRadio(selected: Boolean, modifier: Modifier = Modifier) {
    val colors = MaterialTheme.colorScheme
    Box(
        modifier = modifier
            .size(24.dp)
            .clip(CircleShape)
            .background(if (selected) RailSelectedAccent else Color.Transparent)
            .border(1.5.dp, if (selected) RailSelectedAccent else colors.outline, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        if (selected) {
            Icon(Icons.Outlined.Check, contentDescription = "Selected", tint = Color.White, modifier = Modifier.size(16.dp))
        }
    }
}

/** Segmented switch between the token amount and a fiat invoice (web `.cashier-pad__pill`). */
@Composable
private fun CurrencySwitch(
    selected: ChargeCurrency,
    asset: String,
    enabled: Boolean,
    onSelect: (ChargeCurrency) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = MaterialTheme.colorScheme
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(50))
            .background(colors.surfaceVariant)
            .border(1.dp, colors.outlineVariant, RoundedCornerShape(50))
            .padding(3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ChargeCurrency.entries.forEachIndexed { index, option ->
            val isOn = option == selected
            if (index > 0) {
                val between = option != selected && ChargeCurrency.entries[index - 1] != selected
                Box(
                    modifier = Modifier
                        .width(1.dp)
                        .height(18.dp)
                        .background(if (between) colors.outlineVariant else Color.Transparent),
                )
            }
            val bg by animateColorAsState(
                if (isOn) colors.primary else Color.Transparent,
                tween(PosMotion.Fast),
                label = "currency-bg",
            )
            Row(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(50))
                    .background(bg)
                    .selectable(selected = isOn, enabled = enabled, role = Role.Tab) { onSelect(option) }
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
            ) {
                if (option == ChargeCurrency.TOKEN) AssetIcon(asset = asset, size = 18.dp)
                Text(
                    text = if (option == ChargeCurrency.TOKEN) asset else "${option.symbol} ${option.name}",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = if (isOn) colors.onPrimary else colors.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun ValidityPill(
    label: String,
    selectedSeconds: Int,
    enabled: Boolean,
    onSelect: (Int) -> Unit,
) {
    val colors = MaterialTheme.colorScheme
    var open by remember { mutableStateOf(false) }
    Box {
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(50))
                .border(1.dp, colors.outlineVariant, RoundedCornerShape(50))
                .clickable(enabled = enabled) { open = true }
                .padding(horizontal = 12.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Icon(Icons.Outlined.Schedule, null, tint = colors.onSurfaceVariant, modifier = Modifier.size(18.dp))
            Text(label, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = colors.onSurface)
            Icon(Icons.Outlined.ExpandMore, null, tint = colors.onSurfaceVariant, modifier = Modifier.size(16.dp))
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            Text(
                text = "VALID FOR",
                fontSize = 11.sp,
                letterSpacing = 1.2.sp,
                color = colors.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
            )
            validityChoices.forEach { choice ->
                DropdownMenuItem(
                    text = { Text(choice.label, fontWeight = FontWeight.Medium) },
                    leadingIcon = {
                        Icon(
                            Icons.Outlined.Check,
                            contentDescription = null,
                            tint = if (choice.seconds == selectedSeconds) colors.primary else Color.Transparent,
                        )
                    },
                    onClick = {
                        onSelect(choice.seconds)
                        open = false
                    },
                )
            }
        }
    }
}

/** One-tap summary of the payment rail (asset, then network); opens the supported-pair sheet. */
@Composable
private fun RailCard(
    asset: String,
    network: String,
    networkLabel: String,
    unsupported: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    trailing: @Composable () -> Unit = {},
) {
    val colors = MaterialTheme.colorScheme
    Column(modifier = modifier.fillMaxWidth()) {
    HorizontalDivider(color = colors.outlineVariant)
    Row(
        modifier = Modifier
            .padding(top = 8.dp)
            .fillMaxWidth()
            .height(IntrinsicSize.Min)
            .clip(RoundedCornerShape(12.dp))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 4.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box {
            AssetIcon(asset = asset, size = 38.dp)
            NetworkIcon(
                network = network,
                size = 18.dp,
                modifier = Modifier.align(Alignment.BottomEnd).offset(x = 4.dp, y = 4.dp),
            )
        }
        Spacer(modifier = Modifier.width(14.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = asset,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = if (unsupported) colors.error else colors.onSurface,
                maxLines = 1,
            )
            Text(
                text = networkLabel,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = if (unsupported) colors.error else colors.primary.copy(alpha = 0.85f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        trailing()
        VerticalDivider(
            modifier = Modifier
                .fillMaxHeight()
                .padding(horizontal = 12.dp, vertical = 2.dp),
            color = colors.outlineVariant,
        )
        Text("Change", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = colors.primary)
        Icon(
            Icons.AutoMirrored.Outlined.KeyboardArrowRight,
            contentDescription = null,
            tint = colors.primary,
            modifier = Modifier.size(22.dp),
        )
    }
    }
}

@Composable
private fun ToolButton(
    icon: ImageVector,
    label: String,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    highlighted: Boolean = false,
    onClick: () -> Unit,
) {
    val colors = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(14.dp)
    Row(
        modifier = modifier
            .height(46.dp)
            .clip(shape)
            .background(if (highlighted) colors.primaryContainer else colors.surface.copy(alpha = 0.7f))
            .border(1.dp, colors.outlineVariant, shape)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        val fg = when {
            !enabled -> colors.outline
            highlighted -> colors.onPrimaryContainer
            else -> colors.onSurface
        }
        Icon(icon, contentDescription = null, tint = fg, modifier = Modifier.size(18.dp))
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = label,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = fg,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun ChargeNotice(
    text: String,
    isError: Boolean,
    action: Pair<String, () -> Unit>? = null,
) {
    val colors = MaterialTheme.colorScheme
    val tint = if (isError) colors.error else colors.primary
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(tint.copy(alpha = 0.10f))
            .border(1.dp, tint.copy(alpha = 0.25f), RoundedCornerShape(12.dp))
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            if (isError) Icons.Outlined.ErrorOutline else Icons.Outlined.Info,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(18.dp),
        )
        Spacer(modifier = Modifier.width(10.dp))
        Text(
            text = text,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            color = if (isError) colors.error else colors.onSurface,
            modifier = Modifier.weight(1f),
        )
        if (action != null) {
            TextButton(onClick = action.second) { Text(action.first, fontWeight = FontWeight.SemiBold) }
        }
    }
}

/** Web `.cashier-pad__charge`: gold gradient in dark, blue in light; flat muted when disabled. */
@Composable
private fun ChargeButton(
    label: String,
    enabled: Boolean,
    loading: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val dark = LocalPosDark.current
    val shape = RoundedCornerShape(16.dp)
    val interaction = remember { MutableInteractionSource() }
    val brush =
        when {
            !enabled && !loading ->
                SolidColor(if (dark) Color(0x1A94B2DC) else Color(0xFFDBE5F4))
            dark -> Brush.verticalGradient(listOf(Color(0xFFF5C451), Color(0xFFE0A126)))
            else -> Brush.verticalGradient(listOf(Color(0xFF3B82F6), Color(0xFF2563EB)))
        }
    val fg =
        when {
            !enabled && !loading -> if (dark) Color(0xFF6F809A) else Color(0xFF8A9AB3)
            dark -> Color(0xFF1A1204)
            else -> Color.White
        }
    Box(
        modifier = modifier
            .posPressScale(interaction)
            .clip(shape)
            .background(brush)
            .clickable(
                enabled = enabled && !loading,
                interactionSource = interaction,
                indication = androidx.compose.material3.ripple(),
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        if (loading) {
            CircularProgressIndicator(color = fg, strokeWidth = 2.5.dp, modifier = Modifier.size(24.dp))
        } else {
            Text(
                text = label,
                fontSize = 19.sp,
                fontWeight = FontWeight.Bold,
                color = fg,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
