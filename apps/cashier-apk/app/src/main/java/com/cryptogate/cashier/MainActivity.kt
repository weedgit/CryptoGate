package com.cryptogate.cashier

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.cryptogate.cashier.api.CashierPosSurface
import com.cryptogate.cashier.api.NetworkReachability
import com.cryptogate.cashier.api.OrderDefaults
import com.cryptogate.cashier.api.OrderStatusUi
import com.cryptogate.cashier.api.PaymentDetails
import com.cryptogate.cashier.api.Session
import com.cryptogate.cashier.ui.CreateOrderScreen
import com.cryptogate.cashier.ui.HomeScreen
import com.cryptogate.cashier.ui.LoginScreen
import com.cryptogate.cashier.ui.OrderPayScreen
import com.cryptogate.cashier.ui.theme.CashierTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
/** Only POS flows — no wallet / xPub / matching settings screens (M2-73). */
private enum class PosScreen { Home, Create, Pay }

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val app = application as CashierApplication

        setContent {
            CashierTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    val scope = rememberCoroutineScope()
                    var signedIn by remember { mutableStateOf(app.api.isSignedIn()) }
                    var session by remember { mutableStateOf<Session?>(null) }
                    var email by remember { mutableStateOf("") }
                    var password by remember { mutableStateOf("") }
                    var error by remember { mutableStateOf<String?>(null) }
                    var loading by remember { mutableStateOf(false) }
                    var screen by remember { mutableStateOf(PosScreen.Home) }
                    var amount by remember { mutableStateOf("") }
                    var validitySeconds by remember { mutableIntStateOf(OrderDefaults.VALIDITY_SECONDS) }
                    var payment by remember { mutableStateOf<PaymentDetails?>(null) }
                    var watchingOrderId by remember { mutableStateOf<String?>(null) }
                    var online by remember { mutableStateOf(NetworkReachability.isOnline(this@MainActivity)) }

                    LaunchedEffect(Unit) {
                        while (true) {
                            online = NetworkReachability.isOnline(this@MainActivity)
                            delay(2_000)
                        }
                    }

                    LaunchedEffect(signedIn) {
                        if (signedIn) {
                            runCatching { session = app.api.getSession() }
                                .onFailure {
                                    signedIn = false
                                    session = null
                                    screen = PosScreen.Home
                                }
                        }
                    }

                    LaunchedEffect(screen, watchingOrderId) {
                        val id = watchingOrderId
                        if (screen != PosScreen.Pay || id == null) return@LaunchedEffect
                        while (true) {
                            delay(4_000)
                            val latest = runCatching { app.api.getPaymentDetails(id) }.getOrNull()
                                ?: continue
                            payment = latest
                            if (OrderStatusUi.isTerminal(latest.status)) break
                        }
                    }

                    if (!signedIn) {
                        LoginScreen(
                            email = email,
                            password = password,
                            error = error,
                            loading = loading,
                            onEmailChange = { email = it; error = null },
                            onPasswordChange = { password = it; error = null },
                            onSignIn = {
                                scope.launch {
                                    loading = true
                                    error = null
                                    try {
                                        if (!NetworkReachability.isOnline(this@MainActivity)) {
                                            error = CashierPosSurface.OFFLINE_CREATE
                                            return@launch
                                        }
                                        val result = app.api.login(email.trim(), password)
                                        session = result.session
                                        password = ""
                                        signedIn = true
                                        screen = PosScreen.Home
                                    } catch (e: Exception) {
                                        error = CashierPosSurface.userMessage(e)
                                        signedIn = false
                                    } finally {
                                        loading = false
                                    }
                                }
                            },
                        )
                    } else when (screen) {
                        PosScreen.Home -> HomeScreen(
                            session = session,
                            emailFallback = app.sessionStore.cachedEmail,
                            online = online,
                            onCreateOrder = {
                                if (!NetworkReachability.isOnline(this@MainActivity)) {
                                    online = false
                                    return@HomeScreen
                                }
                                error = null
                                amount = ""
                                screen = PosScreen.Create
                            },
                            onSignOut = {
                                scope.launch {
                                    app.api.logout()
                                    session = null
                                    payment = null
                                    watchingOrderId = null
                                    signedIn = false
                                    screen = PosScreen.Home
                                }
                            },
                        )
                        PosScreen.Create -> CreateOrderScreen(
                            amount = amount,
                            validitySeconds = validitySeconds,
                            error = error,
                            loading = loading,
                            online = online,
                            onAmountChange = { amount = it; error = null },
                            onValidityChange = { validitySeconds = it },
                            onSubmit = {
                                scope.launch {
                                    if (!NetworkReachability.isOnline(this@MainActivity)) {
                                        online = false
                                        error = CashierPosSurface.OFFLINE_CREATE
                                        return@launch
                                    }
                                    loading = true
                                    error = null
                                    try {
                                        val order = app.api.createOrder(
                                            amount = amount.trim(),
                                            validitySeconds = validitySeconds,
                                        )
                                        payment = app.api.getPaymentDetails(order.id)
                                        watchingOrderId = order.id
                                        screen = PosScreen.Pay
                                    } catch (e: Exception) {
                                        error = CashierPosSurface.userMessage(e)
                                    } finally {
                                        loading = false
                                    }
                                }
                            },
                            onBack = {
                                error = null
                                screen = PosScreen.Home
                            },
                        )
                        PosScreen.Pay -> {
                            val details = payment
                            if (details == null) {
                                screen = PosScreen.Home
                            } else {
                                OrderPayScreen(
                                    details = details,
                                    onDone = {
                                        payment = null
                                        watchingOrderId = null
                                        amount = ""
                                        error = null
                                        screen = PosScreen.Home
                                    },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
