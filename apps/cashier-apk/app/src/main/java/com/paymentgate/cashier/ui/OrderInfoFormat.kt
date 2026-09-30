package com.paymentgate.cashier.ui

import com.paymentgate.cashier.api.Money
import com.paymentgate.cashier.api.OrderRate
import java.math.BigDecimal
import java.math.RoundingMode
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

internal object OrderInfoFormat {
    private val timeOnly = DateTimeFormatter.ofPattern("HH:mm", Locale.ENGLISH)
    private val dateTime = DateTimeFormatter.ofPattern("d MMM, HH:mm", Locale.ENGLISH)
    private val fullDateTime = DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm:ss", Locale.ENGLISH)

    /** "14:05" today, else "3 Sep, 14:05". */
    fun shortTime(iso: String?, zone: ZoneId): String? {
        val at = parse(iso, zone) ?: return null
        return if (at.toLocalDate() == LocalDate.now(zone)) at.format(timeOnly) else at.format(dateTime)
    }

    fun fullTime(iso: String?, zone: ZoneId): String? = parse(iso, zone)?.format(fullDateTime)

    /** "$12.50" for USD, else "12.50 EUR". */
    fun fiat(money: Money): String {
        val amount = runCatching {
            grouped(2).format(BigDecimal(money.amount).setScale(2, RoundingMode.HALF_UP))
        }.getOrDefault(money.amount)
        return if (money.currency.equals("USD", ignoreCase = true)) "$$amount" else "$amount ${money.currency}"
    }

    /** "1 BTC = 64,012.35 USD"; small prices keep more decimals. */
    fun rate(asset: String, rate: OrderRate): String {
        val value = runCatching {
            val v = BigDecimal(rate.value)
            val scale = if (v >= BigDecimal.ONE) 2 else 6
            grouped(scale).format(v.setScale(scale, RoundingMode.HALF_UP))
        }.getOrDefault(rate.value)
        return "1 $asset = $value ${rate.quote}"
    }

    fun rateSource(source: String?): String? =
        source?.replace('_', ' ')?.replaceFirstChar { it.uppercase() }

    fun shortHash(hash: String): String = if (hash.length <= 16) hash else "${hash.take(8)}…${hash.takeLast(6)}"

    private fun parse(iso: String?, zone: ZoneId) =
        iso?.let { runCatching { Instant.parse(it).atZone(zone) }.getOrNull() }

    private fun grouped(scale: Int): DecimalFormat =
        DecimalFormat(
            if (scale == 0) "#,##0" else "#,##0." + "0".repeat(scale),
            DecimalFormatSymbols(Locale.ENGLISH),
        )
}
