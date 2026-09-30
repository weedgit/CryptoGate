package com.paymentgate.cashier.ui

import android.graphics.Paint as TextPaint
import android.graphics.Typeface
import android.provider.Settings
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.platform.LocalContext
import androidx.compose.runtime.withFrameNanos
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * Compose port of the web login hero (`LoginSceneBg.tsx` + `05-login.css`): breathing sun with
 * rotating rays, colour glows, flowing gradient waves with chain coins riding them, and drifting
 * linked block shapes. Frozen at t = 0 when system animations are off.
 */
@Composable
fun LoginSceneBackground(dark: Boolean, modifier: Modifier = Modifier) {
    val s = if (dark) DarkScene else LightScene
    val context = LocalContext.current
    val animate = remember {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0f
    }
    val time by produceState(0f, animate) {
        if (!animate) return@produceState
        val start = withFrameNanos { it }
        while (true) {
            withFrameNanos { value = (it - start) / 1_000_000_000f }
        }
    }
    val coins = remember { CoinArt() }

    Box(modifier = modifier.fillMaxSize()) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val t = time
            drawHeroGradient(s)
            drawSun(s, t)
            drawGlow(s)
            val vs = max(size.width / VIEW_W, size.height / VIEW_H)
            val ox = (size.width - VIEW_W * vs) / 2f
            val oy = (size.height - VIEW_H * vs) / 2f
            withTransform({
                translate(ox, oy)
                scale(vs, vs, pivot = Offset.Zero)
            }) {
                drawBlocks(s, t)
                if (size.width >= size.height) {
                    drawWaves(s, t)
                    drawCoins(s, t, coins)
                }
            }
            if (size.width < size.height) {
                // Portrait: keep the wave band under the form, in the bottom of the screen.
                val ws = size.width / 800f
                withTransform({
                    translate(size.width / 2f - 600f * ws, size.height * 0.87f - 704f * ws)
                    scale(ws, ws, pivot = Offset.Zero)
                }) {
                    drawWaves(s, t)
                    drawCoins(s, t, coins)
                }
            }
        }
    }
}

private data class SceneColors(
    val heroStops: Array<Pair<Float, Color>>,
    val waveA: Color,
    val waveB: Color,
    val sunCore: Array<Pair<Float, Color>>,
    val ray: Color,
    val glowLinear: Array<Pair<Float, Color>>,
    val glowA: Color,
    val glowB: Color,
    val glowC: Color,
    val haloOpacity: Float,
    val blockFill: Color,
    val blockOpacity: Float,
    val linkOpacity: Float,
    val coinHaloOpacity: Float,
    val coinShadow: Color,
    val coinOpacity: Float,
)

private val DarkScene = SceneColors(
    heroStops = arrayOf(
        0f to Color(0xFF0B1A33), 0.40f to Color(0xFF031428), 0.72f to Color(0xFF001425), 1f to Color(0xFF00161F),
    ),
    waveA = Color(0xFFF5C542),
    waveB = Color(0xFF2DD4BF),
    sunCore = arrayOf(
        0f to Color(255, 234, 170, 64), 0.16f to Color(255, 210, 120, 41), 0.34f to Color(250, 176, 88, 22),
        0.54f to Color(245, 146, 76, 9), 0.66f to Color(245, 140, 70, 3), 0.76f to Color.Transparent,
    ),
    ray = Color(255, 214, 130, 15),
    glowLinear = arrayOf(0f to Color(255, 196, 108, 20), 0.30f to Color(251, 146, 60, 9), 0.60f to Color.Transparent),
    glowA = Color(244, 114, 82, 9),
    glowB = Color(245, 197, 66, 26),
    glowC = Color(45, 212, 191, 23),
    haloOpacity = 0.35f,
    blockFill = Color(245, 197, 66, 4),
    blockOpacity = 0.14f,
    linkOpacity = 0.09f,
    coinHaloOpacity = 0.6f,
    coinShadow = Color(0x80000510),
    coinOpacity = 0.72f,
)

