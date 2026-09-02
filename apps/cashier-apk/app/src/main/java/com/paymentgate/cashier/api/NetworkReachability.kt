package com.paymentgate.cashier.api

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities

/** M2-74 — POS must not create orders while offline. */
object NetworkReachability {
    fun isOnline(context: Context): Boolean {
        val cm = context.getSystemService(ConnectivityManager::class.java) ?: return false
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
}
