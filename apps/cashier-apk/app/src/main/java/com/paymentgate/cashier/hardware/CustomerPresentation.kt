package com.paymentgate.cashier.hardware

import android.app.Presentation
import android.content.Context
import android.hardware.display.DisplayManager
import android.os.Bundle
import android.util.Log
import android.view.Display
import androidx.activity.ComponentActivity
import androidx.compose.ui.platform.ComposeView
import androidx.lifecycle.setViewTreeLifecycleOwner
import androidx.savedstate.setViewTreeSavedStateRegistryOwner
import com.paymentgate.cashier.ui.CustomerScreenContent
import com.paymentgate.cashier.ui.theme.CashierTheme

/**
 * Customer panel as an Android presentation display. On ZCS terminals the system streams whatever is drawn on
 * that display to the serial LCD, and mirrors the cashier screen when it is empty — so the app keeps a window there.
 */
object CustomerPresentation {
    private const val TAG = "CustomerPresentation"
    private var presentation: Presentation? = null

    fun hasDisplay(context: Context): Boolean = findDisplay(context) != null

    /** Call from the activity's onStart (main thread). */
    fun attach(activity: ComponentActivity) {
        if (presentation?.isShowing == true) return
        val display = findDisplay(activity) ?: return
        runCatching {
            ComposePresentation(activity, display).also {
                it.show()
                presentation = it
            }
        }.onFailure { Log.w(TAG, "presentation failed", it) }
    }

    /** Call from the activity's onStop (main thread). */
    fun detach() {
        runCatching { presentation?.dismiss() }
        presentation = null
    }

    private fun findDisplay(context: Context): Display? {
        val dm = context.getSystemService(DisplayManager::class.java) ?: return null
        return dm.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION).firstOrNull()
    }

    private class ComposePresentation(
        private val activity: ComponentActivity,
        display: Display,
    ) : Presentation(activity, display) {
        override fun onCreate(savedInstanceState: Bundle?) {
            super.onCreate(savedInstanceState)
            val view =
                ComposeView(context).apply {
                    setViewTreeLifecycleOwner(activity)
                    setViewTreeSavedStateRegistryOwner(activity)
                    setContent { CashierTheme(darkTheme = true) { CustomerScreenContent() } }
                }
            window?.decorView?.let {
                it.setViewTreeLifecycleOwner(activity)
                it.setViewTreeSavedStateRegistryOwner(activity)
            }
            setContentView(view)
        }
    }
}