private val LightScene = SceneColors(
    heroStops = arrayOf(
        0f to Color(0xFFF3F8FF), 0.24f to Color(0xFFEEF3FE), 0.50f to Color(0xFFF1F2FD),
        0.74f to Color(0xFFEBF5FB), 1f to Color(0xFFE5F5F1),
    ),
    waveA = Color(0xFFE39A0B),
    waveB = Color(0xFF0D9488),
    sunCore = arrayOf(
        0f to Color.White, 0.12f to Color(240, 249, 255, 217), 0.28f to Color(186, 230, 253, 115),
        0.48f to Color(165, 180, 252, 41), 0.68f to Color.Transparent,
    ),
    ray = Color(125, 211, 252, 51),
    glowLinear = arrayOf(0f to Color(186, 230, 253, 89), 0.30f to Color(165, 180, 252, 31), 0.58f to Color.Transparent),
    glowA = Color(129, 140, 248, 15),
    glowB = Color(245, 180, 40, 31),
    glowC = Color(20, 184, 166, 26),
    haloOpacity = 0.2f,
    blockFill = Color(227, 154, 11, 8),
    blockOpacity = 0.22f,
    linkOpacity = 0.16f,
    coinHaloOpacity = 0.25f,
    coinShadow = Color(0x201E3A5F),
    coinOpacity = 0.68f,
)

private const val VIEW_W = 1200f
private const val VIEW_H = 900f

// --- Sun + glow (screen space, like the CSS layers) -------------------------------

/** `linear-gradient(172deg, …)` — CSS gradient line through the centre, 8° off vertical. */
private fun DrawScope.drawHeroGradient(s: SceneColors) {
    val rad = Math.toRadians(172.0)
    val dx = sin(rad).toFloat()
    val dy = -cos(rad).toFloat()
    val half = (abs(size.width * dx) + abs(size.height * dy)) / 2f
    val c = Offset(size.width / 2f, size.height / 2f)
    drawRect(
        brush = Brush.linearGradient(
            colorStops = s.heroStops,
            start = Offset(c.x - dx * half, c.y - dy * half),
            end = Offset(c.x + dx * half, c.y + dy * half),
        ),
    )
}

/**
 * Web sizes are CSS px on a ~840 px-wide hero (core Ø920, rays Ø1600); scaled to this width so the
 * sun covers the same share of the screen.
 */
private fun DrawScope.drawSun(s: SceneColors, t: Float) {
    val center = Offset(size.width * 0.86f, -size.height * 0.03f)
    val unit = size.width / 840f
    val phase = (sin(t * 2f * PI.toFloat() / 18f - PI.toFloat() / 2f) + 1f) / 2f
    val breathe = 0.96f + 0.09f * phase
    val coreR = 460f * unit * breathe
    drawCircle(
        brush = Brush.radialGradient(colorStops = s.sunCore, center = center, radius = coreR),
        radius = coreR,
        center = center,
        alpha = 0.8f + 0.2f * phase,
    )
    val rayR = 800f * unit
    val fade = Brush.radialGradient(
        colorStops = arrayOf(
            0f to Color.Transparent,
            0.04f to Color.Transparent,
            0.13f to Color.Black,
            0.30f to Color.Black.copy(alpha = 0.4f),
            0.56f to Color.Transparent,
        ),
        center = center,
        radius = rayR,
    )
    // Two soft ray fans turning opposite ways; angular gradients give feathered edges like the web's blur.
    drawIntoCanvas { canvas ->
        canvas.saveLayer(Rect(Offset.Zero, size), Paint())
        rotate(degrees = t * 360f / 160f, pivot = center) {
            drawCircle(softRays(s.ray, RAYS_MAIN, 1f, center), radius = rayR, center = center)
        }
        rotate(degrees = 9f - t * 360f / 240f, pivot = center) {
            drawCircle(softRays(s.ray, RAYS_SHIMMER, 0.55f, center), radius = rayR, center = center)
        }
        drawCircle(fade, radius = rayR, center = center, blendMode = BlendMode.DstIn)
        canvas.restore()
    }
}

/** Relative strength of each ray (uneven, so the fan looks natural). */
private val RAYS_MAIN = floatArrayOf(0.9f, 0.45f, 1f, 0.6f, 0.3f, 0.85f, 0.5f, 1f, 0.4f, 0.7f, 0.95f, 0.35f, 0.65f, 0.8f, 0.45f, 1f, 0.55f, 0.3f, 0.75f, 0.6f)
private val RAYS_SHIMMER = floatArrayOf(0.6f, 1f, 0.4f, 0.8f, 0.5f, 0.9f, 0.3f, 0.7f, 1f, 0.45f, 0.65f, 0.85f)

private fun softRays(ray: Color, strengths: FloatArray, gain: Float, center: Offset): Brush {
    val n = strengths.size
    val step = 1f / n
    val stops = ArrayList<Pair<Float, Color>>(n * 3 + 1)
    for (k in 0 until n) {
        val a = k * step
        stops += a to Color.Transparent
        stops += (a + step * 0.3f) to ray.copy(alpha = ray.alpha * strengths[k] * gain)
        stops += (a + step * 0.62f) to Color.Transparent
    }
    stops += 1f to Color.Transparent
    return Brush.sweepGradient(*stops.toTypedArray(), center = center)
}

