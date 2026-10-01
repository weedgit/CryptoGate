package com.paymentgate.cashier.hardware

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.Handler
import android.os.HandlerThread
import com.paymentgate.cashier.api.PosSound
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.min
import kotlin.math.sin

/**
 * Short synthesized tones on the media stream (hardware volume keys apply): a rising chime when
 * an order is paid, a falling two-tone alert on anomaly / expired / failed, a soft tick on create.
 */
class PosSoundPlayer {
    private val thread = HandlerThread("pos-sounds").apply { start() }
    private val handler = Handler(thread.looper)
    private val cache = HashMap<PosSound, ShortArray>()

    /** [level]: 0 = off, 1 low, 2 medium, 3 high. */
    fun play(sound: PosSound, level: Int) {
        if (level <= 0) return
        val gain = LEVEL_GAIN[level.coerceIn(1, 3)]
        handler.post {
            runCatching {
                val pcm = cache.getOrPut(sound) { synth(sound) }
                val track =
                    AudioTrack.Builder()
                        .setAudioAttributes(
                            AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_MEDIA)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                .build(),
                        )
                        .setAudioFormat(
                            AudioFormat.Builder()
                                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                                .setSampleRate(RATE)
                                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                                .build(),
                        )
                        .setTransferMode(AudioTrack.MODE_STATIC)
                        .setBufferSizeInBytes(pcm.size * 2)
                        .build()
                track.write(pcm, 0, pcm.size)
                track.setVolume(gain)
                track.play()
                handler.postDelayed({ track.release() }, pcm.size * 1000L / RATE + 200)
            }
        }
    }

    private fun synth(sound: PosSound): ShortArray =
        when (sound) {
            PosSound.Paid -> render(1.0, listOf(Note(1046.5, 0.0, 0.55), Note(1318.5, 0.11, 0.55), Note(1568.0, 0.22, 0.75)))
            PosSound.Problem -> render(0.65, listOf(Note(880.0, 0.0, 0.28, bright = true), Note(659.3, 0.24, 0.40, bright = true)))
            PosSound.Created -> render(0.12, listOf(Note(1975.5, 0.0, 0.09)), peak = 0.35)
        }

    private class Note(val freq: Double, val start: Double, val length: Double, val bright: Boolean = false)

    private fun render(seconds: Double, notes: List<Note>, peak: Double = 0.8): ShortArray {
        val out = DoubleArray((seconds * RATE).toInt())
        for (n in notes) {
            val from = (n.start * RATE).toInt()
            val to = min(out.size, ((n.start + n.length) * RATE).toInt())
            val third = if (n.bright) 0.25 else 0.08
            for (i in from until to) {
                val t = (i - from).toDouble() / RATE
                val attack = min(1.0, t / 0.004)
                val decay = exp(-t / (n.length / 4.5))
                val w = 2 * PI * n.freq * t
                out[i] += attack * decay * (sin(w) + 0.35 * sin(2 * w) + third * sin(3 * w))
            }
        }
        val max = out.maxOf { kotlin.math.abs(it) }.coerceAtLeast(1e-9)
        return ShortArray(out.size) { (out[it] / max * peak * Short.MAX_VALUE).toInt().toShort() }
    }

    private companion object {
        const val RATE = 44_100
        val LEVEL_GAIN = floatArrayOf(0f, 0.3f, 0.6f, 1f)
    }
}
