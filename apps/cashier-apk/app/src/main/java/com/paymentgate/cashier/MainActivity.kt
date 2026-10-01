package com.paymentgate.cashier

import com.paymentgate.cashier.ui.toCustomerView
import com.paymentgate.cashier.ui.CustomerView
import com.paymentgate.cashier.ui.CustomerScreen
import androidx.compose.runtime.SideEffect
import android.view.MotionEvent
import android.view.KeyEvent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import androidx.compose.runtime.DisposableEffect
import androidx.core.content.ContextCompat
import android.os.Build
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.CompositionLocalProvider
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
import com.paymentgate.cashier.api.ChargeCurrency
import com.paymentgate.cashier.api.JsonParsers
import com.paymentgate.cashier.api.NetworkReachability
import com.paymentgate.cashier.api.Operator
import com.paymentgate.cashier.api.OrderDefaults
import com.paymentgate.cashier.api.OrderStatusUi
import com.paymentgate.cashier.api.OrgInfo
import com.paymentgate.cashier.api.PaymentDetails
import com.paymentgate.cashier.api.PaymentGateClient
import com.paymentgate.cashier.api.PaymentOrder
import com.paymentgate.cashier.api.PosTime
import com.paymentgate.cashier.api.Session
import com.paymentgate.cashier.api.SessionRules
import com.paymentgate.cashier.hardware.CustomerPresentation
import com.paymentgate.cashier.hardware.PrintOutcome
import com.paymentgate.cashier.hardware.ReceiptJob
import com.paymentgate.cashier.hardware.PrinterHwStatus
import com.paymentgate.cashier.hardware.toCustomerPayContent
import com.paymentgate.cashier.hardware.toReceiptJob
import com.paymentgate.cashier.qr.QrMode
import com.paymentgate.cashier.ui.CreateOrderScreen
import com.paymentgate.cashier.ui.HardwareDockTab
import com.paymentgate.cashier.ui.KeepScreenOnWhile
import com.paymentgate.cashier.ui.LoginScreen
import com.paymentgate.cashier.ui.DockTopBar
import com.paymentgate.cashier.ui.OperatorBar
import com.paymentgate.cashier.ui.PageTopBar
import com.paymentgate.cashier.ui.todayDateLabel
import com.paymentgate.cashier.ui.LockPosButton
import com.paymentgate.cashier.ui.AlertsButton
import com.paymentgate.cashier.ui.OrderDetailScreen
import com.paymentgate.cashier.ui.OrderPayScreen
import com.paymentgate.cashier.ui.OrdersScreen
import com.paymentgate.cashier.ui.PinUnlockScreen
import com.paymentgate.cashier.ui.PosMotion
import com.paymentgate.cashier.ui.PosShell
import com.paymentgate.cashier.ui.SettingsScreen
import com.paymentgate.cashier.ui.SetupStep
import com.paymentgate.cashier.ui.SplashScreen
import com.paymentgate.cashier.ui.TodayOrdersScreen
import com.paymentgate.cashier.ui.formatReceiptPrintedAt
import com.paymentgate.cashier.ui.printerStatusLabel
import com.paymentgate.cashier.ui.LocalPosOrg
import com.paymentgate.cashier.ui.theme.CashierTheme
import com.paymentgate.cashier.ui.theme.PosBackdrop
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** V3 POS flows — Create is home after PIN unlock (Hardware Dock). */
private enum class PosScreen { Splash, Create, Today, Orders, More, Pay, OrderDetail }

private const val HEARTBEAT_MS = 60_000L

/** API max page; Today totals need every invoice of the day, not just the recent list. */
private const val ORDERS_FETCH_LIMIT = 200

private fun roleLabel(role: String): String =
    when (role) {
        SessionRules.ROLE_OWNER -> "Owner"
        SessionRules.ROLE_ADMINISTRATOR -> "Admin"
        SessionRules.ROLE_CASHIER -> "Cashier"
        else -> role.replaceFirstChar { it.uppercase() }
    }

