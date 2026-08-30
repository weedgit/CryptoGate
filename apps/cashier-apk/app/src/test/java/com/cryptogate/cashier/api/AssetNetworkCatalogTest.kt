package com.cryptogate.cashier.api

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AssetNetworkCatalogTest {
    @Test
    fun mainnetHidesNile() {
        val pairs = AssetNetworkCatalog.visible("mainnet")
        assertFalse(pairs.any { it.network == "tron_nile" })
        assertTrue(pairs.any { it.asset == "USDT" && it.network == "tron" })
        assertTrue(pairs.any { it.asset == "USDC" && it.network == "base" })
        assertTrue(pairs.any { it.asset == "BTC" && it.network == "bitcoin" })
        assertEquals(15, pairs.size)
    }

    @Test
    fun testnetIncludesNile() {
        val pairs = AssetNetworkCatalog.visible("testnet")
        assertTrue(pairs.any { it.network == "tron_nile" })
        assertEquals(16, pairs.size)
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
    }
}
