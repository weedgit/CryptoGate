package com.paymentgate.cashier

import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.paymentgate.cashier.api.ApiError
import com.paymentgate.cashier.api.AssetNetworkCatalog
import com.paymentgate.cashier.api.BlockingOrder
import com.paymentgate.cashier.api.CashierPosSurface
import com.paymentgate.cashier.api.JsonParsers
import com.paymentgate.cashier.api.NetworkReachability
import com.paymentgate.cashier.api.OrderDefaults
import com.paymentgate.cashier.api.OrderStatusUi
import com.paymentgate.cashier.api.PaymentDetails
import com.paymentgate.cashier.api.PaymentOrder
import com.paymentgate.cashier.api.Session
import com.paymentgate.cashier.hardware.PrintOutcome
import com.paymentgate.cashier.hardware.PrinterHwStatus
import com.paymentgate.cashier.hardware.toCustomerPayContent
import com.paymentgate.cashier.hardware.toReceiptJob
import com.paymentgate.cashier.ui.CreateOrderScreen
import com.paymentgate.cashier.ui.HardwareDockTab
import com.paymentgate.cashier.ui.KeepScreenOnWhile
import com.paymentgate.cashier.ui.LoginScreen
import com.paymentgate.cashier.ui.OrderDetailScreen
import com.paymentgate.cashier.ui.OrderPayScreen
import com.paymentgate.cashier.ui.OrdersScreen
import com.paymentgate.cashier.ui.PinScreenMode
import com.paymentgate.cashier.ui.PinUnlockScreen
import com.paymentgate.cashier.ui.PosMotion
import com.paymentgate.cashier.ui.PosShell
import com.paymentgate.cashier.ui.SettingsScreen
import com.paymentgate.cashier.ui.SplashScreen
import com.paymentgate.cashier.ui.TodayOrdersScreen
import com.paymentgate.cashier.ui.formatReceiptPrintedAt
import com.paymentgate.cashier.ui.printerStatusLabel
import com.paymentgate.cashier.ui.theme.CashierTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** V3 POS flows — Create is home after PIN unlock (Hardware Dock). */
private enum class PosScreen { Splash, Create, Today, Orders, More, Pay, OrderDetail }

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val app = application as CashierApplication
        val chainEnv = BuildConfig.CHAIN_ENV
        val defaultPair = AssetNetworkCatalog.defaultPair(chainEnv)

        setContent {
            var darkTheme by remember { mutableStateOf(app.posPrefs.darkTheme) }
            CashierTheme(darkTheme = darkTheme) {
                Surface(modifier = Modifier.fillMaxSize()) {
                    val scope = rememberCoroutineScope()
                    var showSplash by remember { mutableStateOf(true) }
                    var signedIn by remember { mutableStateOf(app.api.isSignedIn()) }
                    var pinUnlocked by remember { mutableStateOf(false) }
                    var pinMode by remember {
                        mutableStateOf(
                            if (
                                app.devicePin.dashboardPinConfigured() ||
                                app.devicePin.hasPin()
                            ) {
                                PinScreenMode.Unlock
                            } else {
                                PinScreenMode.Set
                            },
                        )
                    }
                    var pendingPin by remember { mutableStateOf<String?>(null) }
                    var pinError by remember { mutableStateOf<String?>(null) }
                    var lastActivityAt by remember { mutableStateOf(System.currentTimeMillis()) }
                    var idleLockMinutes by remember { mutableIntStateOf(app.posPrefs.idleLockMinutes) }
                    var session by remember { mutableStateOf<Session?>(null) }

                    fun touchActivity() {
                        lastActivityAt = System.currentTimeMillis()
                    }

                    var email by remember { mutableStateOf("") }
                    var password by remember { mutableStateOf("") }
                    var error by remember { mutableStateOf<String?>(null) }
                    var loading by remember { mutableStateOf(false) }
                    var screen by remember { mutableStateOf(PosScreen.Create) }
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

                    fun resetCreateForm() {
                        error = null
                        blockingOrder = null
                        amount = ""
                        merchantReference = ""
                        val pair = AssetNetworkCatalog.defaultPair(chainEnv)
                        asset = pair.asset
                        network = pair.network
                    }

                    fun loadOrders() {
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
                    }

                    fun openOrder(orderId: String, preferDetail: Boolean = false) {
                        scope.launch {
                            todayLoading = true
                            try {
                                val details = app.api.getPaymentDetails(orderId)
                                payment = details
                                watchingOrderId = orderId
                                screen =
                                    if (
                                        preferDetail ||
                                        OrderStatusUi.showsCompleted(details.status) ||
                                        OrderStatusUi.isAnomaly(details.status) ||
                                        details.status == OrderStatusUi.FAILED ||
                                        details.status == OrderStatusUi.EXPIRED
                                    ) {
                                        PosScreen.OrderDetail
                                    } else {
                                        PosScreen.Pay
                                    }
                            } catch (e: Exception) {
                                todayError = CashierPosSurface.userMessage(e)
                            } finally {
                                todayLoading = false
                            }
                        }
                    }

                    fun selectDock(tab: HardwareDockTab) {
                        touchActivity()
                        when (tab) {
                            HardwareDockTab.Create -> {
                                resetCreateForm()
                                screen = PosScreen.Create
                            }
                            HardwareDockTab.Today -> {
                                screen = PosScreen.Today
                                loadOrders()
                            }
                            HardwareDockTab.Orders -> {
                                screen = PosScreen.Orders
                                loadOrders()
                            }
                            HardwareDockTab.More -> screen = PosScreen.More
                        }
                    }

                    val dockTab =
                        when (screen) {
                            PosScreen.Create -> HardwareDockTab.Create
                            PosScreen.Today -> HardwareDockTab.Today
                            PosScreen.Orders -> HardwareDockTab.Orders
                            PosScreen.More -> HardwareDockTab.More
                            else -> HardwareDockTab.Create
                        }

                    LaunchedEffect(Unit) {
                        while (true) {
                            online = NetworkReachability.isOnline(this@MainActivity)
                            delay(2_000)
                        }
                    }

                    // V3 idle lock — Off / 5 / 10 / 15 / 30 min
                    LaunchedEffect(pinUnlocked, idleLockMinutes, lastActivityAt) {
                        if (!pinUnlocked || idleLockMinutes <= 0) return@LaunchedEffect
                        while (true) {
                            delay(15_000)
                            val idleMs = System.currentTimeMillis() - lastActivityAt
                            if (idleMs >= idleLockMinutes * 60_000L) {
                                pinUnlocked = false
                                pinMode = PinScreenMode.Unlock
                                pinError = null
                                break
                            }
                        }
                    }

                    LaunchedEffect(signedIn) {
                        if (signedIn && session == null) {
                            runCatching { session = app.api.getSession() }
                                .onFailure {
                                    error = CashierPosSurface.SESSION_EXPIRED
                                    signedIn = false
                                    session = null
                                    screen = PosScreen.Create
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

                    LaunchedEffect(
                        screen,
                        payment?.orderNumber,
                        payment?.status,
                        payment?.confirmations,
                        payment?.qrPayload,
                        payment?.payableAmount?.amount,
                    ) {
                        if (!app.customerDisplay.isAvailable()) return@LaunchedEffect
                        val details = payment
                        val onPay = screen == PosScreen.Pay
                        if (!onPay || details == null) {
                            withContext(Dispatchers.IO) { app.customerDisplay.showIdle() }
                            return@LaunchedEffect
                        }
                        when (details.status) {
                            OrderStatusUi.PENDING,
                            OrderStatusUi.VERIFYING,
                            OrderStatusUi.CONFIRMED,
                            OrderStatusUi.COMPLETED,
                            OrderStatusUi.ANOMALY,
                            -> {
                                while (true) {
                                    withContext(Dispatchers.IO) {
                                        app.customerDisplay.showPay(details.toCustomerPayContent())
                                    }
                                    delay(8_000)
                                }
                            }
                            else -> withContext(Dispatchers.IO) { app.customerDisplay.showIdle() }
                        }
                    }

                    val keepAwake =
                        signedIn &&
                            screen == PosScreen.Pay &&
                            payment != null &&
                            OrderStatusUi.isOpenPaymentOrder(payment!!.status)
                    KeepScreenOnWhile(enabled = keepAwake)

                    when {
                        showSplash -> {
                            SplashScreen(onFinished = { showSplash = false })
                        }
                        !signedIn -> {
                            LoginScreen(
                                email = email,
                                password = password,
                                error = error,
                                loading = loading,
                                appEnv = BuildConfig.APP_ENV,
                                onEmailChange = { email = it; error = null },
                                onPasswordChange = { password = it; error = null },
                                onSignIn = {
                                    scope.launch {
                                        loading = true
                                        error = null
                                        try {
                                            if (!NetworkReachability.isOnline(this@MainActivity)) {
                                                error = CashierPosSurface.OFFLINE_GENERIC
                                                return@launch
                                            }
                                            val result = app.api.login(email.trim(), password)
                                            session = result.session
                                            password = ""
                                            signedIn = true
                                            pinUnlocked = false
                                            val dashboardPin =
                                                runCatching { app.api.getPosPinStatus() }
                                                    .onSuccess { app.devicePin.setDashboardPinConfigured(it) }
                                                    .getOrElse { app.devicePin.dashboardPinConfigured() }
                                            pinMode =
                                                when {
                                                    dashboardPin || app.devicePin.hasPin() -> PinScreenMode.Unlock
                                                    else -> PinScreenMode.Set
                                                }
                                            pendingPin = null
                                            resetCreateForm()
                                            screen = PosScreen.Create
                                            touchActivity()
                                        } catch (e: Exception) {
                                            error =
                                                CashierPosSurface.userMessage(
                                                    e,
                                                    CashierPosSurface.ErrorContext.General,
                                                )
                                            signedIn = false
                                        } finally {
                                            loading = false
                                        }
                                    }
                                },
                            )
                        }
                        !pinUnlocked -> {
                            PinUnlockScreen(
                                mode = pinMode,
                                error = pinError,
                                onClearError = { pinError = null },
                                onPinComplete = { pin ->
                                    when (pinMode) {
                                        PinScreenMode.Unlock -> {
                                            scope.launch {
                                                try {
                                                    val onlineNow =
                                                        NetworkReachability.isOnline(this@MainActivity)
                                                    val dashboardConfigured =
                                                        if (onlineNow) {
                                                            runCatching { app.api.getPosPinStatus() }
                                                                .onSuccess {
                                                                    app.devicePin.setDashboardPinConfigured(it)
                                                                }
                                                                .getOrElse {
                                                                    app.devicePin.dashboardPinConfigured()
                                                                }
                                                        } else {
                                                            app.devicePin.dashboardPinConfigured()
                                                        }

                                                    if (dashboardConfigured && onlineNow) {
                                                        try {
                                                            app.api.verifyPosPin(pin)
                                                            runCatching { app.devicePin.setPin(pin) }
                                                            app.devicePin.setDashboardPinConfigured(true)
                                                            pinUnlocked = true
                                                            pinError = null
                                                            touchActivity()
                                                        } catch (e: Exception) {
                                                            if (
                                                                CashierPosSurface.isNetworkFailure(e) &&
                                                                app.devicePin.hasPin()
                                                            ) {
                                                                if (app.devicePin.verify(pin)) {
                                                                    pinUnlocked = true
                                                                    pinError = null
                                                                    touchActivity()
                                                                } else {
                                                                    pinError = "Incorrect PIN. Try again."
                                                                }
                                                            } else if (CashierPosSurface.isNetworkFailure(e)) {
                                                                pinError =
                                                                    CashierPosSurface.OFFLINE_PIN_NO_CACHE
                                                            } else {
                                                                pinError =
                                                                    CashierPosSurface.userMessage(
                                                                        e,
                                                                        CashierPosSurface.ErrorContext.PinUnlock,
                                                                    )
                                                            }
                                                        }
                                                    } else if (dashboardConfigured && !onlineNow) {
                                                        if (app.devicePin.hasPin()) {
                                                            if (app.devicePin.verify(pin)) {
                                                                pinUnlocked = true
                                                                pinError = null
                                                                touchActivity()
                                                            } else {
                                                                pinError = "Incorrect PIN. Try again."
                                                            }
                                                        } else {
                                                            pinError =
                                                                CashierPosSurface.OFFLINE_PIN_NO_CACHE
                                                        }
                                                    } else if (app.devicePin.hasPin()) {
                                                        if (app.devicePin.verify(pin)) {
                                                            pinUnlocked = true
                                                            pinError = null
                                                            touchActivity()
                                                        } else {
                                                            pinError = "Incorrect PIN. Try again."
                                                        }
                                                    } else {
                                                        pinError =
                                                            "Set a POS PIN on the web dashboard (Security), then try again."
                                                    }
                                                } catch (e: Exception) {
                                                    pinError =
                                                        CashierPosSurface.userMessage(
                                                            e,
                                                            CashierPosSurface.ErrorContext.PinUnlock,
                                                        )
                                                }
                                            }
                                        }
                                        PinScreenMode.Set -> {
                                            pendingPin = pin
                                            pinMode = PinScreenMode.Confirm
                                            pinError = null
                                        }
                                        PinScreenMode.Confirm -> {
                                            if (pin == pendingPin) {
                                                runCatching { app.devicePin.setPin(pin) }
                                                    .onSuccess {
                                                        pendingPin = null
                                                        pinUnlocked = true
                                                        pinError = null
                                                        touchActivity()
                                                    }
                                                    .onFailure {
                                                        pinError = "Could not save PIN"
                                                        pinMode = PinScreenMode.Set
                                                        pendingPin = null
                                                    }
                                            } else {
                                                pinError = "PINs did not match. Try again."
                                                pinMode = PinScreenMode.Set
                                                pendingPin = null
                                            }
                                        }
                                    }
                                },
                            )
                        }
                        else -> {
                            Crossfade(
                                targetState = screen,
                                modifier = Modifier.fillMaxSize(),
                                animationSpec = tween(PosMotion.Fast),
                                label = "pos-screen",
                            ) { current ->
                                when (current) {
                                    PosScreen.Splash -> Unit
                                    PosScreen.Create, PosScreen.Today, PosScreen.Orders, PosScreen.More -> {
                                        PosShell(
                                            dockTab = dockTab,
                                            onDockSelect = { selectDock(it) },
                                            showDock = true,
                                        ) {
                                            when (current) {
                                                PosScreen.Create ->
                                                    CreateOrderScreen(
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
                                                            openOrder(block.id)
                                                        },
                                                        onAmountChange = {
                                                            amount = it
                                                            error = null
                                                            blockingOrder = null
                                                        },
                                                        onPairChange = {
                                                            asset = it.asset
                                                            network = it.network
                                                            error = null
                                                        },
                                                        onAssetSelect = { nextAsset ->
                                                            asset = nextAsset
                                                            // Keep network so incompatible rails surface V3 error UX.
                                                            if (
                                                                AssetNetworkCatalog.find(
                                                                    nextAsset,
                                                                    network,
                                                                    chainEnv,
                                                                ) != null
                                                            ) {
                                                                error = null
                                                            }
                                                        },
                                                        onMerchantReferenceChange = {
                                                            merchantReference = it
                                                            error = null
                                                        },
                                                        onValidityChange = { validitySeconds = it },
                                                        onSubmit = {
                                                            scope.launch {
                                                                if (!NetworkReachability.isOnline(this@MainActivity)) {
                                                                    online = false
                                                                    error = CashierPosSurface.OFFLINE_CREATE
                                                                    return@launch
                                                                }
                                                                if (
                                                                    !AssetNetworkCatalog.isSupported(
                                                                        asset,
                                                                        network,
                                                                        chainEnv,
                                                                    )
                                                                ) {
                                                                    error =
                                                                        CashierPosSurface.unsupportedRailMessage(
                                                                            asset,
                                                                            AssetNetworkCatalog.networkLabelFor(
                                                                                asset,
                                                                                network,
                                                                                chainEnv,
                                                                            ),
                                                                        )
                                                                    return@launch
                                                                }
                                                                loading = true
                                                                error = null
                                                                blockingOrder = null
                                                                try {
                                                                    val order =
                                                                        app.api.createOrder(
                                                                            amount = amount.trim(),
                                                                            asset = asset,
                                                                            network = network,
                                                                            validitySeconds = validitySeconds,
                                                                            merchantReference =
                                                                                merchantReference.trim()
                                                                                    .ifEmpty { null },
                                                                        )
                                                                    payment = app.api.getPaymentDetails(order.id)
                                                                    watchingOrderId = order.id
                                                                    screen = PosScreen.Pay
                                                                } catch (e: Exception) {
                                                                    if (
                                                                        e is ApiError &&
                                                                        (
                                                                            e.code == "mode_b_amount_in_use" ||
                                                                                e.code == "mode_d_memo_in_use"
                                                                            )
                                                                    ) {
                                                                        blockingOrder =
                                                                            JsonParsers.parseBlockingOrder(e.details)
                                                                        error = null
                                                                    } else {
                                                                        error =
                                                                            CashierPosSurface.userMessage(
                                                                                e,
                                                                                CashierPosSurface.ErrorContext.CreateOrder,
                                                                            )
                                                                    }
                                                                } finally {
                                                                    loading = false
                                                                }
                                                            }
                                                        },
                                                        onBack = {
                                                            // Create is home — back clears form.
                                                            resetCreateForm()
                                                        },
                                                    )
                                                PosScreen.Today ->
                                                    TodayOrdersScreen(
                                                        orders = todayOrders,
                                                        loading = todayLoading,
                                                        error = todayError,
                                                        cashierName = session?.email?.substringBefore("@"),
                                                        onSelect = { openOrder(it.id, preferDetail = true) },
                                                        onSeeAllOrders = { selectDock(HardwareDockTab.Orders) },
                                                    )
                                                PosScreen.Orders ->
                                                    OrdersScreen(
                                                        orders = todayOrders,
                                                        loading = todayLoading,
                                                        error = todayError,
                                                        onSelect = { openOrder(it.id, preferDetail = true) },
                                                    )
                                                PosScreen.More -> {
                                                    var printerLabel by remember {
                                                        mutableStateOf(
                                                            if (app.thermalPrinter.isAvailable()) "Checking…"
                                                            else "Unavailable",
                                                        )
                                                    }
                                                    LaunchedEffect(Unit) {
                                                        printerLabel =
                                                            withContext(Dispatchers.IO) {
                                                                if (!app.thermalPrinter.isAvailable()) {
                                                                    printerStatusLabel(PrinterHwStatus.Unavailable)
                                                                } else {
                                                                    printerStatusLabel(
                                                                        runCatching { app.thermalPrinter.status() }
                                                                            .getOrDefault(PrinterHwStatus.Unknown),
                                                                    )
                                                                }
                                                            }
                                                    }
                                                    SettingsScreen(
                                                        appVersion = BuildConfig.VERSION_NAME,
                                                        appEnv = BuildConfig.APP_ENV,
                                                        apiBaseUrl = BuildConfig.API_BASE_URL,
                                                        deviceId =
                                                            Settings.Secure.getString(
                                                                contentResolver,
                                                                Settings.Secure.ANDROID_ID,
                                                            ) ?: "unknown",
                                                        darkTheme = darkTheme,
                                                        onDarkThemeChange = {
                                                            darkTheme = it
                                                            app.posPrefs.darkTheme = it
                                                        },
                                                        printerAvailable = app.thermalPrinter.isAvailable(),
                                                        printerStatusLabel = printerLabel,
                                                        customerDisplayAvailable = app.customerDisplay.isAvailable(),
                                                        lastReceipt = app.lastReceiptStore.last,
                                                        onReprint = {
                                                            val job =
                                                                app.lastReceiptStore.last
                                                                    ?: return@SettingsScreen PrintOutcome.Failed(
                                                                        PrinterHwStatus.Unavailable,
                                                                        "No receipt to reprint",
                                                                    )
                                                            withContext(Dispatchers.IO) {
                                                                app.thermalPrinter.printReceipt(job)
                                                            }
                                                        },
                                                        onTestPrint = {
                                                            withContext(Dispatchers.IO) {
                                                                app.thermalPrinter.printTestFeed()
                                                            }
                                                        },
                                                        onBack = { selectDock(HardwareDockTab.Create) },
                                                        onLockNow = {
                                                            pinUnlocked = false
                                                            pinMode = PinScreenMode.Unlock
                                                            pinError = null
                                                            screen = PosScreen.Create
                                                        },
                                                        idleLockMinutes = idleLockMinutes,
                                                        onIdleLockMinutesChange = {
                                                            idleLockMinutes = it
                                                            app.posPrefs.idleLockMinutes = it
                                                            touchActivity()
                                                        },
                                                        onSignOut = {
                                                            scope.launch {
                                                                app.api.logout()
                                                                app.devicePin.clear()
                                                                session = null
                                                                payment = null
                                                                watchingOrderId = null
                                                                signedIn = false
                                                                pinUnlocked = false
                                                                pinMode = PinScreenMode.Set
                                                                pendingPin = null
                                                                pinError = null
                                                                email = ""
                                                                password = ""
                                                                error = null
                                                                screen = PosScreen.Create
                                                            }
                                                        },
                                                    )
                                                }
                                                else -> Unit
                                            }
                                        }
                                    }
                                    PosScreen.OrderDetail -> {
                                        val details = payment
                                        if (details == null) {
                                            LaunchedEffect(Unit) { screen = PosScreen.Orders }
                                            Box(
                                                modifier = Modifier.fillMaxSize(),
                                                contentAlignment = Alignment.Center,
                                            ) { CircularProgressIndicator() }
                                        } else {
                                            OrderDetailScreen(
                                                details = details,
                                                cashierName = session?.email?.substringBefore("@"),
                                                merchantReference = merchantReference.trim().ifEmpty { null },
                                                onPrintReceipt = {
                                                    val job =
                                                        details.toReceiptJob(
                                                            merchantReference =
                                                                merchantReference.trim().ifEmpty { null },
                                                            printedAtIso = formatReceiptPrintedAt(),
                                                        )
                                                    val outcome =
                                                        withContext(Dispatchers.IO) {
                                                            app.thermalPrinter.printReceipt(job)
                                                        }
                                                    if (outcome is PrintOutcome.Ok) {
                                                        app.lastReceiptStore.remember(job)
                                                    }
                                                    outcome
                                                },
                                                onResumePayment = {
                                                    screen = PosScreen.Pay
                                                },
                                                onBack = {
                                                    screen = PosScreen.Orders
                                                    loadOrders()
                                                },
                                            )
                                        }
                                    }
                                    PosScreen.Pay -> {
                                        val details = payment
                                        if (details == null) {
                                            LaunchedEffect(Unit) { screen = PosScreen.Create }
                                            Box(
                                                modifier = Modifier.fillMaxSize(),
                                                contentAlignment = Alignment.Center,
                                            ) {
                                                CircularProgressIndicator()
                                            }
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
                                                onPrintReceipt = {
                                                    val job =
                                                        details.toReceiptJob(
                                                            merchantReference =
                                                                merchantReference.trim().ifEmpty { null },
                                                            printedAtIso = formatReceiptPrintedAt(),
                                                        )
                                                    val outcome =
                                                        withContext(Dispatchers.IO) {
                                                            app.thermalPrinter.printReceipt(job)
                                                        }
                                                    if (outcome is PrintOutcome.Ok) {
                                                        app.lastReceiptStore.remember(job)
                                                    }
                                                    outcome
                                                },
                                                onDone = {
                                                    payment = null
                                                    watchingOrderId = null
                                                    resetCreateForm()
                                                    screen = PosScreen.Create
                                                },
                                                onViewReceipt = {
                                                    screen = PosScreen.OrderDetail
                                                },
                                                onRetryPayment = {
                                                    val expired = payment ?: return@OrderPayScreen
                                                    scope.launch {
                                                        loading = true
                                                        error = null
                                                        try {
                                                            amount = expired.payableAmount.amount
                                                            asset = expired.asset
                                                            network = expired.network
                                                            val order =
                                                                app.api.createOrder(
                                                                    amount = expired.payableAmount.amount,
                                                                    asset = expired.asset,
                                                                    network = expired.network,
                                                                    validitySeconds = validitySeconds,
                                                                    merchantReference =
                                                                        merchantReference.trim().ifEmpty { null },
                                                                )
                                                            payment = app.api.getPaymentDetails(order.id)
                                                            watchingOrderId = order.id
                                                            screen = PosScreen.Pay
                                                            touchActivity()
                                                        } catch (e: Exception) {
                                                            error = CashierPosSurface.userMessage(e)
                                                        } finally {
                                                            loading = false
                                                        }
                                                    }
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
        }
    }
}