class MainActivity : ComponentActivity() {
    override fun onStart() {
        super.onStart()
        if ((application as CashierApplication).customerDisplay.isAvailable()) CustomerPresentation.attach(this)
    }

    override fun onStop() {
        CustomerPresentation.detach()
        super.onStop()
    }

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        CustomerScreen.touch()
        return super.dispatchTouchEvent(ev)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        CustomerScreen.touch()
        return super.dispatchKeyEvent(event)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val app = application as CashierApplication
        val chainEnv = BuildConfig.CHAIN_ENV
        val defaultPair = AssetNetworkCatalog.defaultPair(chainEnv)

        setContent {
            var darkTheme by remember { mutableStateOf(app.posPrefs.darkTheme) }
            CashierTheme(darkTheme = darkTheme) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                    contentColor = MaterialTheme.colorScheme.onBackground,
                ) {
                    PosBackdrop()
                    val scope = rememberCoroutineScope()
                    var showSplash by remember { mutableStateOf(true) }
                    var startupDone by remember { mutableStateOf(false) }

                    // Terminal binding (survives restart) and the PIN-unlocked operator (never does).
                    var bound by remember { mutableStateOf(app.api.isBound()) }
                    var terminalOrg by remember { mutableStateOf(app.terminalStore.binding()?.org) }
                    var operator by remember { mutableStateOf<Operator?>(null) }
                    var session by remember { mutableStateOf<Session?>(null) }
                    var openedOrder by remember { mutableStateOf<PaymentOrder?>(null) }
                    var chargeBlocked by remember { mutableStateOf(false) }

                    // Owner/Admin setup.
                    var setupStep by remember { mutableStateOf(SetupStep.Credentials) }
                    var email by remember { mutableStateOf("") }
                    var password by remember { mutableStateOf("") }
                    var mfaCode by remember { mutableStateOf("") }
                    var setupOrg by remember { mutableStateOf<OrgInfo?>(null) }
                    var setupError by remember { mutableStateOf<String?>(null) }
                    var setupLoading by remember { mutableStateOf(false) }

                    // PIN pad.
                    var pinError by remember { mutableStateOf<String?>(null) }
                    var pinBusy by remember { mutableStateOf(false) }
                    var lockedSeconds by remember { mutableIntStateOf(0) }

                    var lastActivityAt by remember { mutableStateOf(System.currentTimeMillis()) }
                    var idleLockMinutes by remember { mutableIntStateOf(app.posPrefs.idleLockMinutes) }

                    fun touchActivity() {
                        lastActivityAt = System.currentTimeMillis()
                    }

                    var error by remember { mutableStateOf<String?>(null) }
                    var loading by remember { mutableStateOf(false) }
                    var screen by remember { mutableStateOf(PosScreen.Create) }
                    var amount by remember { mutableStateOf("") }
                    var asset by remember { mutableStateOf(defaultPair.asset) }
                    var network by remember { mutableStateOf(defaultPair.network) }
                    var merchantReference by remember { mutableStateOf("") }
                    var validitySeconds by remember { mutableIntStateOf(OrderDefaults.VALIDITY_SECONDS) }
                    var chargeIn by remember { mutableStateOf(ChargeCurrency.USD) }
                    var payment by remember { mutableStateOf<PaymentDetails?>(null) }
                    var watchingOrderId by remember { mutableStateOf<String?>(null) }
                    var qrMode by remember(watchingOrderId) { mutableStateOf(QrMode.WithAmount) }
                    var blockingOrder by remember { mutableStateOf<BlockingOrder?>(null) }
                    var todayOrders by remember { mutableStateOf<List<PaymentOrder>>(emptyList()) }
                    var invoiceOrders by remember { mutableStateOf<List<PaymentOrder>>(emptyList()) }
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

                    fun clearOperatorState() {
                        operator = null
                        session = null
                        chargeBlocked = false
                        payment = null
                        watchingOrderId = null
                        todayOrders = emptyList()
                        invoiceOrders = emptyList()
                        todayError = null
                        resetCreateForm()
                        screen = PosScreen.Create
                    }

                    /** Back to the PIN pad; the terminal stays bound. */
                    fun lockPos(message: String? = null) {
                        clearOperatorState()
                        pinError = message
                        scope.launch { app.api.lock() }
                    }

                    fun resetSetup() {
                        setupStep = SetupStep.Credentials
                        password = ""
                        mfaCode = ""
                        setupOrg = null
                        setupLoading = false
                    }

                    /** Binding gone (unbound here, or revoked on the web): back to Owner/Admin setup. */
                    fun wipeToSetup(message: String?) {
                        clearOperatorState()
                        app.sessionStore.clear()
                        app.terminalStore.clear()
                        bound = false
                        terminalOrg = null
                        pinError = null
                        lockedSeconds = 0
                        resetSetup()
                        email = ""
                        setupError = message
                    }

                    /** Revoked terminal or ended PIN session. Returns true when handled. */
                    fun handleAuthFailure(e: Throwable): Boolean {
                        if (e !is ApiError) return false
                        if (e.code == PaymentGateClient.CODE_TERMINAL_REVOKED) {
                            wipeToSetup(CashierPosSurface.TERMINAL_REVOKED)
                            return true
                        }
                        if (e.httpStatus == 401) {
                            lockPos(CashierPosSurface.SESSION_ENDED)
                            return true
                        }
                        return false
                    }

                    fun receiptJobFor(details: PaymentDetails): ReceiptJob {
                        val zone = PosTime.receiptZone(session, details.businessTimezone)
                        return details.toReceiptJob(
                            merchantReference = merchantReference.trim().ifEmpty { null },
                            printedAtIso = formatReceiptPrintedAt(zone),
                            zone = zone,
                            orgName = terminalOrg?.name,
                            cashierName = operator?.displayName,
                            terminalLabel = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID),
                            logoDataUrl = terminalOrg?.iconKey,
                        )
                    }

