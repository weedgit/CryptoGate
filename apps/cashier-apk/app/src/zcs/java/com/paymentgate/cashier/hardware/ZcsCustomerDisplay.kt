package com.paymentgate.cashier.hardware

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import com.paymentgate.cashier.BuildConfig
import com.zcs.sdk.DriverManager
import com.zcs.sdk.SdkResult
import com.zcs.sdk.Sys
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * ZCS secondary LCD: presentation window when the system exposes it, else [Sys.showBitmapOnSecondaryScreen] (Z108S ~3.95″).
 */
class ZcsCustomerDisplay private constructor(
    private val driver: DriverManager,
    private val sys: Sys,
    private val usePresentation: Boolean,
) : CustomerDisplay {
    override fun isAvailable(): Boolean = true

    private var shownKey: Any? = null

    override fun showPay(content: CustomerPayContent): CustomerDisplayOutcome = pushOnce(content) { CustomerPayBitmap.render(content) }

    override fun showIdle(): CustomerDisplayOutcome = pushOnce(IdleKey) { CustomerPayBitmap.renderIdle() }

    /**
     * When the panel is exposed as a presentation display, the system streams that display to the LCD over the
     * same serial link and an SDK push would collide with it, so [CustomerPresentation] draws the panel instead.
     */
    @Synchronized
    private fun pushOnce(key: Any, render: () -> Bitmap): CustomerDisplayOutcome {
        if (usePresentation || key == shownKey) return CustomerDisplayOutcome.Ok
        val frame = render()
        if (BuildConfig.DEBUG) mirrorForDebug(frame)
        val outcome = pushBitmap(frame, recycle = true)
        shownKey = if (outcome is CustomerDisplayOutcome.Ok) key else null
        return outcome
    }

    private fun pushBitmap(bitmap: Bitmap, recycle: Boolean): CustomerDisplayOutcome {
        val latch = CountDownLatch(1)
        val result =
            AtomicReference<CustomerDisplayOutcome>(
                CustomerDisplayOutcome.Failed("Customer display did not start"),
            )
        driver.singleThreadExecutor.execute {
            try {
                runCatching { sys.awakeSubScreen() }
                val code = sys.showBitmapOnSecondaryScreen(bitmap, true)
                if (code == SdkResult.SDK_OK) {
                    runCatching { sys.awakeSubScreen() }
                }
                result.set(
                    if (code == SdkResult.SDK_OK) {
                        CustomerDisplayOutcome.Ok
                    } else {
                        CustomerDisplayOutcome.Failed("showBitmapOnSecondaryScreen=$code")
                    },
                )
            } catch (e: Exception) {
                Log.e(TAG, "pushBitmap failed", e)
                result.set(CustomerDisplayOutcome.Failed(e.message ?: "Secondary screen exception"))
            } finally {
                if (recycle && !bitmap.isRecycled) bitmap.recycle()
                latch.countDown()
                runCatching { Thread.sleep(SETTLE_MS) }
            }
        }
        if (!latch.await(20, TimeUnit.SECONDS)) {
            return CustomerDisplayOutcome.Failed("Customer display timed out")
        }
        return result.get()
    }

    /** Debug builds keep the last frame in app cache so it can be pulled with adb run-as. */
    private fun mirrorForDebug(bitmap: Bitmap) {
        runCatching {
            File("/data/data/${BuildConfig.APPLICATION_ID}/cache/customer_display.png").outputStream().use {
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)
            }
        }
    }

    companion object {
        private const val TAG = "ZcsCustomerDisplay"
        private const val SETTLE_MS = 350L
        private val IdleKey = Any()

        fun create(context: Context): CustomerDisplay {
            val driver = DriverManager.getInstance()
            val sys = driver.baseSysDevice
                ?: error("DriverManager.getBaseSysDevice() returned null")
            return ZcsCustomerDisplay(driver, sys, CustomerPresentation.hasDisplay(context))
        }
    }
}
