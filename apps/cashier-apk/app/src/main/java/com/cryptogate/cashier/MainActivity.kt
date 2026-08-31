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
import com.cryptogate.cashier.api.ApiError
import com.cryptogate.cashier.api.AssetNetworkCatalog
import com.cryptogate.cashier.api.BlockingOrder
import com.cryptogate.cashier.api.CashierPosSurface
import com.cryptogate.cashier.api.JsonParsers
import com.cryptogate.cashier.api.NetworkReachability
import com.cryptogate.cashier.api.OrderDefaults
import com.cryptogate.cashier.api.OrderStatusUi
import com.cryptogate.cashier.api.PaymentDetails
import com.cryptogate.cashier.api.PaymentOrder
import com.cryptogate.cashier.api.Session
import com.cryptogate.cashier.ui.CreateOrderScreen
import com.cryptogate.cashier.ui.HomeScreen
import com.cryptogate.cashier.ui.LoginScreen
import com.cryptogate.cashier.ui.OrderPayScreen
import com.cryptogate.cashier.ui.TodayOrdersScreen
import com.cryptogate.cashier.ui.theme.CashierTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
/** Only POS flows — no wallet / xPub / matching settings screens (M2-73). */
private enum class PosScreen { Home, Create, Pay, Today }

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val app = application as CashierApplication
        val chainEnv = BuildConfig.CHAIN_ENV
        val defaultPair = AssetNetworkCatalog.defaultPair(chainEnv)

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
                    var asset by remember { mutableStateOf(defaultPair.asset) }
                    var network by remember { mutableStateOf(defaultPair.network) }
                    var merchantReference by remember { mutableStateOf("") }
                    var validitySeconds by remember { mutableIntStateOf(OrderDefaults.VALIDITY_SECONDS) }
                    var payment by remember { mutableStateOf<PaymentDetails?>(null) }
                    var watchingOrderId by remember { mutableStateOf<String?>(null) }
                    var blockingOrder by remember { mutableStateOf<BlockingOrder?>(null) }
                    var todayOrders by remember { mutableStateOf<List<PaymentOrder>>(emptyList()) }
                    var todayLoading by remember { mutableStateOf(false) }
                    var todayError by remember { mutableStateOf<String?>(null) }
                    var cancelling by remember { mutableStateOf(false) }
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
                            appEnv = BuildConfig.APP_ENV,
                            onCreateOrder = {
                                if (!NetworkReachability.isOnline(this@MainActivity)) {
                                    online = false
                                    return@HomeScreen
                                }
                                error = null
                                blockingOrder = null
                                amount = ""
                                merchantReference = ""
                                val pair = AssetNetworkCatalog.defaultPair(chainEnv)
                                asset = pair.asset
                                network = pair.network
                                screen = PosScreen.Create
                            },
                            onTodayOrders = {
                                screen = PosScreen.Today
                                todayLoading = true
                                todayError = null
                                scope.launch {
                                    try {
                                        todayOrders = app.api.listOrders()
                                    } catch (e: Exception) {
                                        todayError = CashierPosSurface.userMessage(e)
                                    } finally {
                                        todayLoading = false
                                    }
                                }
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
                            asset = asset,
                            network = network,
                            chainEnv = chainEnv,
                            merchantReference = merchantReference,
                            validitySeconds = validitySeconds,
                            error = error,
                            loading = loading,
                            online = online,
                            blockingOrder = blockingOrder,
                            onOpenBlockingOrder = { block ->
                                scope.launch {
                                    loading = true
                                    error = null
                                    try {
                                        payment = app.api.getPaymentDetails(block.id)
                                        watchingOrderId = block.id
                                        blockingOrder = null
                                        screen = PosScreen.Pay
                                    } catch (e: Exception) {
                                        error = CashierPosSurface.userMessage(e)
                                    } finally {
                                        loading = false
                                    }
                                }
                            },
                            onAmountChange = { amount = it; error = null; blockingOrder = null },
                            onPairChange = {
                                asset = it.asset
                                network = it.network
                                error = null
                            },
                            onMerchantReferenceChange = { merchantReference = it; error = null },
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
                                    blockingOrder = null
                                    try {
                                        val order = app.api.createOrder(
                                            amount = amount.trim(),
                                            asset = asset,
                                            network = network,
                                            validitySeconds = validitySeconds,
                                            merchantReference = merchantReference.trim()
                                                .ifEmpty { null },
                                        )
                                        payment = app.api.getPaymentDetails(order.id)
                                        watchingOrderId = order.id
                                        screen = PosScreen.Pay
                                    } catch (e: Exception) {
                                        if (
                                            e is ApiError &&
                                            (e.code == "mode_b_amount_in_use" || e.code == "mode_d_memo_in_use")
                                        ) {
                                            blockingOrder = JsonParsers.parseBlockingOrder(e.details)
                                            error = null
                                        } else {
                                            error = CashierPosSurface.userMessage(e)
                                        }
                                    } finally {
                                        loading = false
                                    }
                                }
                            },
                            onBack = {
                                error = null
                                blockingOrder = null
                                screen = PosScreen.Home
                            },
                        )
                        PosScreen.Today -> TodayOrdersScreen(
                            orders = todayOrders,
                            loading = todayLoading,
                            error = todayError,
                            onSelect = { order ->
                                scope.launch {
                                    todayLoading = true
                                    try {
                                        payment = app.api.getPaymentDetails(order.id)
                                        watchingOrderId = order.id
                                        screen = PosScreen.Pay
                                    } catch (e: Exception) {
                                        todayError = CashierPosSurface.userMessage(e)
                                    } finally {
                                        todayLoading = false
                                    }
                                }
                            },
                            onBack = {
                                todayError = null
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
                                    merchantReference = merchantReference.trim().ifEmpty { null },
                                    canCancel = details.status == OrderStatusUi.PENDING,
                                    cancelling = cancelling,
                                    onCancel = {
                                        val id = watchingOrderId ?: return@OrderPayScreen
                                        scope.launch {
                                            cancelling = true
                                            try {
                                                app.api.cancelOrder(id)
                                                payment = app.api.getPaymentDetails(id)
                                            } catch (e: Exception) {
                                                error = CashierPosSurface.userMessage(e)
                                            } finally {
                                                cancelling = false
                                            }
                                        }
                                    },
                                    onDone = {
                                        payment = null
                                        watchingOrderId = null
                                        amount = ""
                                        merchantReference = ""
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
