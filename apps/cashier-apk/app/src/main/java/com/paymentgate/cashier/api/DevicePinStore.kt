package com.paymentgate.cashier.api

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.security.MessageDigest

/**
 * Local device unlock PIN (V3). Session cookie still authenticates to the API;
 * PIN gates the POS UI after idle / Lock now. Dashboard PIN is primary; local
 * hash is a cache for offline unlock after a successful online verify.
 */
class DevicePinStore(context: Context) {
    private val prefs =
        EncryptedSharedPreferences.create(
            context,
            PREFS,
            MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )

    fun hasPin(): Boolean = !prefs.getString(KEY_HASH, null).isNullOrBlank()

    /** Last known dashboard POS PIN configuration (cached for offline unlock messaging). */
    fun dashboardPinConfigured(): Boolean = prefs.getBoolean(KEY_DASHBOARD_CONFIGURED, false)

    fun setDashboardPinConfigured(configured: Boolean) {
        prefs.edit().putBoolean(KEY_DASHBOARD_CONFIGURED, configured).apply()
    }

    fun setPin(pin: String) {
        require(pin.length in 4..8 && pin.all { it.isDigit() }) { "PIN must be 4–8 digits" }
        prefs.edit().putString(KEY_HASH, hash(pin)).apply()
    }

    fun verify(pin: String): Boolean {
        val expected = prefs.getString(KEY_HASH, null) ?: return false
        return expected == hash(pin)
    }

    fun clear() {
        prefs.edit().remove(KEY_HASH).remove(KEY_DASHBOARD_CONFIGURED).apply()
    }

    private fun hash(pin: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(pin.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }

    companion object {
        private const val PREFS = "cg_cashier_device_pin"
        private const val KEY_HASH = "pin_hash"
        private const val KEY_DASHBOARD_CONFIGURED = "dashboard_pin_configured"
    }
}
