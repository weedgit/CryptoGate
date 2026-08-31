package com.cryptogate.cashier.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cryptogate.cashier.api.AssetNetworkCatalog
import com.cryptogate.cashier.api.AssetNetworkPair
import com.cryptogate.cashier.api.BlockingOrder
import com.cryptogate.cashier.api.CashierPosSurface

data class ValidityChoice(val label: String, val seconds: Int)

private val validityChoices = listOf(
    ValidityChoice("5 min", 300),
    ValidityChoice("15 min", 900),
    ValidityChoice("30 min", 1800),
)

@OptIn(ExperimentalLayoutApi::class)
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
    onMerchantReferenceChange: (String) -> Unit,
    onValidityChange: (Int) -> Unit,
    onSubmit: () -> Unit,
    onBack: () -> Unit,
) {
    val assets = AssetNetworkCatalog.assets(chainEnv)
    val networks = AssetNetworkCatalog.pairsForAsset(asset, chainEnv)
    val selected = AssetNetworkCatalog.find(asset, network, chainEnv)

    PosScreenFrame {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.Top,
    ) {
        Text(
            text = "Create order",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary,
        )
        Text(
            text = "Matching mode is the merchant default (not editable on POS). " +
                "Orders only complete after watcher RPC is configured for the selected network.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f),
        )
        if (!online) {
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = CashierPosSurface.OFFLINE_CREATE,
                color = MaterialTheme.colorScheme.error,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
        Spacer(modifier = Modifier.height(16.dp))
        Text("Asset", style = MaterialTheme.typography.labelLarge)
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            assets.forEach { a ->
                FilterChip(
                    selected = asset == a,
                    onClick = {
                        val first = AssetNetworkCatalog.pairsForAsset(a, chainEnv).firstOrNull()
                            ?: return@FilterChip
                        onPairChange(first)
                    },
                    enabled = !loading && online,
                    label = { Text(a) },
                )
            }
        }
        Spacer(modifier = Modifier.height(12.dp))
        Text("Network", style = MaterialTheme.typography.labelLarge)
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            networks.forEach { pair ->
                FilterChip(
                    selected = network == pair.network,
                    onClick = { onPairChange(pair) },
                    enabled = !loading && online,
                    label = { Text(pair.displayNetwork) },
                )
            }
        }
        if (selected != null) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = selected.label,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.65f),
            )
        }
        Spacer(modifier = Modifier.height(16.dp))
        OutlinedTextField(
            value = amount,
            onValueChange = onAmountChange,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Amount") },
            singleLine = true,
            enabled = !loading && online,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            supportingText = { Text("Major units, e.g. 50.00") },
        )
        Spacer(modifier = Modifier.height(12.dp))
        OutlinedTextField(
            value = merchantReference,
            onValueChange = { if (it.length <= 200) onMerchantReferenceChange(it) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Reference (optional)") },
            singleLine = true,
            enabled = !loading && online,
            supportingText = { Text("PO, table, check # — for accountants") },
        )
        Spacer(modifier = Modifier.height(12.dp))
        Text("Validity", style = MaterialTheme.typography.labelLarge)
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            validityChoices.forEach { choice ->
                FilterChip(
                    selected = validitySeconds == choice.seconds,
                    onClick = { onValidityChange(choice.seconds) },
                    enabled = !loading && online,
                    label = { Text(choice.label) },
                )
            }
        }
        if (blockingOrder != null) {
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = "Same amount already open on ${blockingOrder.orderNumber}. " +
                    "Wait for it to complete, cancel it, or choose a different amount.",
                color = MaterialTheme.colorScheme.error,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
            if (onOpenBlockingOrder != null) {
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedButton(
                    onClick = { onOpenBlockingOrder(blockingOrder) },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !loading,
                ) {
                    Text("Open blocking order")
                }
            }
        }
        if (!error.isNullOrBlank()) {
            Spacer(modifier = Modifier.height(12.dp))
            Text(text = error, color = MaterialTheme.colorScheme.error, fontSize = 14.sp)
        }
        Spacer(modifier = Modifier.height(24.dp))
        Button(
            onClick = onSubmit,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
            enabled = !loading && online && amount.isNotBlank() && selected != null && blockingOrder == null,
        ) {
            if (loading) {
                CircularProgressIndicator(
                    modifier = Modifier.height(22.dp),
                    strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.onPrimary,
                )
            } else {
                Text("Create & show QR")
            }
        }
        Spacer(modifier = Modifier.height(8.dp))
        OutlinedButton(
            onClick = onBack,
            modifier = Modifier.fillMaxWidth(),
            enabled = !loading,
        ) {
            Text("Back")
        }
    }
    }
}
