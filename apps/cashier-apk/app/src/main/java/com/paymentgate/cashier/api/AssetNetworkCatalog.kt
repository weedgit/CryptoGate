package com.paymentgate.cashier.api

/**
 * Phase 1 §VI asset+network catalog (mirrors packages/domain ASSET_NETWORK_REGISTRY).
 * APK cannot import the TS package — keep this list in sync with M3-04 / domain.
 */
data class AssetNetworkPair(
    val asset: String,
    val network: String,
    val displayNetwork: String,
    /** mainnet | testnet — Nile is testnet-only. */
    val chainEnv: String = "mainnet",
) {
    val label: String get() = "$asset · $displayNetwork"
}

object AssetNetworkCatalog {
    val ALL: List<AssetNetworkPair> = listOf(
        AssetNetworkPair("USDT", "tron", "TRON TRC-20"),
        AssetNetworkPair("USDT", "tron_nile", "TRON Nile (testnet)", "testnet"),
        AssetNetworkPair("USDT", "ethereum", "Ethereum ERC-20"),
        AssetNetworkPair("USDT", "bnb_smart_chain", "BNB Smart Chain BEP-20"),
        AssetNetworkPair("USDT", "polygon", "Polygon PoS"),
        AssetNetworkPair("USDT", "arbitrum_one", "Arbitrum One"),
        AssetNetworkPair("USDT", "solana", "Solana"),
        AssetNetworkPair("USDT", "ton", "TON"),
        AssetNetworkPair("USDC", "ethereum", "Ethereum ERC-20"),
        AssetNetworkPair("USDC", "polygon", "Polygon PoS"),
        AssetNetworkPair("USDC", "arbitrum_one", "Arbitrum One"),
        AssetNetworkPair("USDC", "base", "Base"),
        AssetNetworkPair("USDC", "solana", "Solana"),
        AssetNetworkPair("BTC", "bitcoin", "Bitcoin"),
        AssetNetworkPair("ETH", "ethereum", "Ethereum"),
        AssetNetworkPair("TRX", "tron", "Tron (native)"),
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

    fun defaultPair(chainEnv: String?): AssetNetworkPair {
        val pairs = visible(chainEnv)
        return pairs.find { it.asset == OrderDefaults.ASSET && it.network == OrderDefaults.NETWORK }
            ?: pairs.first()
    }
}
