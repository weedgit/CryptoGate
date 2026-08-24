package com.cryptogate.cashier.api

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Thin HTTP client for OpenAPI auth (+ later orders).
 * Cookie `cg_session` is stored encrypted; never logs tokens.
 */
class CryptoGateClient(
    baseUrl: String,
    private val sessionStore: SessionStore,
    private val http: OkHttpClient = defaultClient(),
) {
    private val config = ApiConfig(baseUrl)
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    suspend fun login(email: String, password: String, orgId: String? = null): LoginResult =
        withContext(Dispatchers.IO) {
            val req = Request.Builder()
                .url(config.url("/auth/login"))
                .post(JsonParsers.loginRequestJson(email, password, orgId).toRequestBody(jsonMedia))
                .header("Accept", "application/json")
                .build()

            http.newCall(req).execute().use { res ->
                val body = res.body?.string().orEmpty()
                if (!res.isSuccessful) {
                    throw JsonParsers.parseError(body, res.code)
                }
                captureSessionCookie(res.headers("Set-Cookie"))
                val result = JsonParsers.parseLoginResponse(body)
                if (result.mfaRequired) {
                    sessionStore.clear()
                    throw ApiError(
                        code = "mfa_required",
                        message = "This account requires MFA. Sign in on the web portal.",
                        httpStatus = 403,
                    )
                }
                if (!SessionRules.hasCashierMembership(result.session)) {
                    sessionStore.clear()
                    throw ApiError(
                        code = "not_cashier",
                        message = "Cashier role on a merchant account is required for POS.",
                        httpStatus = 403,
                    )
                }
                sessionStore.cachedEmail = result.session.email
                result
            }
        }

    suspend fun getSession(): Session =
        withContext(Dispatchers.IO) {
            val token = sessionStore.sessionToken
                ?: throw ApiError("not_authenticated", "Not signed in", 401)
            val req = Request.Builder()
                .url(config.url("/auth/session"))
                .get()
                .header("Accept", "application/json")
                .header("Cookie", "${SessionStore.COOKIE_NAME}=$token")
                .build()
            http.newCall(req).execute().use { res ->
                val body = res.body?.string().orEmpty()
                if (!res.isSuccessful) {
                    if (res.code == 401) sessionStore.clear()
                    throw JsonParsers.parseError(body, res.code)
                }
                JsonParsers.parseSession(JSONObject(body))
            }
        }

    suspend fun logout() =
        withContext(Dispatchers.IO) {
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

    fun isSignedIn(): Boolean = !sessionStore.sessionToken.isNullOrBlank()

    private fun captureSessionCookie(setCookieHeaders: List<String>) {
        for (header in setCookieHeaders) {
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
        fun defaultClient(): OkHttpClient =
            OkHttpClient.Builder()
                .connectTimeout(20, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .followRedirects(false)
                .build()
    }
}
