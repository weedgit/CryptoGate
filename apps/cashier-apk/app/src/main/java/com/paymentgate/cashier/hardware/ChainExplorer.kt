package com.paymentgate.cashier.hardware

import java.net.URLEncoder

/** Public block explorer links — same hosts as web `shared/chainExplorer.ts`. */
object ChainExplorer {
    fun txUrl(network: String, txHash: String): String? {
        val hash = URLEncoder.encode(txHash.trim(), "UTF-8")
        if (hash.isEmpty()) return null
        return when (network.lowercase()) {
            "tron" -> "https://tronscan.org/#/transaction/$hash"
            "tron_nile" -> "https://nile.tronscan.org/#/transaction/$hash"
            "ethereum" -> "https://etherscan.io/tx/$hash"
            "solana" -> "https://solscan.io/tx/$hash"
            else -> null
        }
    }
}
