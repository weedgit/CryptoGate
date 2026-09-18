package com.paymentgate.cashier.ui

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

data class ValidityChoice(val label: String, val seconds: Int)

private val validityChoices = listOf(
    ValidityChoice("5 min", 300),
    ValidityChoice("15 min", 900),
    ValidityChoice("30 min", 1800),
)

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun CreateOrderScreen(
    amount: String,
    asset: String,
    network: String,
    chainEnv: String,
    merchantReference: String,
    validitySeconds: Int,
    error: String?,
    loading: Boolean,
    online: Boolean,
    blockingOrder: BlockingOrder? = null,
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
            blockingOrder == null
    val amountPulse = rememberAmountPulse(amount)
    var showRailSheet by remember { mutableStateOf(false) }
    var showNoteSheet by remember { mutableStateOf(false) }
    var showScanDialog by remember { mutableStateOf(false) }
    var scanBuffer by remember { mutableStateOf("") }
    var noteDraft by remember(merchantReference) { mutableStateOf(merchantReference) }
    var auxBanner by remember { mutableStateOf<String?>(null) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val noteSheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    fun applyBarcode(raw: String) {
        val code = raw.trim()
        // Phase 1: no product catalog — numeric barcode → amount; else not found.
        val asAmount = code.toBigDecimalOrNull()
        if (asAmount != null && asAmount > java.math.BigDecimal.ZERO) {
            val normalized =
                asAmount.stripTrailingZeros().toPlainString().let {
                    if (it.contains('.')) it else "$it.00"
                }
            onAmountChange(normalized)
            auxBanner = "Barcode applied · $normalized $asset filled · Review the selected rail"
        } else {
            auxBanner = "Barcode not found · Scan again or enter the amount manually"
        }
        showScanDialog = false
        scanBuffer = ""
    }

    LaunchedEffect(auxBanner) {
        if (auxBanner != null) {
            kotlinx.coroutines.delay(3200)
            auxBanner = null
        }
    }

    if (showScanDialog) {
        AlertDialog(
            onDismissRequest = { showScanDialog = false; scanBuffer = "" },
            title = { Text("Scan barcode") },
            text = {
                Column {
                    Text(
                        "Point the scanner at a barcode, or type a numeric amount code.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = scanBuffer,
                        onValueChange = { value ->
                            // Hardware wedges often end with Enter — treat newline as submit.
                            if (value.contains('\n') || value.contains('\r')) {
                                applyBarcode(value)
                            } else {
                                scanBuffer = value
                            }
                        },
                        label = { Text("Barcode") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = { applyBarcode(scanBuffer) },
                    enabled = scanBuffer.isNotBlank(),
                ) { Text("Apply") }
            },
            dismissButton = {
                TextButton(onClick = { showScanDialog = false; scanBuffer = "" }) {
                    Text("Cancel")
                }
            },
        )
    }

    if (showRailSheet) {
        ModalBottomSheet(
            onDismissRequest = { showRailSheet = false },
            sheetState = sheetState,
        ) {
            Column(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp)
                        .padding(bottom = 28.dp)
                        .verticalScroll(rememberScrollState()),
            ) {
                Text(
                    text = "Choose payment rail",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = "Only supported asset + network pairs are shown.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp, bottom = 16.dp),
                )
                AssetNetworkCatalog.groups(chainEnv).forEach { (group, pairs) ->
                    Text(
                        text = group,
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(top = 8.dp, bottom = 6.dp),
                    )
                    pairs.forEach { pair ->
                        val selectedPair = pair.asset == asset && pair.network == network
                        Surface(
                            modifier =
                                Modifier
                                    .fillMaxWidth()
                                    .padding(bottom = 8.dp)
                                    .clickable(enabled = !loading && online) {
                                        onPairChange(pair)
                                        showRailSheet = false
                                    },
                            shape = RoundedCornerShape(14.dp),
                            color =
                                if (selectedPair) MaterialTheme.colorScheme.primaryContainer
                                else MaterialTheme.colorScheme.surfaceVariant,
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 14.dp, vertical = 14.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                AssetIcon(asset = pair.asset, size = 22.dp)
                                Spacer(modifier = Modifier.width(10.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(pair.asset, fontWeight = FontWeight.SemiBold)
                                    Text(
                                        pair.shortNetworkLabel,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                NetworkIcon(network = pair.network, size = 20.dp)
                            }
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

    PosScreenFrame(applySystemBars = false) {
        Column(modifier = Modifier.fillMaxSize()) {
            PaymentGateBrand()
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "New order",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
            )
            AnimatedVisibility(
                visible = !online,
                enter = fadeIn() + expandVertically(),
                exit = fadeOut() + shrinkVertically(),
            ) {
                Text(
                    text = CashierPosSurface.OFFLINE_CREATE,
                    color = MaterialTheme.colorScheme.error,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Surface(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp, bottom = 8.dp),
                color = MaterialTheme.colorScheme.surface,
                shape = RoundedCornerShape(20.dp),
                tonalElevation = 1.dp,
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Row(
                        verticalAlignment = Alignment.Bottom,
                        horizontalArrangement = Arrangement.Center,
                        modifier =
                            Modifier.graphicsLayer {
                                scaleX = amountPulse
                                scaleY = amountPulse
                            },
                    ) {
                        Text(
                            text = if (amount.isBlank()) "0" else amount,
                            fontSize = 48.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        Spacer(modifier = Modifier.width(10.dp))
                        AnimatedContent(
                            targetState = asset,
                            transitionSpec = {
                                (fadeIn(tween(PosMotion.Fast)) + scaleIn(initialScale = 0.7f)) togetherWith
                                    (fadeOut(tween(PosMotion.Fast)) + scaleOut(targetScale = 0.7f))
                            },
                            label = "amount-asset",
                        ) { currentAsset ->
                            Row(verticalAlignment = Alignment.Bottom) {
                                AssetIcon(
                                    asset = currentAsset,
                                    size = 26.dp,
                                    modifier = Modifier.padding(bottom = 8.dp),
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = currentAsset,
                                    fontSize = 22.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color =
                                        if (railUnsupported) MaterialTheme.colorScheme.error
                                        else MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.padding(bottom = 6.dp),
                                )
                            }
                        }
                    }
                }
            }

            // V3 rail summary — Change opens full supported pair sheet
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                color = MaterialTheme.colorScheme.surfaceVariant,
                border =
                    if (railUnsupported) {
                        BorderStroke(1.5.dp, MaterialTheme.colorScheme.error)
                    } else {
                        null
                    },
            ) {
                Row(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "ASSET",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            asset,
                            fontWeight = FontWeight.SemiBold,
                            color =
                                if (railUnsupported) MaterialTheme.colorScheme.error
                                else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                    Column(modifier = Modifier.weight(1.4f)) {
                        Text(
                            text = "NETWORK",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            text = networkLabel,
                            fontWeight = FontWeight.SemiBold,
                            color =
                                if (railUnsupported) MaterialTheme.colorScheme.error
                                else MaterialTheme.colorScheme.primary,
                        )
                    }
                    TextButton(
                        onClick = { showRailSheet = true },
                        enabled = !loading && online,
                    ) {
                        Text("Change")
                    }
                }
            }
            AnimatedVisibility(
                visible = railError != null,
                enter = fadeIn() + expandVertically(),
                exit = fadeOut() + shrinkVertically(),
            ) {
                Surface(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .padding(top = 8.dp),
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.error.copy(alpha = 0.12f),
                ) {
                    Text(
                        text = railError.orEmpty(),
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedButton(
                    onClick = {
                        scanBuffer = ""
                        showScanDialog = true
                    },
                    enabled = !loading && online,
                    modifier = Modifier.weight(1f),
                ) { Text("Scan barcode") }
                // Catalog hidden until a product list is configured (V3: Catalog unavailable).
                OutlinedButton(
                    onClick = {
                        noteDraft = merchantReference
                        showNoteSheet = true
                    },
                    enabled = !loading && online,
                    modifier = Modifier.weight(1f),
                ) { Text("Add note") }
            }
            AnimatedVisibility(
                visible = auxBanner != null,
                enter = fadeIn() + expandVertically(),
                exit = fadeOut() + shrinkVertically(),
            ) {
                Surface(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .padding(top = 8.dp),
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.primaryContainer,
                ) {
                    Text(
                        text = auxBanner.orEmpty(),
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                }
            }

            Column(
                modifier =
                    Modifier
                        .weight(1f, fill = true)
                        .verticalScroll(rememberScrollState()),
            ) {
                Spacer(modifier = Modifier.height(10.dp))
                Text("Asset", style = MaterialTheme.typography.labelLarge)
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    assets.forEach { a ->
                        FilterChip(
                            selected = asset == a,
                            onClick = { onAssetSelect(a) },
                            enabled = !loading && online,
                            leadingIcon = { AssetIcon(asset = a, size = 18.dp) },
                            label = { Text(a) },
                        )
                    }
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text("Network", style = MaterialTheme.typography.labelLarge)
                AnimatedContent(
                    targetState = asset,
                    transitionSpec = {
                        (fadeIn(tween(PosMotion.Fast)) + slideInVertically { it / 4 }) togetherWith
                            (fadeOut(tween(PosMotion.Fast)) + slideOutVertically { -it / 6 })
                    },
                    label = "network-chips",
                ) { currentAsset ->
                    FlowRow(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        AssetNetworkCatalog.pairsForAsset(currentAsset, chainEnv).forEach { pair ->
                            FilterChip(
                                selected = currentAsset == asset && network == pair.network,
                                onClick = { onPairChange(pair) },
                                enabled = !loading && online,
                                leadingIcon = { NetworkIcon(network = pair.network, size = 18.dp) },
                                label = { Text(pair.displayNetwork) },
                            )
                        }
                    }
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text("Validity", style = MaterialTheme.typography.labelLarge)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    validityChoices.forEach { choice ->
                        FilterChip(
                            selected = validitySeconds == choice.seconds,
                            onClick = { onValidityChange(choice.seconds) },
                            enabled = !loading && online,
                            modifier = Modifier.weight(1f),
                            label = { Text(choice.label) },
                        )
                    }
                }
                Spacer(modifier = Modifier.height(8.dp))
                if (merchantReference.isNotBlank()) {
                    Text(
                        text = "Note · $merchantReference",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                }
                AnimatedVisibility(
                    visible = blockingOrder != null,
                    enter = fadeIn() + expandVertically(),
                    exit = fadeOut() + shrinkVertically(),
                ) {
                    Column {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "Same amount already open on ${blockingOrder?.orderNumber}.",
                            color = MaterialTheme.colorScheme.error,
                            fontWeight = FontWeight.SemiBold,
                        )
                        if (onOpenBlockingOrder != null && blockingOrder != null) {
                            OutlinedButton(
                                onClick = { onOpenBlockingOrder(blockingOrder) },
                                modifier = Modifier.fillMaxWidth(),
                                enabled = !loading,
                            ) {
                                Text("Return to payment")
                            }
                        }
                    }
                }
                AnimatedVisibility(
                    visible = !error.isNullOrBlank(),
                    enter = fadeIn() + expandVertically(),
                    exit = fadeOut() + shrinkVertically(),
                ) {
                    Column {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(text = error.orEmpty(), color = MaterialTheme.colorScheme.error)
                    }
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
            AmountKeypad(
                enabled = !loading && online,
                onKey = { key -> onAmountChange(AmountEntry.apply(amount, key)) },
            )
            Spacer(modifier = Modifier.height(10.dp))
            Button(
                onClick = onSubmit,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                enabled = canCreate,
                shape = RoundedCornerShape(16.dp),
            ) {
                if (loading) {
                    CircularProgressIndicator(
                        modifier = Modifier.height(22.dp).width(22.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                } else {
                    Text("Continue to Pay →", fontSize = 18.sp, fontWeight = FontWeight.Bold)
                }
            }
            OutlinedButton(
                onClick = onBack,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .padding(top = 6.dp)
                        .height(48.dp),
                enabled = !loading,
                shape = RoundedCornerShape(14.dp),
            ) {
                Text("Clear amount")
            }
        }
    }
}
