package com.cryptogate.cashier.api

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class JsonParsersTest {
    @Test
    fun parseLogin_cashierMembership() {
        val body =
            """
            {
              "mfaRequired": false,
              "session": {
                "userId": "u1",
                "email": "cashier@example.com",
                "memberships": [
                  { "orgId": "m1", "userId": "u1", "role": "cashier", "orgType": "merchant" }
                ]
              }
            }
            """.trimIndent()
        val result = JsonParsers.parseLoginResponse(body)
        assertFalse(result.mfaRequired)
        assertTrue(SessionRules.hasCashierMembership(result.session))
        assertEquals("cashier@example.com", result.session.email)
    }

    @Test
    fun rejectOwnerWithoutCashier() {
        val session = JsonParsers.parseSession(
            JSONObject(
                """
                {
                  "userId": "u1",
                  "email": "owner@example.com",
                  "memberships": [
                    { "orgId": "m1", "userId": "u1", "role": "owner", "orgType": "merchant" }
                  ]
                }
                """.trimIndent(),
            ),
        )
        assertFalse(SessionRules.hasCashierMembership(session))
    }

    @Test
    fun loginRequestJsonIncludesEmail() {
        val json = JsonParsers.loginRequestJson("a@b.co", "passwordlong1", null)
        assertTrue(json.contains("a@b.co"))
        assertFalse(json.contains("orgId"))
    }
}
