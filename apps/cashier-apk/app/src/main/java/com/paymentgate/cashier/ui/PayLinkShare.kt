package com.paymentgate.cashier.ui

import android.content.Context
import android.content.Intent
import com.paymentgate.cashier.api.PaymentDetails
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

object PayLinkShare {
    /** "Pay 25.10 USDT to North Annex (valid until 14:30)" — same wording as the web Send payment link. */
    fun lead(details: PaymentDetails, zone: ZoneId = defaultZone(details)): String {
        val merchant = details.merchantName.ifBlank { "Merchant" }
        val amount = "${details.payableAmount.amount} ${details.asset}"
        val until =
            runCatching {
                DateTimeFormatter.ofPattern("HH:mm").withZone(zone).format(Instant.parse(details.expiresAt))
            }.getOrNull()
        return if (until != null) "Pay $amount to $merchant (valid until $until)" else "Pay $amount to $merchant"
    }

    fun message(details: PaymentDetails, zone: ZoneId = defaultZone(details)): String =
        "${lead(details, zone)}: ${details.paymentPageUrl}"

    fun canShare(details: PaymentDetails): Boolean = details.paymentPageUrl.isNotBlank()

    /** Opens the system share sheet (WhatsApp, Telegram, email, SMS, …). */
    fun share(context: Context, details: PaymentDetails) {
        val send =
            Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_SUBJECT, lead(details))
                putExtra(Intent.EXTRA_TEXT, message(details))
            }
        val chooser = Intent.createChooser(send, "Send payment link").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(chooser)
    }

    private fun defaultZone(details: PaymentDetails): ZoneId =
        details.businessTimezone?.let { runCatching { ZoneId.of(it) }.getOrNull() } ?: ZoneId.systemDefault()
}
