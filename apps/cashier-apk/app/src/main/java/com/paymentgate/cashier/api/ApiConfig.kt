package com.paymentgate.cashier.api

/**
 * API base must include /v1 (OpenAPI servers.url).
 * Emulator default is set in BuildConfig; physical device needs LAN IP.
 */
data class ApiConfig(
    val baseUrl: String,
) {
    init {
        require(baseUrl.isNotBlank()) { "API_BASE_URL is required" }
    }

    fun url(path: String): String {
        val base = baseUrl.trimEnd('/')
        val p = if (path.startsWith("/")) path else "/$path"
        return base + p
    }
}
