package com.paymentgate.cashier

import android.app.Application
import com.paymentgate.cashier.api.PaymentGateClient
import com.paymentgate.cashier.api.SessionStore

class CashierApplication : Application() {
    lateinit var sessionStore: SessionStore
        private set
    lateinit var api: PaymentGateClient
        private set

    override fun onCreate() {
        super.onCreate()
        sessionStore = SessionStore(this)
        api = PaymentGateClient(
            baseUrl = BuildConfig.API_BASE_URL,
            sessionStore = sessionStore,
        )
    }
}
