package com.cryptogate.cashier

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.cryptogate.cashier.api.ApiError
import com.cryptogate.cashier.api.Session
import com.cryptogate.cashier.ui.HomeScreen
import com.cryptogate.cashier.ui.LoginScreen
import com.cryptogate.cashier.ui.theme.CashierTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val app = application as CashierApplication

        setContent {
            CashierTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    val scope = rememberCoroutineScope()
                    var signedIn by remember { mutableStateOf(app.api.isSignedIn()) }
                    var session by remember { mutableStateOf<Session?>(null) }
                    var email by remember { mutableStateOf("") }
                    var password by remember { mutableStateOf("") }
                    var error by remember { mutableStateOf<String?>(null) }
                    var loading by remember { mutableStateOf(false) }

                    LaunchedEffect(signedIn) {
                        if (signedIn) {
                            runCatching { session = app.api.getSession() }
                                .onFailure {
                                    signedIn = false
                                    session = null
                                }
                        }
                    }

                    if (!signedIn) {
                        LoginScreen(
                            email = email,
                            password = password,
                            error = error,
                            loading = loading,
                            onEmailChange = { email = it; error = null },
                            onPasswordChange = { password = it; error = null },
                            onSignIn = {
                                scope.launch {
                                    loading = true
                                    error = null
                                    try {
                                        val result = app.api.login(email.trim(), password)
                                        session = result.session
                                        password = ""
                                        signedIn = true
                                    } catch (e: ApiError) {
                                        error = e.message
                                        signedIn = false
                                    } catch (e: Exception) {
                                        error = e.message ?: "Network error — cannot sign in offline"
                                        signedIn = false
                                    } finally {
                                        loading = false
                                    }
                                }
                            },
                        )
                    } else {
                        HomeScreen(
                            session = session,
                            emailFallback = app.sessionStore.cachedEmail,
                            onCreateOrder = {
                                // M2-71: POST /v1/orders
                            },
                            onSignOut = {
                                scope.launch {
                                    app.api.logout()
                                    session = null
                                    signedIn = false
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}
