package com.paymentgate.cashier.api

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Terminal binding from `POST /v1/pos/terminals`. The token is shown once by the
 * server and is the only credential this device keeps between PIN sessions.
 */
class TerminalStore(context: Context) {
    private val prefs =
        EncryptedSharedPreferences.create(
            context,
            PREFS,
            MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )

    val token: String?
        get() = prefs.getString(KEY_TOKEN, null)?.takeIf { it.isNotBlank() }

    fun isBound(): Boolean = token != null

    fun binding(): TerminalBinding? {
        val token = token ?: return null
        return TerminalBinding(
            terminalId = prefs.getString(KEY_TERMINAL_ID, null).orEmpty(),
            token = token,
            org = OrgInfo(
                id = prefs.getString(KEY_ORG_ID, null).orEmpty(),
                type = prefs.getString(KEY_ORG_TYPE, null),
                name = prefs.getString(KEY_ORG_NAME, null).orEmpty(),
                iconKey = prefs.getString(KEY_ORG_ICON, null),
            ),
            businessTimezone = prefs.getString(KEY_BUSINESS_TZ, null),
        )
    }

    fun save(binding: TerminalBinding) {
        prefs.edit()
            .putString(KEY_TOKEN, binding.token)
            .putString(KEY_TERMINAL_ID, binding.terminalId)
            .putString(KEY_ORG_ID, binding.org.id)
            .putString(KEY_ORG_TYPE, binding.org.type)
            .putString(KEY_ORG_NAME, binding.org.name)
            .putString(KEY_ORG_ICON, binding.org.iconKey)
            .putString(KEY_BUSINESS_TZ, binding.businessTimezone)
            .commit()
    }

    /**
     * Refresh org details from `GET /v1/pos/terminal` / unlock; the token never changes.
     * The heartbeat omits the icon, so the stored one is kept unless [OrgInfo.iconSent].
     * Returns the org as stored.
     */
    fun updateOrg(org: OrgInfo, businessTimezone: String?): OrgInfo {
        val iconKey = if (org.iconSent) org.iconKey else prefs.getString(KEY_ORG_ICON, null)
        prefs.edit()
            .putString(KEY_ORG_ID, org.id)
            .putString(KEY_ORG_TYPE, org.type)
            .putString(KEY_ORG_NAME, org.name)
            .putString(KEY_ORG_ICON, iconKey)
            .putString(KEY_BUSINESS_TZ, businessTimezone)
            .commit()
        return org.copy(iconKey = iconKey)
    }

    fun clear() {
        prefs.edit().clear().commit()
    }

    companion object {
        private const val PREFS = "cg_cashier_terminal"
        private const val KEY_TOKEN = "terminal_token"
        private const val KEY_TERMINAL_ID = "terminal_id"
        private const val KEY_ORG_ID = "org_id"
        private const val KEY_ORG_TYPE = "org_type"
        private const val KEY_ORG_NAME = "org_name"
        private const val KEY_ORG_ICON = "org_icon"
        private const val KEY_BUSINESS_TZ = "business_timezone"
    }
}
