package com.paymentgate.cashier.api

/**
 * Phase 1 PaymentGate rails — Tron / Ethereum / Solana only (V3 handoff).
 * Keep in sync with packages/domain pairs that remain enabled for Phase 1.
 */
data class AssetNetworkPair(
    val asset: String,
    val network: String,
    val displayNetwork: String,
    /** mainnet | testnet — Nile is testnet-only. */
    val chainEnv: String = "mainnet",
    /** Group header on the Change-rail sheet (TRON / ETHEREUM / SOLANA). */
    val railGroup: String = "",
) {
    val label: String get() = "$asset · $displayNetwork"

    /** Compact Create-header label, e.g. TRON · TRC-20 */
    val shortNetworkLabel: String
        get() =
            when (network) {
                "tron" -> "TRON · TRC-20"
                "tron_nile" -> "TRON · Nile"
                "ethereum" ->
                    when (asset) {
                        "ETH" -> "Ethereum · Native"
                        else -> "Ethereum · ERC-20"
                    }
                "solana" -> "Solana"
                else -> displayNetwork
            }
}

object AssetNetworkCatalog {
    val ALL: List<AssetNetworkPair> = listOf(
        AssetNetworkPair("USDT", "tron", "TRON TRC-20", railGroup = "TRON"),
        AssetNetworkPair("TRX", "tron", "Tron (native)", railGroup = "TRON"),
        AssetNetworkPair("USDT", "tron_nile", "TRON Nile (testnet)", "testnet", "TRON"),
        AssetNetworkPair("USDT", "ethereum", "Ethereum ERC-20", railGroup = "ETHEREUM"),
        AssetNetworkPair("USDC", "ethereum", "Ethereum ERC-20", railGroup = "ETHEREUM"),
        AssetNetworkPair("ETH", "ethereum", "Ethereum", railGroup = "ETHEREUM"),
        AssetNetworkPair("USDT", "solana", "Solana", railGroup = "SOLANA"),
        AssetNetworkPair("USDC", "solana", "Solana", railGroup = "SOLANA"),
    )

    /**
     * @param chainEnv `mainnet` (product) hides Nile; `testnet` shows all pairs.
     *   Unknown values default to mainnet filtering.
     */
    fun visible(chainEnv: String?): List<AssetNetworkPair> {
        val env = chainEnv?.trim()?.lowercase().orEmpty()
        val includeTestnet = env == "testnet"
        return ALL.filter { row ->
            row.chainEnv == "mainnet" || (includeTestnet && row.chainEnv == "testnet")
        }
    }

    fun assets(chainEnv: String?): List<String> =
        visible(chainEnv).map { it.asset }.distinct()

    fun pairsForAsset(asset: String, chainEnv: String?): List<AssetNetworkPair> =
        visible(chainEnv).filter { it.asset == asset }

    fun find(asset: String, network: String, chainEnv: String?): AssetNetworkPair? =
        visible(chainEnv).find { it.asset == asset && it.network == network }

    /** True when asset+network is a live Phase 1 pair for this chain env. */
    fun isSupported(asset: String, network: String, chainEnv: String?): Boolean =
        find(asset, network, chainEnv) != null

    /**
     * Guest/network label for error copy when the pair may be unsupported.
     * Falls back to a readable network id.
     */
    fun networkLabelFor(asset: String, network: String, chainEnv: String?): String =
        find(asset, network, chainEnv)?.shortNetworkLabel
            ?: when (network) {
                "tron" -> "TRON · TRC-20"
                "tron_nile" -> "TRON · Nile"
                "ethereum" -> "Ethereum · ERC-20"
                "solana" -> "Solana"
                "bitcoin" -> "Bitcoin"
                "bnb_smart_chain" -> "BNB Smart Chain"
                "polygon" -> "Polygon"
                "ton" -> "TON"
                else -> network.replace('_', ' ')
            }

    fun defaultPair(chainEnv: String?): AssetNetworkPair {
        val pairs = visible(chainEnv)
        return pairs.find { it.asset == OrderDefaults.ASSET && it.network == OrderDefaults.NETWORK }
            ?: pairs.first()
    }

    fun groups(chainEnv: String?): List<Pair<String, List<AssetNetworkPair>>> =
        visible(chainEnv)
            .groupBy { it.railGroup.ifBlank { it.displayNetwork } }
            .entries
            .map { it.key to it.value }
}
