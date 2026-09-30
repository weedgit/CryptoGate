package com.paymentgate.cashier.ui

import android.app.Activity
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import com.paymentgate.cashier.R
import kotlinx.coroutines.delay

enum class SetupStep { Credentials, Mfa, Confirm }

/** Web split-login colours (`05-login.css`), dark and light. */
private data class LoginPalette(
    val barTop: Color,
    val barBottom: Color,
    val title: Color,
    val muted: Color,
    val inputBg: Color,
    val inputBorder: Color,
    val placeholder: Color,
    val text: Color,
    val link: Color,
    val note: Color,
    val gold: Color,
    val accent: Color,
    val error: Color,
    val toggleBg: Color,
    val toggleBorder: Color,
    val isDark: Boolean,
)

private val DarkLogin = LoginPalette(
    barTop = Color(0xFF0B1A33),
    barBottom = Color(0xFF00161F),
    title = Color(0xFFF8FAFC),
    muted = Color(0xFF94A3B8),
    inputBg = Color(0xFF061525),
    inputBorder = Color(0x4764A0D2),
    placeholder = Color(0xFF64748B),
    text = Color(0xFFF8FAFC),
    link = Color(0xFF22D3EE),
    note = Color(0xFF64748B),
    gold = Color(0xFFEAB308),
    accent = Color(0xFF2DD4BF),
    error = Color(0xFFFF5A6A),
    toggleBg = Color(0x0FFFFFFF),
    toggleBorder = Color(0x1FFFFFFF),
    isDark = true,
)

private val LightLogin = LoginPalette(
    barTop = Color(0xFFF3F8FF),
    barBottom = Color(0xFFE5F5F1),
    title = Color(0xFF0F172A),
    muted = Color(0xFF64748B),
    inputBg = Color(0xFFFFFFFF),
    inputBorder = Color(0xFFD8DEE8),
    placeholder = Color(0xFF94A3B8),
    text = Color(0xFF0F172A),
    link = Color(0xFF0D9488),
    note = Color(0xFF94A3B8),
    gold = Color(0xFFCA8A04),
    accent = Color(0xFF0D9488),
    error = Color(0xFFDC2626),
    toggleBg = Color(0xFFFFFFFF),
    toggleBorder = Color(0xFFD8DEE8),
    isDark = false,
)

/** `.login-submit` 135° gold gradient; text `#0b0f14`. */
private val GoldGradient = Brush.linearGradient(
    listOf(Color(0xFFF5C542), Color(0xFFE5A842), Color(0xFFD4922A)),
)
private val SubmitInk = Color(0xFF0B0F14)
private val FocusTeal = Color(0xFF00D4C8)
private val FocusGold = Color(212, 184, 112)

/**
 * One-time POS setup by an Owner or Administrator: sign in, authenticator code if
 * the account uses one, then confirm which org this POS will charge for.
 * Ports the web portal login: animated hero scene, card enter + error shake,
 * gradient focus ring and staggered MFA slots, in both colour modes.
 */