                    fun loadOrders() {
                        todayLoading = true
                        todayError = null
                        scope.launch {
                            try {
                                val zone = PosTime.staffZone(session)
                                val midnight = java.time.LocalDate.now(zone).atStartOfDay(zone).toInstant()
                                val dayAgo = java.time.Instant.now().minus(java.time.Duration.ofHours(24))
                                coroutineScope {
                                    val mine = async {
                                        app.api.listOrders(
                                            limit = ORDERS_FETCH_LIMIT,
                                            createdBy = session?.userId,
                                            createdFrom = midnight,
                                        )
                                    }
                                    val recent = async {
                                        app.api.listOrders(limit = ORDERS_FETCH_LIMIT, createdFrom = dayAgo)
                                    }
                                    todayOrders = mine.await()
                                    invoiceOrders = recent.await()
                                }
                            } catch (e: Exception) {
                                if (!handleAuthFailure(e)) todayError = CashierPosSurface.userMessage(e)
                            } finally {
                                todayLoading = false
                            }
                        }
                    }

                    fun openOrder(orderId: String, preferDetail: Boolean = false) {
                        openedOrder = (todayOrders + invoiceOrders).firstOrNull { it.id == orderId }
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

                    fun showBindConfirmation(signedIn: Session) {
                        val membership = SessionRules.bindMembership(signedIn)
                        if (membership == null) {
                            setupError = CashierPosSurface.NOT_POS_MANAGER
                            scope.launch { app.api.cancelSetup() }
                            resetSetup()
                            return
                        }
                        setupStep = SetupStep.Confirm
                        setupOrg = null
                        scope.launch {
                            try {
                                setupOrg = app.api.getOrg(membership.orgId)
                            } catch (e: Exception) {
                                setupError =
                                    CashierPosSurface.userMessage(e, CashierPosSurface.ErrorContext.Setup)
                            }
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

                    // Cold start: a PIN session never survives a restart, and a half-finished setup is dropped.
                    LaunchedEffect(Unit) {
                        if (app.api.isBound()) app.api.lock() else app.api.cancelSetup()
                        startupDone = true
                    }

                    LaunchedEffect(Unit) {
                        var misses = 0
                        while (true) {
                            if (!NetworkReachability.isOnline(this@MainActivity)) {
                                misses = 0
                                online = false
                            } else if (app.api.isServerReachable()) {
                                misses = 0
                                online = true
                            } else if (++misses >= 2) {
                                online = false
                            }
                            delay(if (online) 3_000 else 2_000)
                        }
                    }

                    // Heartbeat: refresh org name and notice a revoke from the web while locked or in use.
                    LaunchedEffect(bound, startupDone) {
                        if (!bound || !startupDone) return@LaunchedEffect
                        var iconFetched = false
                        while (true) {
                            try {
                                terminalOrg = app.api.getTerminal(includeIcon = !iconFetched).org
                                iconFetched = true
                            } catch (e: Exception) {
                                if (e is ApiError && e.code == PaymentGateClient.CODE_TERMINAL_REVOKED) {
                                    wipeToSetup(CashierPosSurface.TERMINAL_REVOKED)
                                    break
                                }
                            }
                            delay(HEARTBEAT_MS)
                        }
                    }

                    // V3 idle lock — Off / 5 / 10 / 15 / 30 min; never while a payment is open on Pay.
                    LaunchedEffect(operator, idleLockMinutes, lastActivityAt) {
                        if (operator == null || idleLockMinutes <= 0) return@LaunchedEffect
                        while (true) {
                            delay(15_000)
                            val paying =
                                screen == PosScreen.Pay &&
                                    payment?.let { OrderStatusUi.isOpenPaymentOrder(it.status) } == true
                            if (paying) continue
                            val idleMs = System.currentTimeMillis() - lastActivityAt
                            if (idleMs >= idleLockMinutes * 60_000L) {
                                lockPos()
                                break
                            }
                        }
                    }

                    LaunchedEffect(operator) {
                        if (operator != null) loadOrders()
                    }

                    // Power button (screen off) locks the POS so the next person needs their PIN.
                    DisposableEffect(Unit) {
                        val receiver = object : BroadcastReceiver() {
                            override fun onReceive(context: Context, intent: Intent) {
                                if (operator != null) lockPos()
                            }
                        }
                        ContextCompat.registerReceiver(
                            this@MainActivity,
                            receiver,
                            IntentFilter(Intent.ACTION_SCREEN_OFF),
                            ContextCompat.RECEIVER_NOT_EXPORTED,
                        )
                        onDispose { unregisterReceiver(receiver) }
                    }

                    val customerView =
                        when {
                            operator == null -> CustomerView.Ready
                            screen == PosScreen.Create -> CustomerView.Charge(amount, chargeIn, asset, network)
                            screen == PosScreen.Pay || screen == PosScreen.OrderDetail ->
                                payment?.toCustomerView(if (screen == PosScreen.Pay) qrMode else QrMode.WithAmount)
                                    ?: CustomerView.Ready
                            else -> CustomerView.Ready
                        }
                    SideEffect {
                        CustomerScreen.requested = customerView
                        CustomerScreen.orgName = terminalOrg?.name
                        CustomerScreen.orgIconKey = terminalOrg?.iconKey
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
                        qrMode,
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
                                        app.customerDisplay.showPay(details.toCustomerPayContent(qrMode))
                                    }
                                    delay(8_000)
                                }
                            }
                            else -> withContext(Dispatchers.IO) { app.customerDisplay.showIdle() }
                        }
                    }

                    val keepAwake =
                        operator != null &&
                            screen == PosScreen.Pay &&
                            payment != null &&
                            OrderStatusUi.isOpenPaymentOrder(payment!!.status)
                    KeepScreenOnWhile(enabled = keepAwake)

                    val orgName = terminalOrg?.name?.ifBlank { null } ?: "This POS"
                    val orgTypeLabel = SessionRules.orgTypeLabel(terminalOrg?.type)

                    CompositionLocalProvider(LocalPosOrg provides terminalOrg.takeIf { bound }) {
                        when {
                            showSplash || !startupDone -> {
                                SplashScreen(darkTheme = darkTheme, onFinished = { showSplash = false })
                            }
                            !bound -> {
                                LoginScreen(
                                    step = setupStep,
                                    email = email,
                                    password = password,
                                    mfaCode = mfaCode,
                                    orgName = setupOrg?.name,
                                    orgTypeLabel = setupOrg?.let { SessionRules.orgTypeLabel(it.type) },
                                    orgIconKey = setupOrg?.iconKey,
                                    error = setupError,
                                    loading = setupLoading,
                                    darkTheme = darkTheme,
                                    onToggleTheme = {
                                        darkTheme = !darkTheme
                                        app.posPrefs.darkTheme = darkTheme
                                    },
                                    onEmailChange = { email = it; setupError = null },
                                    onPasswordChange = { password = it; setupError = null },
                                    onMfaCodeChange = { mfaCode = it; setupError = null },
                                    onSignIn = {
                                        scope.launch {
                                            if (!NetworkReachability.isOnline(this@MainActivity)) {
                                                setupError = CashierPosSurface.OFFLINE_GENERIC
                                                return@launch
                                            }
                                            setupLoading = true
                                            setupError = null
                                            try {
                                                val result = app.api.login(email.trim(), password)
                                                password = ""
                                                if (result.mfaRequired) {
                                                    mfaCode = ""
                                                    setupStep = SetupStep.Mfa
                                                } else {
                                                    showBindConfirmation(result.session)
                                                }
                                            } catch (e: Exception) {
                                                setupError =
                                                    CashierPosSurface.userMessage(e, CashierPosSurface.ErrorContext.Setup)
                                            } finally {
                                                setupLoading = false
                                            }
                                        }
                                    },
                                    onVerifyMfa = {
                                        scope.launch {
                                            setupLoading = true
                                            setupError = null
                                            try {
                                                showBindConfirmation(app.api.verifyMfa(mfaCode.trim()))
                                            } catch (e: Exception) {
                                                mfaCode = ""
                                                setupError =
                                                    CashierPosSurface.userMessage(e, CashierPosSurface.ErrorContext.Setup)
                                                if (e is ApiError && e.httpStatus == 401 && e.code != "invalid_mfa") {
                                                    resetSetup()
                                                }
                                            } finally {
                                                setupLoading = false
                                            }
                                        }
                                    },
                                    onConfirmBind = {
                                        scope.launch {
                                            setupLoading = true
                                            setupError = null
                                            try {
                                                val binding =
                                                    app.api.bindTerminal(
                                                        deviceModel = "${Build.MANUFACTURER} ${Build.MODEL}".trim(),
                                                        appVersion = BuildConfig.VERSION_NAME,
                                                        orgIconKey = setupOrg?.iconKey,
                                                    )
                                                terminalOrg = binding.org
                                                resetSetup()
                                                email = ""
                                                pinError = null
                                                lockedSeconds = 0
                                                bound = true
                                            } catch (e: Exception) {
                                                setupError =
                                                    CashierPosSurface.userMessage(e, CashierPosSurface.ErrorContext.Setup)
                                                if (e is ApiError && e.httpStatus == 401) resetSetup()
                                            } finally {
                                                setupLoading = false
                                            }
                                        }
                                    },
                                    onCancel = {
                                        scope.launch { app.api.cancelSetup() }
                                        resetSetup()
                                        setupError = null
                                    },
                                )
                            }
                            operator == null -> {
                                PinUnlockScreen(
                                    orgName = orgName,
                                    orgTypeLabel = orgTypeLabel,
                                    error = pinError,
                                    busy = pinBusy,
                                    lockedSeconds = lockedSeconds,
                                    darkTheme = darkTheme,
                                    onToggleTheme = {
                                        darkTheme = !darkTheme
                                        app.posPrefs.darkTheme = darkTheme
                                    },
                                    onClearError = {
                                        pinError = null
                                        lockedSeconds = 0
                                    },
                                    onPinSubmit = { pin ->
                                        scope.launch {
                                            if (!NetworkReachability.isOnline(this@MainActivity)) {
                                                pinError = CashierPosSurface.OFFLINE_PIN_UNLOCK
                                                return@launch
                                            }
                                            pinBusy = true
                                            pinError = null
                                            try {
                                                val result = app.api.unlock(pin)
                                                terminalOrg = result.org
                                                session = result.session
                                                chargeBlocked = !result.liveActionsUnlocked
                                                resetCreateForm()
                                                screen = PosScreen.Create
                                                lockedSeconds = 0
                                                touchActivity()
                                                operator = result.operator
                                            } catch (e: Exception) {
                                                when {
                                                    e is ApiError &&
                                                        e.code == PaymentGateClient.CODE_TERMINAL_REVOKED ->
                                                        wipeToSetup(CashierPosSurface.TERMINAL_REVOKED)
                                                    e is ApiError &&
                                                        e.code == PaymentGateClient.CODE_UNLOCK_LOCKED ->
                                                        lockedSeconds = JsonParsers.retryAfterSeconds(e) ?: 30
                                                    else ->
                                                        pinError =
                                                            CashierPosSurface.userMessage(
                                                                e,
                                                                CashierPosSurface.ErrorContext.PinUnlock,
                                                            )
                                                }
                                            } finally {
                                                pinBusy = false
                                            }
                                        }
                                    },
                                )
                            }
                            else -> {
                                val op = operator!!
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
                                                showDock = false,
                                                topBar = {
                                                    if (current == PosScreen.Create) {
                                                        DockTopBar(
                                                            active = dockTab,
                                                            onSelect = { selectDock(it) },
                                                            online = online,
                                                            alerts = todayOrders,
                                                            zone = PosTime.staffZone(session),
                                                            onAlertsOpened = { loadOrders() },
                                                            onOpenAlert = { openOrder(it.id, preferDetail = true) },
                                                        )
                                                    } else if (current == PosScreen.More) {
                                                        PageTopBar(
                                                            title = "Settings",
                                                            onBack = { selectDock(HardwareDockTab.Create) },
                                                        ) { LockPosButton(onLock = { lockPos() }) }
                                                    } else if (current == PosScreen.Today) {
                                                        PageTopBar(
                                                            title = "Today",
                                                            subtitle = todayDateLabel(PosTime.staffZone(session)),
                                                            onBack = { selectDock(HardwareDockTab.Create) },
                                                        ) {
                                                            AlertsButton(
                                                                alerts = todayOrders,
                                                                zone = PosTime.staffZone(session),
                                                                onOpened = { loadOrders() },
                                                                onOpenAlert = { openOrder(it.id, preferDetail = true) },
                                                            )
                                                        }
                                                    } else if (current == PosScreen.Orders) {
                                                        PageTopBar(
                                                            title = "Invoices",
                                                            onBack = { selectDock(HardwareDockTab.Create) },
                                                        ) {
                                                            AlertsButton(
                                                                alerts = todayOrders,
                                                                zone = PosTime.staffZone(session),
                                                                onOpened = { loadOrders() },
                                                                onOpenAlert = { openOrder(it.id, preferDetail = true) },
                                                                boxed = true,
                                                            )
                                                        }
                                                    } else {
                                                        OperatorBar(
                                                            operatorName = op.displayName,
                                                            roleLabel = "$orgTypeLabel-${roleLabel(op.role).lowercase()}",
                                                            avatarUrl = session?.avatarUrl,
                                                            onBack = { selectDock(HardwareDockTab.Create) },
                                                            onLock = { lockPos() },
                                                        )
                                                    }
                                                },
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
                                                            chargeIn = chargeIn,
                                                            onChargeInChange = {
                                                                chargeIn = it
                                                                error = null
                                                                blockingOrder = null
                                                            },
                                                            error = error,
                                                            loading = loading,
                                                            online = online,
                                                            blockingOrder = blockingOrder,
                                                            chargeBlockedNotice =
                                                                if (chargeBlocked) CashierPosSurface.CHARGE_BLOCKED else null,
                                                            onOpenBlockingOrder = { block ->
                                                                openOrder(block.id)
                                                            },
                                                            onAmountChange = {
                                                                amount = it
                                                                error = null
                                                                blockingOrder = null
                                                                touchActivity()
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
                                                                touchActivity()
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
                                                                                chargeIn = chargeIn,
                                                                            )
                                                                        payment = app.api.getPaymentDetails(order.id)
                                                                        watchingOrderId = order.id
                                                                        screen = PosScreen.Pay
                                                                    } catch (e: Exception) {
                                                                        if (handleAuthFailure(e)) {
                                                                            // Back on the PIN pad or setup.
                                                                        } else if (
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
                                                            cashierName = op.displayName,
                                                            zone = PosTime.staffZone(session),
                                                            onSelect = { openOrder(it.id, preferDetail = true) },
                                                            onSeeAllOrders = { selectDock(HardwareDockTab.Orders) },
                                                        )
                                                    PosScreen.Orders ->
                                                        OrdersScreen(
                                                            orders = invoiceOrders,
                                                            loading = todayLoading,
                                                            error = todayError,
                                                            onSelect = { openOrder(it.id, preferDetail = true) },
                                                            zone = PosTime.staffZone(session),
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
                                                            orgName = orgName,
                                                            orgTypeLabel = orgTypeLabel,
                                                            orgIconKey = terminalOrg?.iconKey,
                                                            operatorName = op.displayName,
                                                            operatorRoleLabel = "$orgTypeLabel ${roleLabel(op.role).lowercase()}",
                                                            operatorAvatarUrl = session?.avatarUrl,
                                                            canUnbind = op.isManager,
                                                            onUnbind = {
                                                                try {
                                                                    app.api.unbind()
                                                                    wipeToSetup(null)
                                                                    null
                                                                } catch (e: Exception) {
                                                                    if (handleAuthFailure(e)) {
                                                                        null
                                                                    } else {
                                                                        CashierPosSurface.userMessage(e)
                                                                    }
                                                                }
                                                            },
                                                            idleLockMinutes = idleLockMinutes,
                                                            onIdleLockMinutesChange = {
                                                                idleLockMinutes = it
                                                                app.posPrefs.idleLockMinutes = it
                                                                touchActivity()
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
                                                    order = openedOrder?.takeIf { it.orderNumber == details.orderNumber },
                                                    zone = PosTime.staffZone(session),
                                                    merchantReference = merchantReference.trim().ifEmpty { null },
                                                    onPrintReceipt = {
                                                        val job = receiptJobFor(details)
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
                                                    qrMode = qrMode,
                                                    onQrModeChange = { qrMode = it },
                                                    topBarTrailing = {
                                                        AlertsButton(
                                                            alerts = todayOrders,
                                                            zone = PosTime.staffZone(session),
                                                            onOpened = { loadOrders() },
                                                            onOpenAlert = { openOrder(it.id, preferDetail = true) },
                                                        )
                                                    },
                                                    onCancel = {
                                                        val id = watchingOrderId ?: return@OrderPayScreen
                                                        scope.launch {
                                                            cancelling = true
                                                            try {
                                                                app.api.cancelOrder(id)
                                                                payment = app.api.getPaymentDetails(id)
                                                            } catch (e: Exception) {
                                                                if (!handleAuthFailure(e)) {
                                                                    error = CashierPosSurface.userMessage(e)
                                                                }
                                                            } finally {
                                                                cancelling = false
                                                            }
                                                        }
                                                    },
                                                    onPrintReceipt = {
                                                        val job = receiptJobFor(details)
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
                                                        touchActivity()
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
                                                                        chargeIn = ChargeCurrency.TOKEN,
                                                                    )
                                                                payment = app.api.getPaymentDetails(order.id)
                                                                watchingOrderId = order.id
                                                                screen = PosScreen.Pay
                                                                touchActivity()
                                                            } catch (e: Exception) {
                                                                if (!handleAuthFailure(e)) {
                                                                    error = CashierPosSurface.userMessage(e)
                                                                }
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
}
