package com.cryptogate.cashier

import android.app.Application
import com.cryptogate.cashier.api.CryptoGateClient
import com.cryptogate.cashier.api.SessionStore

class CashierApplication : Application() {
    lateinit var sessionStore: SessionStore
        private set
    lateinit var api: CryptoGateClient
        private set

    override fun onCreate() {
        super.onCreate()
        sessionStore = SessionStore(this)
        api = CryptoGateClient(
            baseUrl = BuildConfig.API_BASE_URL,
            sessionStore = sessionStore,
        )
    }
}
