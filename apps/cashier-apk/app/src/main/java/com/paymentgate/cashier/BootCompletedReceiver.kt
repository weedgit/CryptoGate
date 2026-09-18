package com.paymentgate.cashier

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Start the cashier POS after power-on. Android 10+ may still block this unless
 * the app is the default Home app or OEM autostart is allowed.
 */
class BootCompletedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action !in HANDLED) return
        val launch =
            Intent(context, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
        try {
            context.startActivity(launch)
        } catch (e: Exception) {
            Log.e(TAG, "Could not start POS after $action", e)
        }
    }

    companion object {
        private const val TAG = "BootCompletedReceiver"
        private val HANDLED =
            setOf(
                Intent.ACTION_BOOT_COMPLETED,
                Intent.ACTION_LOCKED_BOOT_COMPLETED,
                "android.intent.action.QUICKBOOT_POWERON",
                "com.htc.intent.action.QUICKBOOT_POWERON",
            )
    }
}