private fun DrawScope.ellipseGlow(cx: Float, cy: Float, rx: Float, ry: Float, color: Color) {
    val c = Offset(size.width * cx, size.height * cy)
    scale(scaleX = 1f, scaleY = (ry * size.height) / (rx * size.width), pivot = c) {
        val r = rx * size.width
        drawCircle(
            brush = Brush.radialGradient(0f to color, 1f to Color.Transparent, center = c, radius = r),
            radius = r,
            center = c,
        )
    }
}

private fun DrawScope.drawGlow(s: SceneColors) {
    drawRect(
        brush = Brush.linearGradient(
            colorStops = s.glowLinear,
            start = Offset(size.width, 0f),
            end = Offset(size.width * 0.58f, size.height),
        ),
    )
    // CSS `radial-gradient(ellipse RX% RY% at X% Y%, color, transparent 70%)`.
    ellipseGlow(0.55f, 0.38f, 0.70f * 0.7f, 0.45f * 0.7f, s.glowA)
    ellipseGlow(0.30f, 0.68f, 0.60f * 0.7f, 0.40f * 0.7f, s.glowB)
    ellipseGlow(0.78f, 0.58f, 0.55f * 0.7f, 0.40f * 0.7f, s.glowC)
}

// --- Waves (view-box space) ---------------------------------------------------------

private val WAVE_Y = floatArrayOf(590f, 628f, 666f, 704f, 742f, 780f, 818f)
private val WAVE_W = floatArrayOf(1.6f, 1.2f, 1f, 0.9f, 0.8f, 0.7f, 0.6f)
private val WAVE_O = floatArrayOf(0.9f, 0.7f, 0.55f, 0.42f, 0.32f, 0.24f, 0.18f)
private const val X_START = -100f
private const val X_END = 1300f
private const val SPAN = X_END - X_START

private fun waveY(i: Int, x: Float, t: Float): Float {
    val lag = i * 0.35f
    return WAVE_Y[i] +
        70f * sin(x * 0.0055f - t * 0.45f + lag) +
        28f * sin(x * 0.011f + t * 0.3f + lag * 1.7f) +
        12f * sin(x * 0.019f - t * 0.8f + lag * 0.6f)
}

private fun wavePath(i: Int, t: Float): Path {
    val path = Path()
    var x = X_START
    path.moveTo(x, waveY(i, x, t))
    x += 25f
    while (x <= X_END) {
        val y = waveY(i, x, t)
        val nx = x + 25f
        if (nx > X_END) {
            path.lineTo(x, y)
        } else {
            val ny = waveY(i, nx, t)
            path.quadraticBezierTo(x, y, (x + nx) / 2f, (y + ny) / 2f)
        }
        x = nx
    }
    return path
}

private fun waveBrush(s: SceneColors) =
    Brush.horizontalGradient(
        0f to s.waveA.copy(alpha = 0f),
        0.25f to s.waveA,
        0.60f to s.waveB,
        1f to s.waveB.copy(alpha = 0f),
        startX = X_START,
        endX = X_END,
    )

private fun DrawScope.drawWaves(s: SceneColors, t: Float) {
    val brush = waveBrush(s)
    val first = wavePath(0, t)
    drawPath(first, brush, alpha = s.haloOpacity * 0.35f, style = Stroke(width = 22f, cap = StrokeCap.Round))
    drawPath(first, brush, alpha = s.haloOpacity * 0.6f, style = Stroke(width = 10f, cap = StrokeCap.Round))
    for (i in WAVE_Y.indices) {
        val path = if (i == 0) first else wavePath(i, t)
        drawPath(path, brush, alpha = WAVE_O[i], style = Stroke(width = WAVE_W[i], cap = StrokeCap.Round))
    }
}

// --- Blocks ---------------------------------------------------------------------------

private class Shape(val cube: Boolean, val x: Float, val y: Float, val r: Float, val spin: Float, val phase: Float)

private val SHAPES = listOf(
    Shape(true, 860f, 170f, 34f, 6f, 0f),
    Shape(false, 1010f, 300f, 22f, -9f, 1.3f),
    Shape(true, 760f, 360f, 24f, 8f, 2.1f),
    Shape(false, 560f, 250f, 16f, 12f, 3.4f),
    Shape(true, 330f, 400f, 20f, -7f, 4.2f),
    Shape(false, 1120f, 120f, 14f, 10f, 5.1f),
)
private val LINKS = listOf(0 to 1, 0 to 2, 2 to 3, 3 to 4, 1 to 5)

