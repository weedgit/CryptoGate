package com.paymentgate.cashier.api

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AssetNetworkCatalogTest {
    @Test
    fun mainnetPhase1RailsOnly() {
        val pairs = AssetNetworkCatalog.visible("mainnet")
        assertFalse(pairs.any { it.network == "tron_nile" })
        assertFalse(pairs.any { it.network == "bitcoin" })
        assertFalse(pairs.any { it.network == "bnb_smart_chain" })
        assertFalse(pairs.any { it.network == "polygon" })
        assertFalse(pairs.any { it.network == "ton" })
        assertTrue(pairs.any { it.asset == "USDT" && it.network == "tron" })
        assertTrue(pairs.any { it.asset == "TRX" && it.network == "tron" })
        assertTrue(pairs.any { it.asset == "USDT" && it.network == "ethereum" })
        assertTrue(pairs.any { it.asset == "USDC" && it.network == "ethereum" })
        assertTrue(pairs.any { it.asset == "ETH" && it.network == "ethereum" })
        assertTrue(pairs.any { it.asset == "USDT" && it.network == "solana" })
        assertTrue(pairs.any { it.asset == "USDC" && it.network == "solana" })
        assertEquals(7, pairs.size)
    }

    @Test
    fun testnetIncludesNile() {
        val pairs = AssetNetworkCatalog.visible("testnet")
        assertTrue(pairs.any { it.network == "tron_nile" })
        assertEquals(8, pairs.size)
    }

    @Test
    fun defaultPairIsUsdtTron() {
        val pair = AssetNetworkCatalog.defaultPair("mainnet")
        assertEquals("USDT", pair.asset)
        assertEquals("tron", pair.network)
    }

    @Test
    fun pairsForAssetFiltersNetworks() {
        val eth = AssetNetworkCatalog.pairsForAsset("ETH", "mainnet")
        assertEquals(1, eth.size)
        assertEquals("ethereum", eth[0].network)

        val usdt = AssetNetworkCatalog.pairsForAsset("USDT", "mainnet")
        assertEquals(setOf("tron", "ethereum", "solana"), usdt.map { it.network }.toSet())
    }

    @Test
    fun trxOnEthereumIsUnsupported() {
        assertFalse(AssetNetworkCatalog.isSupported("TRX", "ethereum", "mainnet"))
        assertEquals(
            "Ethereum · ERC-20",
            AssetNetworkCatalog.networkLabelFor("TRX", "ethereum", "mainnet"),
        )
    }

    @Test
    fun trxOnTronIsSupported() {
        assertTrue(AssetNetworkCatalog.isSupported("TRX", "tron", "mainnet"))
    }
}
