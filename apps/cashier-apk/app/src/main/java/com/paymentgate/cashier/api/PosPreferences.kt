package com.paymentgate.cashier.api

import android.content.Context

/** UI prefs — separate from session so logout does not reset theme. */
class PosPreferences(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Default is light (false). */
    var darkTheme: Boolean
        get() = prefs.getBoolean(KEY_DARK, false)
        set(value) {
            prefs.edit().putBoolean(KEY_DARK, value).apply()
        }

    /**
     * Idle lock minutes — 0 = Off. Matches V3 More: Off / 5 / 10 / 15 / 30.
     */
    var idleLockMinutes: Int
        get() = prefs.getInt(KEY_IDLE, 5).coerceIn(0, 30)
        set(value) {
            val allowed = setOf(0, 5, 10, 15, 30)
            prefs.edit().putInt(KEY_IDLE, if (value in allowed) value else 5).apply()
        }

    /** Screen saver minutes — 0 = Off. Off / 1 / 2 / 5 / 10. */
    var screenSaverMinutes: Int
        get() = prefs.getInt(KEY_SAVER, 2).coerceIn(0, 10)
        set(value) {
            val allowed = setOf(0, 1, 2, 5, 10)
            prefs.edit().putInt(KEY_SAVER, if (value in allowed) value else 2).apply()
        }

    /** Order sounds — 0 = Off, 1 Low, 2 Medium, 3 High. */
    var soundLevel: Int
        get() = prefs.getInt(KEY_SOUND, 3).coerceIn(0, 3)
        set(value) {
            prefs.edit().putInt(KEY_SOUND, value.coerceIn(0, 3)).apply()
        }

    /** Last asset + network charged on this POS; the Charge screen starts from it. */
    val lastAsset: String? get() = prefs.getString(KEY_LAST_ASSET, null)
    val lastNetwork: String? get() = prefs.getString(KEY_LAST_NETWORK, null)

    fun rememberPair(asset: String, network: String) {
        prefs.edit().putString(KEY_LAST_ASSET, asset).putString(KEY_LAST_NETWORK, network).apply()
    }

    companion object {
        private const val PREFS = "cg_cashier_ui"
        private const val KEY_LAST_ASSET = "last_asset"
        private const val KEY_LAST_NETWORK = "last_network"
        private const val KEY_DARK = "dark_theme"
        private const val KEY_IDLE = "idle_lock_minutes"
        private const val KEY_SAVER = "screen_saver_minutes"
        private const val KEY_SOUND = "sound_level"
    }
}