private fun shapePos(i: Int, t: Float): Offset {
    val s = SHAPES[i]
    return Offset(s.x + 14f * sin(t * 0.25f + s.phase), s.y + 18f * sin(t * 0.4f + s.phase * 1.3f))
}

private fun hexPath(r: Float): Path =
    Path().apply {
        for (k in 0 until 6) {
            val a = (PI / 3.0 * k - PI / 2.0)
            val px = (r * cos(a)).toFloat()
            val py = (r * sin(a)).toFloat()
            if (k == 0) moveTo(px, py) else lineTo(px, py)
        }
        close()
    }

private fun DrawScope.drawBlocks(s: SceneColors, t: Float) {
    val dash = PathEffect.dashPathEffect(floatArrayOf(3f, 6f))
    for ((a, b) in LINKS) {
        drawLine(
            color = s.waveB,
            start = shapePos(a, t),
            end = shapePos(b, t),
            strokeWidth = 0.7f,
            pathEffect = dash,
            alpha = s.linkOpacity,
        )
    }
    SHAPES.forEachIndexed { i, shape ->
        val pos = shapePos(i, t)
        val angle = shape.spin * t + shape.phase * 20f
        val grad = Brush.linearGradient(
            listOf(s.waveA, s.waveB),
            start = Offset(-shape.r, -shape.r),
            end = Offset(shape.r, shape.r),
        )
        translate(pos.x, pos.y) {
            rotate(angle, pivot = Offset.Zero) {
                val hex = hexPath(shape.r)
                drawPath(hex, s.blockFill)
                drawPath(hex, grad, alpha = s.blockOpacity, style = Stroke(width = 1f, join = StrokeJoin.Round))
                if (shape.cube) {
                    val r = shape.r
                    val cube = Path().apply {
                        moveTo(0f, 0f); lineTo(0f, r)
                        moveTo(0f, 0f); lineTo(-r * 0.866f, -r / 2f)
                        moveTo(0f, 0f); lineTo(r * 0.866f, -r / 2f)
                    }
                    drawPath(cube, grad, alpha = s.blockOpacity, style = Stroke(width = 1f))
                }
            }
        }
    }
}

// --- Coins ----------------------------------------------------------------------------

private enum class CoinId { Usdt, Usdc, Eth, Trx, Sol }

private class Coin(val id: CoinId, val wave: Int, val x0: Float, val speed: Float, val size: Float, val lift: Float)

private val COINS = listOf(
    Coin(CoinId.Usdt, 0, 120f, 38f, 1.5f, 26f),
    Coin(CoinId.Trx, 0, 470f, 38f, 1.3f, 26f),
    Coin(CoinId.Eth, 0, 820f, 38f, 1.3f, 26f),
    Coin(CoinId.Sol, 1, 480f, 32f, 1.2f, 24f),
    Coin(CoinId.Usdc, 1, 1180f, 32f, 1.2f, 24f),
    Coin(CoinId.Trx, 2, 1100f, 27f, 1.05f, 22f),
    Coin(CoinId.Usdc, 2, 260f, 27f, 1.05f, 22f),
    Coin(CoinId.Eth, 2, 680f, 27f, 1.05f, 22f),
    Coin(CoinId.Sol, 3, 150f, 24f, 0.95f, 21f),
    Coin(CoinId.Usdt, 3, 850f, 24f, 0.95f, 21f),
    Coin(CoinId.Usdt, 4, 700f, 21f, 0.9f, 20f),
    Coin(CoinId.Eth, 5, 40f, 17f, 0.8f, 18f),
    Coin(CoinId.Trx, 6, 400f, 15f, 0.7f, 16f),
)

private fun svg(d: String): Path = PathParser().parsePathString(d).toPath()

/** Coin glyphs from the web SVG `<defs>`, parsed once. */
private class CoinArt {
    val usdtT = svg("M-11 -12h22v5.5h-8V13h-6V-6.5h-8z")
    val usdcArcs = svg("M-6 -14.5A15.5 15.5 0 0 0 -6 14.5M6 -14.5A15.5 15.5 0 0 1 6 14.5")
    val ethTop = svg("M0 -15L9 0.5L0 5.5L-9 0.5Z")
    val ethTopR = svg("M0 -15L9 0.5L0 5.5Z")
    val ethBot = svg("M0 7.5L9 2.5L0 15L-9 2.5Z")
    val ethBotR = svg("M0 7.5L9 2.5L0 15Z")
    val trx = svg("M-12 -11L13 -5L-1 14ZM-12 -11L3 2L13 -5M3 2L-1 14")
    val sol = svg("M-9 -10H13L9 -5.5H-13Z M-13 -2.25H9L13 2.25H-9Z M-9 5.5H13L9 10H-13Z")
    val dollar = TextPaint(TextPaint.ANTI_ALIAS_FLAG).apply {
        color = android.graphics.Color.WHITE
        textSize = 21f
        textAlign = TextPaint.Align.CENTER
        typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
    }
}