@Composable
fun LoginScreen(
    step: SetupStep,
    email: String,
    password: String,
    mfaCode: String,
    orgName: String?,
    orgTypeLabel: String?,
    orgIconKey: String?,
    error: String?,
    loading: Boolean,
    darkTheme: Boolean,
    onToggleTheme: () -> Unit,
    onEmailChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onMfaCodeChange: (String) -> Unit,
    onSignIn: () -> Unit,
    onVerifyMfa: () -> Unit,
    onConfirmBind: () -> Unit,
    onCancel: () -> Unit,
) {
    val p = if (darkTheme) DarkLogin else LightLogin
    SystemBarsColor(p)

    val enter = remember(step) { Animatable(0f) }
    LaunchedEffect(step) { enter.animateTo(1f, tween(400, easing = LinearOutSlowInEasing)) }
    val shake = remember { Animatable(0f) }
    LaunchedEffect(error) {
        if (error != null) {
            shake.snapTo(0f)
            shake.animateTo(
                targetValue = 0f,
                animationSpec = keyframes {
                    durationMillis = 480
                    -12f at 58
                    12f at 115
                    -10f at 173
                    10f at 230
                    -6f at 288
                    6f at 346
                    -3f at 403
                    3f at 442
                },
            )
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        LoginSceneBackground(dark = darkTheme)
        Box(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .imePadding(),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Image(
                    painter = painterResource(id = R.drawable.pg_brand_gate),
                    contentDescription = null,
                    modifier = Modifier.size(44.dp),
                )
                Spacer(modifier = Modifier.size(12.dp))
                Text(
                    text = "PaymentGate",
                    color = p.title,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = (-0.4).sp,
                )
                Spacer(modifier = Modifier.weight(1f))
                ThemeToggle(p = p, darkTheme = darkTheme, onToggle = onToggleTheme)
            }

            Column(
                modifier = Modifier
                    .align(Alignment.Center)
                    .widthIn(max = 460.dp)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 28.dp, vertical = 72.dp)
                    .graphicsLayer {
                        alpha = enter.value
                        val s = 0.95f + 0.05f * enter.value
                        scaleX = s
                        scaleY = s
                        translationX = shake.value.dp.toPx()
                    },
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                when (step) {
                    SetupStep.Credentials -> CredentialsStep(p, email, password, loading, onEmailChange, onPasswordChange)
                    SetupStep.Mfa -> MfaStep(p, mfaCode, loading, onMfaCodeChange)
                    SetupStep.Confirm -> ConfirmStep(p, orgName, orgTypeLabel, orgIconKey)
                }

                AnimatedVisibility(
                    visible = !error.isNullOrBlank(),
                    enter = fadeIn() + expandVertically(),
                    exit = fadeOut() + shrinkVertically(),
                ) {
                    Text(
                        text = error.orEmpty(),
                        color = p.error,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                        textAlign = TextAlign.Center,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 16.dp),
                    )
                }

                Spacer(modifier = Modifier.height(24.dp))
                val (label, action, ready) =
                    when (step) {
                        SetupStep.Credentials ->
                            Triple("Sign in", onSignIn, email.isNotBlank() && password.isNotEmpty())
                        SetupStep.Mfa ->
                            Triple("Verify", onVerifyMfa, mfaCode.trim().length == 6)
                        SetupStep.Confirm ->
                            Triple("Set up this POS", onConfirmBind, orgName != null)
                    }
                GoldButton(
                    label = label,
                    showArrow = step == SetupStep.Credentials,
                    loading = loading,
                    enabled = !loading && ready,
                    onClick = action,
                )

                if (step == SetupStep.Credentials) {
                    Spacer(modifier = Modifier.height(18.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.Shield, null, tint = p.note, modifier = Modifier.size(15.dp))
                        Spacer(modifier = Modifier.size(6.dp))
                        Text("Owner or Admin only · one-time setup", color = p.note, fontSize = 13.sp)
                    }
                } else {
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = "Back to login",
                        color = if (loading) p.note else p.link,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .clickable(enabled = !loading, onClick = onCancel)
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun CredentialsStep(
    p: LoginPalette,
    email: String,
    password: String,
    loading: Boolean,
    onEmailChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
) {
    Heading(p, "Welcome", "Owner or Admin sign-in to set up this POS.")
    Spacer(modifier = Modifier.height(28.dp))
    var showPassword by remember { mutableStateOf(false) }
    LoginField(
        p = p,
        label = "Email address",
        value = email,
        onValueChange = onEmailChange,
        placeholder = "you@company.com",
        icon = Icons.Outlined.Email,
        enabled = !loading,
        keyboardType = KeyboardType.Email,
    )
    Spacer(modifier = Modifier.height(16.dp))
    LoginField(
        p = p,
        label = "Password",
        value = password,
        onValueChange = onPasswordChange,
        placeholder = "Enter your password",
        icon = Icons.Outlined.Lock,
        enabled = !loading,
        keyboardType = KeyboardType.Password,
        visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
        trailing = { focused ->
            Icon(
                imageVector = if (showPassword) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                contentDescription = if (showPassword) "Hide password" else "Show password",
                tint = if (focused) FocusTeal.copy(alpha = 0.8f) else p.placeholder,
                modifier = Modifier
                    .clip(CircleShape)
                    .clickable { showPassword = !showPassword }
                    .padding(8.dp)
                    .size(20.dp),
            )
        },
    )
}

@Composable
private fun MfaStep(p: LoginPalette, code: String, loading: Boolean, onCodeChange: (String) -> Unit) {
    Box(
        modifier = Modifier
            .size(56.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(p.gold.copy(alpha = 0.14f))
            .border(1.dp, p.gold.copy(alpha = 0.35f), RoundedCornerShape(16.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Outlined.Shield, null, tint = p.gold, modifier = Modifier.size(28.dp))
    }
    Spacer(modifier = Modifier.height(18.dp))
    Heading(p, "Two-Factor Auth", "Enter the 6-digit code from your authenticator app.")
    Spacer(modifier = Modifier.height(28.dp))
    BasicTextField(
        value = code,
        onValueChange = { v -> onCodeChange(v.filter { it.isDigit() }.take(6)) },
        enabled = !loading,
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        textStyle = TextStyle(color = Color.Transparent),
        cursorBrush = SolidColor(Color.Transparent),
        decorationBox = { inner ->
            Box {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
                ) {
                    repeat(6) { i -> MfaSlot(p, index = i, digit = code.getOrNull(i), focus = i == code.length) }
                }
                Box(modifier = Modifier.size(1.dp)) { inner() }
            }
        },
    )
}

/** `.login-mfa-slot` — pops in 300 ms, staggered 60 ms per slot. */
@Composable
private fun MfaSlot(p: LoginPalette, index: Int, digit: Char?, focus: Boolean) {
    val appear = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        delay(index * 60L)
        appear.animateTo(1f, tween(300, easing = LinearOutSlowInEasing))
    }
    val strong = digit != null || focus
    Box(
        modifier = Modifier
            .graphicsLayer {
                alpha = appear.value
                val s = 0.9f + 0.1f * appear.value
                scaleX = s
                scaleY = s
            }
            .size(width = 48.dp, height = 56.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(p.inputBg)
            .border(
                width = if (strong) 2.dp else 1.dp,
                color = if (strong) p.gold else p.inputBorder,
                shape = RoundedCornerShape(10.dp),
            ),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = digit?.toString() ?: "",
            color = p.text,
            fontSize = 22.sp,
            fontWeight = FontWeight.SemiBold,
            fontFamily = FontFamily.Monospace,
        )
    }
}

@Composable
private fun ConfirmStep(p: LoginPalette, orgName: String?, orgTypeLabel: String?, orgIconKey: String?) {
    Heading(p, "Confirm POS", "This POS will charge for:")
    Spacer(modifier = Modifier.height(24.dp))
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(p.inputBg)
            .border(1.dp, p.inputBorder, RoundedCornerShape(14.dp))
            .padding(18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (orgName != null) {
            OrgBrandMark(iconKey = orgIconKey, size = 44.dp)
        } else {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(p.accent.copy(alpha = 0.12f))
                    .border(1.dp, p.accent.copy(alpha = 0.22f), RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Outlined.Storefront, null, tint = p.accent, modifier = Modifier.size(24.dp))
            }
        }
        Spacer(modifier = Modifier.size(14.dp))
        Column(modifier = Modifier.weight(1f)) {
            if (orgName == null) {
                CircularProgressIndicator(color = p.accent, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
            } else {
                Text(orgName, color = p.title, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            }
            if (orgTypeLabel != null) {
                Spacer(modifier = Modifier.height(2.dp))
                Text(orgTypeLabel, color = p.muted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }
        }
    }
    Spacer(modifier = Modifier.height(14.dp))
    Text(
        text = "After setup, its staff unlock this POS with their PIN.",
        color = p.muted,
        fontSize = 13.sp,
        textAlign = TextAlign.Center,
    )
}

@Composable
private fun Heading(p: LoginPalette, title: String, subtitle: String) {
    Text(
        text = title,
        color = p.title,
        fontSize = 32.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = (-0.9).sp,
        textAlign = TextAlign.Center,
    )
    Spacer(modifier = Modifier.height(10.dp))
    Text(text = subtitle, color = p.muted, fontSize = 14.sp, textAlign = TextAlign.Center)
}

/**
 * `.login-input-shell` — solid border at rest; on focus a 2 dp teal→gold gradient ring that
 * drifts back and forth (2.8 s, like `login-focus-gradient`).
 */
@Composable
private fun LoginField(
    p: LoginPalette,
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    icon: ImageVector,
    enabled: Boolean,
    keyboardType: KeyboardType,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    trailing: (@Composable (focused: Boolean) -> Unit)? = null,
) {
    var focused by remember { mutableStateOf(false) }
    var widthPx by remember { mutableStateOf(1f) }
    val drift by rememberInfiniteTransition(label = "focus-ring").animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(1400, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "focus-drift",
    )
    val shape = RoundedCornerShape(10.dp)
    val ring =
        Brush.linearGradient(
            colorStops = arrayOf(
                0f to FocusTeal.copy(alpha = 0.95f),
                0.38f to FocusTeal.copy(alpha = 0.18f),
                0.68f to FocusGold.copy(alpha = 0.7f),
                1f to FocusTeal.copy(alpha = 0.12f),
            ),
            start = Offset(-drift * widthPx, 0f),
            end = Offset((2f - drift) * widthPx, widthPx * 0.7f),
        )

    Column(modifier = Modifier.fillMaxWidth()) {
        Text(label, color = p.muted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        Spacer(modifier = Modifier.height(8.dp))
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            enabled = enabled,
            singleLine = true,
            visualTransformation = visualTransformation,
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            textStyle = TextStyle(color = if (enabled) p.text else p.muted, fontSize = 16.sp),
            cursorBrush = SolidColor(p.accent),
            modifier = Modifier
                .fillMaxWidth()
                .onSizeChanged { widthPx = it.width.toFloat().coerceAtLeast(1f) }
                .onFocusChanged { focused = it.isFocused },
            decorationBox = { inner ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(54.dp)
                        .clip(shape)
                        .background(p.inputBg)
                        .then(
                            if (focused) Modifier.border(2.dp, ring, shape)
                            else Modifier.border(1.dp, p.inputBorder, shape),
                        )
                        .padding(start = 14.dp, end = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        icon,
                        null,
                        tint = if (focused) FocusTeal.copy(alpha = 0.85f) else p.placeholder,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(modifier = Modifier.size(12.dp))
                    Box(modifier = Modifier.weight(1f)) {
                        if (value.isEmpty()) {
                            Text(placeholder, color = p.placeholder, fontSize = 16.sp)
                        }
                        inner()
                    }
                    trailing?.invoke(focused)
                }
            },
        )
    }
}

@Composable
private fun GoldButton(
    label: String,
    showArrow: Boolean,
    loading: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val shape = RoundedCornerShape(12.dp)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(54.dp)
            .graphicsLayer {
                val s = if (pressed) 0.98f else 1f
                scaleX = s
                scaleY = s
            }
            .shadow(
                elevation = if (pressed) 4.dp else 10.dp,
                shape = shape,
                ambientColor = Color(0xFFEAB308),
                spotColor = Color(0xFFEAB308),
            )
            .clip(shape)
            .background(GoldGradient)
            .clickable(interactionSource = interaction, indication = null, enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        AnimatedContent(
            targetState = loading,
            transitionSpec = { fadeIn(tween(PosMotion.Fast)) togetherWith fadeOut(tween(PosMotion.Fast)) },
            label = "setup-busy",
        ) { busy ->
            if (busy) {
                CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp, color = SubmitInk)
            } else {
                Text(
                    text = if (showArrow) "$label  →" else label,
                    color = SubmitInk,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

@Composable
private fun ThemeToggle(p: LoginPalette, darkTheme: Boolean, onToggle: () -> Unit) {
    Box(
        modifier = Modifier
            .size(40.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(p.toggleBg)
            .border(1.dp, p.toggleBorder, RoundedCornerShape(10.dp))
            .clickable(onClick = onToggle),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = if (darkTheme) Icons.Outlined.LightMode else Icons.Outlined.DarkMode,
            contentDescription = if (darkTheme) "Light mode" else "Dark mode",
            tint = p.muted,
            modifier = Modifier.size(20.dp),
        )
    }
}

/** Match the system bars to the hero gradient ends; restore on leave. */
@Composable
private fun SystemBarsColor(p: LoginPalette) {
    val view = LocalView.current
    if (view.isInEditMode) return
    DisposableEffect(p) {
        val window = (view.context as Activity).window
        val insets = WindowCompat.getInsetsController(window, view)
        val prevStatus = window.statusBarColor
        val prevNav = window.navigationBarColor
        val prevLightStatus = insets.isAppearanceLightStatusBars
        val prevLightNav = insets.isAppearanceLightNavigationBars
        window.statusBarColor = p.barTop.toArgb()
        window.navigationBarColor = p.barBottom.toArgb()
        insets.isAppearanceLightStatusBars = !p.isDark
        insets.isAppearanceLightNavigationBars = !p.isDark
        onDispose {
            window.statusBarColor = prevStatus
            window.navigationBarColor = prevNav
            insets.isAppearanceLightStatusBars = prevLightStatus
            insets.isAppearanceLightNavigationBars = prevLightNav
        }
    }
}
