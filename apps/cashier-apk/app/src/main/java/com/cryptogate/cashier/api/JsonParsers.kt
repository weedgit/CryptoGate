package com.cryptogate.cashier.api

import org.json.JSONArray
import org.json.JSONObject

object JsonParsers {
    fun parseLoginResponse(body: String): LoginResult {
        val root = JSONObject(body)
        val session = parseSession(root.getJSONObject("session"))
        val mfaRequired = root.optBoolean("mfaRequired", false)
        return LoginResult(session = session, mfaRequired = mfaRequired)
    }

    fun parseSession(obj: JSONObject): Session {
        val memberships = mutableListOf<OrgMembership>()
        val arr: JSONArray = obj.optJSONArray("memberships") ?: JSONArray()
        for (i in 0 until arr.length()) {
            val m = arr.getJSONObject(i)
            memberships.add(
                OrgMembership(
                    orgId = m.getString("orgId"),
                    orgType = if (m.has("orgType") && !m.isNull("orgType")) {
                        m.getString("orgType")
                    } else {
                        null
                    },
                    role = m.getString("role"),
                ),
            )
        }
        return Session(
            userId = obj.getString("userId"),
            email = obj.getString("email"),
            memberships = memberships,
        )
    }

    fun parseError(body: String, httpStatus: Int): ApiError {
        return try {
            val root = JSONObject(body)
            ApiError(
                code = root.optString("code", "http_error"),
                message = root.optString("message", "Request failed"),
                httpStatus = httpStatus,
            )
        } catch (_: Exception) {
            ApiError(
                code = "http_error",
                message = body.ifBlank { "HTTP $httpStatus" },
                httpStatus = httpStatus,
            )
        }
    }

    fun loginRequestJson(email: String, password: String, orgId: String?): String {
        val o = JSONObject()
        o.put("email", email)
        o.put("password", password)
        if (!orgId.isNullOrBlank()) o.put("orgId", orgId)
        return o.toString()
    }
}