private val SHINE = Brush.radialGradient(
    0f to Color.White.copy(alpha = 0.45f),
    0.55f to Color.White.copy(alpha = 0.06f),
    1f to Color.Black.copy(alpha = 0.25f),
    center = Offset(-7.9f, -9.7f),
    radius = 35.2f,
)
private val SOL_GRAD = Brush.linearGradient(
    listOf(Color(0xFF9945FF), Color(0xFF14F195)),
    start = Offset(-13f, 10f),
    end = Offset(13f, -10f),
)

private fun DrawScope.coinFace(color: Color) {
    drawCircle(color, radius = 22f, center = Offset.Zero)
    drawCircle(SHINE, radius = 22f, center = Offset.Zero)
    drawCircle(Color.White.copy(alpha = 0.28f), radius = 19.5f, center = Offset.Zero, style = Stroke(width = 1f))
}

private fun DrawScope.drawCoinGlyph(id: CoinId, art: CoinArt) {
    val white = Color.White
    when (id) {
        CoinId.Usdt -> {
            coinFace(Color(0xFF26A17B))
            drawPath(art.usdtT, white)
            drawOval(white, topLeft = Offset(-12f, -3.4f), size = Size(24f, 6.8f), style = Stroke(width = 2.2f))
        }
        CoinId.Usdc -> {
            coinFace(Color(0xFF2775CA))
            drawPath(art.usdcArcs, white, style = Stroke(width = 2f, cap = StrokeCap.Round))
            drawContext.canvas.nativeCanvas.drawText("$", 0f, 7.5f, art.dollar)
        }
        CoinId.Eth -> {
            coinFace(Color(0xFF627EEA))
            val light = Color(0xFFC9D3F8)
            drawPath(art.ethTop, white)
            drawPath(art.ethTopR, light)
            drawPath(art.ethBot, white)
            drawPath(art.ethBotR, light)
        }
        CoinId.Trx -> {
            coinFace(Color(0xFFEB0029))
            drawPath(art.trx, white, style = Stroke(width = 2.2f, join = StrokeJoin.Round))
        }
        CoinId.Sol -> {
            coinFace(Color(0xFF14161F))
            drawPath(art.sol, SOL_GRAD)
        }
    }
}

/** Coins sit behind the form: brand colours kept, slightly softened so they don't compete. */
private val COIN_MUTE = ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(0.85f) })

private fun DrawScope.drawCoins(s: SceneColors, t: Float, art: CoinArt) {
    val halo = Brush.radialGradient(
        0f to s.waveA.copy(alpha = 0.35f),
        1f to s.waveA.copy(alpha = 0f),
        center = Offset.Zero,
        radius = 36f,
    )
    COINS.forEachIndexed { i, c ->
        val x = X_START + (((c.x0 + c.speed * t - X_START) % SPAN) + SPAN) % SPAN
        val y = waveY(c.wave, x, t) - c.lift * c.size
        val slope = (waveY(c.wave, x + 4f, t) - waveY(c.wave, x - 4f, t)) / 8f
        val tilt = (atan(slope) * 180f / PI.toFloat()) * 0.7f
        val flip = 0.25f + 0.75f * abs(cos(t * 0.9f + i * 1.7f))
        val edge = min(x - X_START, X_END - x)
        val fade = (edge / 160f).coerceIn(0f, 1f)
        val opacity = fade * min(1f, 0.35f + 0.5f * c.size)
        if (opacity <= 0.01f) return@forEachIndexed
        val layerPaint = Paint().apply {
            alpha = opacity * s.coinOpacity
            colorFilter = COIN_MUTE
        }
        drawContext.canvas.saveLayer(
            Rect(x - 60f * c.size, y - 60f * c.size, x + 60f * c.size, y + 60f * c.size),
            layerPaint,
        )
        withTransform({
            translate(x, y)
            rotate(tilt, pivot = Offset.Zero)
            scale(c.size * flip, c.size, pivot = Offset.Zero)
        }) {
            drawCircle(halo, radius = 36f, center = Offset.Zero, alpha = s.coinHaloOpacity)
            drawCircle(s.coinShadow, radius = 22f, center = Offset(0f, 5f))
            drawCoinGlyph(c.id, art)
        }
        drawContext.canvas.restore()
    }
}
