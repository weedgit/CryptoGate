package com.paymentgate.cashier

import android.app.Application
import com.paymentgate.cashier.api.PaymentGateClient
import com.paymentgate.cashier.api.SessionStore
import com.paymentgate.cashier.hardware.CustomerDisplay
import com.paymentgate.cashier.hardware.CustomerDisplayFactory
import com.paymentgate.cashier.hardware.LastReceiptStore
import com.paymentgate.cashier.hardware.ThermalPrinter
import com.paymentgate.cashier.hardware.ThermalPrinterFactory

class CashierApplication : Application() {
    lateinit var sessionStore: SessionStore
        private set
    lateinit var api: PaymentGateClient
        private set
    lateinit var thermalPrinter: ThermalPrinter
        private set
    lateinit var customerDisplay: CustomerDisplay
        private set
    lateinit var lastReceiptStore: LastReceiptStore
        private set

    override fun onCreate() {
        super.onCreate()
        sessionStore = SessionStore(this)
        api = PaymentGateClient(
            baseUrl = BuildConfig.API_BASE_URL,
            sessionStore = sessionStore,
        )
        lastReceiptStore = LastReceiptStore()
        thermalPrinter = ThermalPrinterFactory.create()
        customerDisplay = CustomerDisplayFactory.create()
    }
}
