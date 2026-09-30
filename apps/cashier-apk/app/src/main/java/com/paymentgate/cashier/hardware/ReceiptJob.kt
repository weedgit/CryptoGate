package com.paymentgate.cashier.hardware

import com.paymentgate.cashier.api.AssetNetworkCatalog
import com.paymentgate.cashier.api.OrderStatusUi
import com.paymentgate.cashier.api.PaymentDetails
import com.paymentgate.cashier.ui.OrderInfoFormat
import com.paymentgate.cashier.ui.groupThousands
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

data class ReceiptJob(
    val merchantName: String,
    val orderNumber: String,
    val printedAt: String,
    val amountLine: String,
    val asset: String,
    val network: String,
    val receiveAddress: String,
    val statusLabel: String,
    val isAnomaly: Boolean,
    val merchantReference: String? = null,
    val txHash: String? = null,
    val cashierName: String? = null,
    val terminalLabel: String? = null,
    /** Org logo as a `data:image/...` URL; preset marks are not printed. */
    val logoDataUrl: String? = null,
    val createdAt: String? = null,
    val paidAt: String? = null,
    /** Fiat invoice, e.g. "$10.00". */
    val invoiceAmount: String? = null,
    /** "1 USDT = 1.00 USD". */
    val rateLine: String? = null,
    /** "TRON · TRC-20". */
    val networkLabel: String? = null,
    /** Unpaid invoice: the slip carries a wallet-address QR so the guest can pay from paper. */
    val awaitingPayment: Boolean = false,
    /** Deadline for [awaitingPayment] slips. */
    val payBefore: String? = null,
)

private val receiptTime = DateTimeFormatter.ofPattern("d MMM yyyy HH:mm", Locale.ENGLISH)

private fun receiptTime(iso: String?, zone: ZoneId): String? =
    iso?.let { runCatching { Instant.parse(it).atZone(zone).format(receiptTime) }.getOrNull() }

fun PaymentDetails.toReceiptJob(
    merchantReference: String? = null,
    printedAtIso: String,
    zone: ZoneId = ZoneId.systemDefault(),
    orgName: String? = null,
    cashierName: String? = null,
    terminalLabel: String? = null,
    logoDataUrl: String? = null,
): ReceiptJob =
    ReceiptJob(
        merchantName = orgName?.takeIf { it.isNotBlank() } ?: merchantName.ifBlank { "Merchant" },
        orderNumber = orderNumber,
        printedAt = printedAtIso,
        amountLine = "${groupThousands(payableAmount.amount)} ${payableAmount.currency.ifBlank { asset }}",
        asset = asset,
        network = network,
        receiveAddress = receiveAddress,
        statusLabel = OrderStatusUi.label(status),
        isAnomaly = OrderStatusUi.isAnomaly(status),
        merchantReference = merchantReference,
        txHash = txHash?.takeIf { it.isNotBlank() },
        cashierName = cashierName,
        terminalLabel = terminalLabel,
        logoDataUrl = logoDataUrl?.takeIf { it.startsWith("data:image") },
        createdAt = receiptTime(createdAt, zone),
        paidAt = if (OrderStatusUi.showsCompleted(status)) receiptTime(confirmedAt, zone) else null,
        invoiceAmount = invoice?.let(OrderInfoFormat::fiat),
        rateLine = rate?.let { OrderInfoFormat.rate(asset, it) },
        networkLabel = AssetNetworkCatalog.find(asset, network, null)?.shortNetworkLabel,
        awaitingPayment = status == OrderStatusUi.PENDING && receiveAddress.isNotBlank(),
        payBefore = receiptTime(expiresAt.ifBlank { null }, zone),
    )
