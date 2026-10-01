package com.paymentgate.cashier.api

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/**
 * Thin HTTP client for the POS.
 *
 * Setup: an Owner/Administrator signs in (`/auth/login`, optional `/auth/mfa/verify`),
 * then `POST /pos/terminals` swaps that login for a terminal token.
 * Daily use: `POST /pos/unlock` with a PIN returns a short PIN session cookie; every
 * call carries both `Authorization: Terminal <token>` and that cookie.
 * Tokens and cookies are stored encrypted and never logged.
 */
class PaymentGateClient(
    baseUrl: String,
    private val sessionStore: SessionStore,
    private val terminalStore: TerminalStore,
    private val http: OkHttpClient = defaultClient(),
) {
    private val config = ApiConfig(baseUrl)
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    private val probeHttp: OkHttpClient =
        http.newBuilder()
            .connectTimeout(4, TimeUnit.SECONDS)
            .readTimeout(4, TimeUnit.SECONDS)
            .callTimeout(5, TimeUnit.SECONDS)
            .build()

    /**
     * True when the PaymentGate server answers at all (any HTTP status). A VPN or Wi-Fi without
     * upstream internet still reports INTERNET capability, so the OS check alone is not enough.
     */
    suspend fun isServerReachable(): Boolean =
        withContext(Dispatchers.IO) {
            val req = Request.Builder().url(config.url("/")).head().build()
            runCatching { probeHttp.newCall(req).execute().use { true } }.getOrDefault(false)
        }

    fun isBound(): Boolean = terminalStore.isBound()

    fun hasSession(): Boolean = !sessionStore.sessionToken.isNullOrBlank()

    // --- Terminal setup (Owner / Administrator) ---------------------------------

    /** Owner/Administrator sign-in on an unbound POS. Anyone else is signed out again. */
    suspend fun login(email: String, password: String): LoginResult =
        withContext(Dispatchers.IO) {
            sessionStore.clear()
            val req = Request.Builder()
                .url(config.url("/auth/login"))
                .post(JsonParsers.loginRequestJson(email, password, null).toRequestBody(jsonMedia))
                .header("Accept", "application/json")
                .build()
            val result = http.newCall(req).execute().use { res ->
                val body = res.body?.string().orEmpty()
                if (!res.isSuccessful) throw JsonParsers.parseError(body, res.code)
                captureSessionCookie(res)
                JsonParsers.parseLoginResponse(body)
            }
            if (sessionStore.sessionToken.isNullOrBlank()) {
                throw ApiError(
                    code = "session_cookie_missing",
                    message = "Could not save sign-in on this device. Try again.",
                    httpStatus = 500,
                )
            }
            if (!SessionRules.canBindPos(result.session)) {
                logoutQuietly()
                throw ApiError(
                    code = "not_pos_manager",
                    message = CashierPosSurface.NOT_POS_MANAGER,
                    httpStatus = 403,
                )
            }
            result
        }

    /** Login step-up for accounts with an authenticator. */
    suspend fun verifyMfa(code: String): Session =
        withContext(Dispatchers.IO) {
            val payload = JSONObject().put("code", code.trim()).toString()
            val req = authed("/auth/mfa/verify")
                .post(payload.toRequestBody(jsonMedia))
                .build()
            execute(req) { JsonParsers.parseSession(JSONObject(it)) }
        }

    /** Name of the org the POS will charge for (setup confirmation). */
    suspend fun getOrg(orgId: String): OrgInfo =
        withContext(Dispatchers.IO) {
            val req = authed("/orgs/${orgId.trim()}").get().build()
            execute(req) { JsonParsers.parseOrg(JSONObject(it)) }
        }

    /** Binds this POS to the signed-in Owner/Administrator's org; the login session ends. */
    suspend fun bindTerminal(
        deviceModel: String,
        appVersion: String,
        orgIconKey: String? = null,
    ): TerminalBinding =
        withContext(Dispatchers.IO) {
            val req = authed("/pos/terminals")
                .post(JsonParsers.bindRequestJson(deviceModel, appVersion).toRequestBody(jsonMedia))
                .build()
            val bound = execute(req) { JsonParsers.parseBindResponse(it) }
            val binding =
                if (bound.org.iconSent) bound else bound.copy(org = bound.org.copy(iconKey = orgIconKey))
            sessionStore.clear()
            terminalStore.save(binding)
            binding
        }

    /** Leave setup without binding (Cancel on the confirmation screen). */
    suspend fun cancelSetup() = withContext(Dispatchers.IO) { logoutQuietly() }

    // --- Bound terminal -------------------------------------------------------

    /** Heartbeat + org refresh. `401 terminal_revoked` wipes the binding. */
    suspend fun getTerminal(includeIcon: Boolean = false): TerminalStatus =
        withContext(Dispatchers.IO) {
            val path = if (includeIcon) "/pos/terminal?include=icon" else "/pos/terminal"
            val req = authed(path, withSession = false).get().build()
            val status = execute(req) { JsonParsers.parseTerminalStatus(it) }
            status.copy(org = terminalStore.updateOrg(status.org, status.businessTimezone))
        }

    /** PIN only — the server finds the person inside the terminal's org. */
    suspend fun unlock(pin: String): UnlockResult =
        withContext(Dispatchers.IO) {
            sessionStore.clear()
            val payload = JSONObject().put("pin", pin).toString()
            val req = authed("/pos/unlock", withSession = false)
                .post(payload.toRequestBody(jsonMedia))
                .build()
            http.newCall(req).execute().use { res ->
                val body = res.body?.string().orEmpty()
                if (!res.isSuccessful) throw failure(body, res.code)
                captureSessionCookie(res)
                val result = JsonParsers.parseUnlockResponse(body)
                result.copy(org = terminalStore.updateOrg(result.org, result.businessTimezone))
            }
        }

    /** Ends the PIN session; the terminal stays bound. Never throws. */
    suspend fun lock() =
        withContext(Dispatchers.IO) {
            if (hasSession() && isBound()) {
                val req = authed("/pos/lock").post(ByteArray(0).toRequestBody(null)).build()
                runCatching { http.newCall(req).execute().close() }
            }
            sessionStore.clear()
        }

    /** Owner/Administrator (PIN session) removes this POS binding. */
    suspend fun unbind() =
        withContext(Dispatchers.IO) {
            val req = authed("/pos/unbind").post(ByteArray(0).toRequestBody(null)).build()
            execute(req) { }
            sessionStore.clear()
            terminalStore.clear()
        }

    // --- Orders (PIN session) ---------------------------------------------------

    /**
     * POST /v1/orders — matching mode comes from merchant default, never the POS.
     */
    suspend fun createOrder(
        amount: String,
        asset: String = OrderDefaults.ASSET,
        network: String = OrderDefaults.NETWORK,
        validitySeconds: Int = OrderDefaults.VALIDITY_SECONDS,
        merchantReference: String? = null,
        chargeIn: ChargeCurrency = ChargeCurrency.USD,
        idempotencyKey: String = newIdempotencyKey(),
    ): PaymentOrder =
        withContext(Dispatchers.IO) {
            val req = authed("/orders")
                .post(
                    JsonParsers.createOrderRequestJson(
                        amount,
                        asset,
                        network,
                        validitySeconds,
                        merchantReference,
                        chargeIn,
                    ).toRequestBody(jsonMedia),
                )
                .header("Idempotency-Key", idempotencyKey)
                .build()
            execute(req) { JsonParsers.parsePaymentOrder(it) }.also(::rememberPolicy)
        }

    /**
     * Public GET /v1/orders/{id}/payment — same payload as the guest pay page. The fulfillment
     * policy is attached from the last authenticated create / list response for this order.
     */
    suspend fun getPaymentDetails(orderId: String): PaymentDetails =
        withContext(Dispatchers.IO) {
            val req = Request.Builder()
                .url(config.url("/orders/${orderId.trim()}/payment"))
                .get()
                .header("Accept", "application/json")
                .build()
            http.newCall(req).execute().use { res ->
                val body = res.body?.string().orEmpty()
                if (!res.isSuccessful) throw JsonParsers.parseError(body, res.code)
                val details = JsonParsers.parsePaymentDetails(body)
                policyByOrderId[orderId.trim()]?.let { details.copy(fulfillmentPolicy = it) } ?: details
            }
        }

    /**
     * GET /v1/orders — newest first. Cashier scope returns own orders only; [createdBy] narrows an
     * Owner/Admin to one user, [createdFrom] bounds the period.
     */
    suspend fun listOrders(
        limit: Int = 40,
        createdBy: String? = null,
        createdFrom: java.time.Instant? = null,
    ): List<PaymentOrder> =
        withContext(Dispatchers.IO) {
            val query = buildString {
                append("limit=").append(limit)
                createdBy?.let { append("&createdBy=").append(java.net.URLEncoder.encode(it, "UTF-8")) }
                createdFrom?.let { append("&createdFrom=").append(java.net.URLEncoder.encode(it.toString(), "UTF-8")) }
            }
            val req = authed("/orders?$query").get().build()
            execute(req) { JsonParsers.parsePaymentOrderList(it) }.onEach(::rememberPolicy)
        }

    /** POST /v1/orders/{id}/cancel — pending orders only (cashier own). */
    suspend fun cancelOrder(orderId: String): PaymentOrder =
        withContext(Dispatchers.IO) {
            val req = authed("/orders/${orderId.trim()}/cancel")
                .post("{}".toRequestBody(jsonMedia))
                .build()
            execute(req) { JsonParsers.parsePaymentOrder(it) }
        }

    /**
     * GET /v1/events (SSE) — order changes for this terminal's org, pushed by the server.
     * Blocks while the stream is open and calls [onOrderEvent] with the order id of each
     * order event. Returns when the server ends the stream (it does every few minutes);
     * cancelling the coroutine closes the connection.
     */
    suspend fun streamOrderEvents(onOrderEvent: (orderId: String?) -> Unit) =
        withContext(Dispatchers.IO) {
            val req = authed("/events").header("Accept", "text/event-stream").get().build()
            val call = streamHttp.newCall(req)
            val job = coroutineContext[Job]
            val cancelHook = job?.invokeOnCompletion { call.cancel() }
            try {
                call.execute().use { res ->
                    if (!res.isSuccessful) throw failure(res.body?.string().orEmpty(), res.code)
                    val source = res.body?.source() ?: return@use
                    var event = ""
                    val data = StringBuilder()
                    while (job?.isActive != false) {
                        val line = source.readUtf8Line() ?: break
                        when {
                            line.isEmpty() -> {
                                if (event == "dashboard" && data.isNotEmpty()) {
                                    JsonParsers.parseOrderEvent(data.toString())?.let { onOrderEvent(it.orderId) }
                                }
                                event = ""
                                data.clear()
                            }
                            line.startsWith("event:") -> event = line.substringAfter(':').trim()
                            line.startsWith("data:") -> data.append(line.substringAfter(':').trim())
                        }
                    }
                }
            } finally {
                cancelHook?.dispose()
            }
        }

    /** The server pings idle streams about every 30 s; a longer silence means the link is dead. */
    private val streamHttp: OkHttpClient =
        http.newBuilder()
            .readTimeout(75, TimeUnit.SECONDS)
            .build()

    // --- Plumbing ---------------------------------------------------------------

    private val policyByOrderId = ConcurrentHashMap<String, String>()

    private fun rememberPolicy(order: PaymentOrder) {
        policyByOrderId[order.id] = order.fulfillmentPolicy
    }

    private fun authed(path: String, withSession: Boolean = true): Request.Builder {
        val builder = Request.Builder()
            .url(config.url(path))
            .header("Accept", "application/json")
            .header("X-PaymentGate-Client", "pos")
        terminalStore.token?.let { builder.header("Authorization", "Terminal $it") }
        if (withSession) {
            sessionStore.sessionToken?.let {
                builder.header("Cookie", "${SessionStore.COOKIE_NAME}=$it")
            }
        }
        return builder
    }

    private fun <T> execute(req: Request, parse: (String) -> T): T =
        http.newCall(req).execute().use { res ->
            val body = res.body?.string().orEmpty()
            if (!res.isSuccessful) throw failure(body, res.code)
            parse(body)
        }

    /** 401 ends the PIN session; `terminal_revoked` also drops the binding. */
    private fun failure(body: String, status: Int): ApiError {
        val error = JsonParsers.parseError(body, status)
        if (error.code == CODE_TERMINAL_REVOKED) {
            sessionStore.clear()
            terminalStore.clear()
        } else if (status == 401 && error.code != CODE_INVALID_PIN && error.code != CODE_INVALID_MFA) {
            sessionStore.clear()
        }
        return error
    }

    private fun logoutQuietly() {
        val token = sessionStore.sessionToken
        if (token != null) {
            val req = Request.Builder()
                .url(config.url("/auth/logout"))
                .post(ByteArray(0).toRequestBody(null))
                .header("Cookie", "${SessionStore.COOKIE_NAME}=$token")
                .build()
            runCatching { http.newCall(req).execute().close() }
        }
        sessionStore.clear()
    }

    private fun captureSessionCookie(res: Response) {
        for (header in res.headers("Set-Cookie")) {
            val part = header.substringBefore(';').trim()
            val eq = part.indexOf('=')
            if (eq <= 0) continue
            val name = part.substring(0, eq).trim()
            if (name != SessionStore.COOKIE_NAME) continue
            val value = part.substring(eq + 1).trim()
            if (value.isNotEmpty()) {
                sessionStore.sessionToken = value
                return
            }
        }
    }

    companion object {
        const val CODE_TERMINAL_REVOKED = "terminal_revoked"
        const val CODE_INVALID_PIN = "invalid_pos_pin"
        const val CODE_UNLOCK_LOCKED = "pos_unlock_locked"
        const val CODE_INVALID_MFA = "invalid_mfa"

        fun defaultClient(): OkHttpClient =
            OkHttpClient.Builder()
                .connectTimeout(20, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .followRedirects(false)
                .build()

        fun newIdempotencyKey(): String =
            "pos-${java.util.UUID.randomUUID()}"
    }
}
