package com.cryptogate.cashier.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.cryptogate.cashier.api.CashierPosSurface
import com.cryptogate.cashier.api.Session

@Composable
fun HomeScreen(
    session: Session?,
    emailFallback: String?,
    online: Boolean,
    appEnv: String,
    onCreateOrder: () -> Unit,
    onSignOut: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Top,
    ) {
        Text(
            text = "CryptoGate",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary,
        )
        if (appEnv.equals("staging", ignoreCase = true)) {
            Text(
                text = "TEST BUILD — staging API",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.error,
                fontWeight = FontWeight.Bold,
            )
        }
        Text(
            text = session?.email ?: emailFallback ?: "Cashier",
            style = MaterialTheme.typography.bodyLarge,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "POS only: create and watch payment orders. Wallet, xPub, matching mode, and fees are not available here.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f),
        )
        if (!online) {
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = CashierPosSurface.OFFLINE_BANNER,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
                fontWeight = FontWeight.SemiBold,
            )
        }
        Spacer(modifier = Modifier.height(32.dp))
        Button(
            onClick = onCreateOrder,
            enabled = online,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
        ) {
            Text("Create order")
        }
        Spacer(modifier = Modifier.height(12.dp))
        OutlinedButton(
            onClick = onSignOut,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Sign out")
        }
    }
}
