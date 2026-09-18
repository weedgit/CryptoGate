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

    companion object {
        private const val PREFS = "cg_cashier_ui"
        private const val KEY_DARK = "dark_theme"
        private const val KEY_IDLE = "idle_lock_minutes"
    }
}
