package com.paymentgate.cashier.hardware

import android.graphics.Bitmap
import android.util.Log
import com.zcs.sdk.DriverManager
import com.zcs.sdk.SdkResult
import com.zcs.sdk.Sys
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * ZCS secondary LCD via [Sys.showBitmapOnSecondaryScreen] (Z108S ~3.95″).
 */
class ZcsCustomerDisplay private constructor(
    private val driver: DriverManager,
    private val sys: Sys,
) : CustomerDisplay {
    override fun isAvailable(): Boolean = true

    override fun showPay(content: CustomerPayContent): CustomerDisplayOutcome {
        val bitmap = CustomerPayBitmap.render(content)
        return pushBitmap(bitmap, recycle = true)
    }

    override fun showIdle(): CustomerDisplayOutcome {
        val bitmap = CustomerPayBitmap.renderIdle()
        return pushBitmap(bitmap, recycle = true)
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
            }
        }
        if (!latch.await(20, TimeUnit.SECONDS)) {
            return CustomerDisplayOutcome.Failed("Customer display timed out")
        }
        return result.get()
    }

    companion object {
        private const val TAG = "ZcsCustomerDisplay"

        fun create(): CustomerDisplay {
            val driver = DriverManager.getInstance()
            val sys = driver.baseSysDevice
                ?: error("DriverManager.getBaseSysDevice() returned null")
            return ZcsCustomerDisplay(driver, sys)
        }
    }
}
