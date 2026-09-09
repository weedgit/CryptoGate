package com.paymentgate.cashier.hardware

import com.paymentgate.cashier.api.OrderStatusUi
import com.paymentgate.cashier.api.PaymentDetails

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
    val txHint: String? = null,
)

fun PaymentDetails.toReceiptJob(
    merchantReference: String? = null,
    printedAtIso: String,
): ReceiptJob =
    ReceiptJob(
        merchantName = merchantName.ifBlank { "Merchant" },
        orderNumber = orderNumber,
        printedAt = printedAtIso,
        amountLine = "${payableAmount.amount} ${payableAmount.currency.ifBlank { asset }}",
        asset = asset,
        network = network,
        receiveAddress = receiveAddress,
        statusLabel = OrderStatusUi.label(status),
        isAnomaly = OrderStatusUi.isAnomaly(status),
        merchantReference = merchantReference,
        txHint = null,
    )
