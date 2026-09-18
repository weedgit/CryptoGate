package com.paymentgate.cashier.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.paymentgate.cashier.api.OrderStatusUi

/**
 * V3 confirmation progress: Requested → Detected → Confirming n/N → Paid.
 * Prototype demos use 3 steps; production uses [requiredConfirmations] from the order.
 */
enum class ConfirmationPhase {
    Requested,
    Detected,
    Confirming,
    Paid,
    Anomaly,
    Expired,
    Other,
}

data class ConfirmationProgressModel(
    val phase: ConfirmationPhase,
    val confirmations: Int,
    val requiredConfirmations: Int,
    val title: String,
    val detail: String,
) {
    val progressFraction: Float
        get() =
            when (phase) {
                ConfirmationPhase.Requested -> 0.05f
                ConfirmationPhase.Detected -> 0.2f
                ConfirmationPhase.Confirming -> {
                    val req = requiredConfirmations.coerceAtLeast(1)
                    0.2f + 0.7f * (confirmations.toFloat() / req).coerceIn(0f, 1f)
                }
                ConfirmationPhase.Paid -> 1f
                else -> 0f
            }
}

fun confirmationProgress(
    status: String,
    confirmations: Int,
    requiredConfirmations: Int,
): ConfirmationProgressModel {
    val req = requiredConfirmations.coerceAtLeast(1)
    return when {
        OrderStatusUi.showsCompleted(status) ->
            ConfirmationProgressModel(
                phase = ConfirmationPhase.Paid,
                confirmations = confirmations.coerceAtLeast(req),
                requiredConfirmations = req,
                title = "Paid",
                detail = "Payment confirmed on-chain",
            )
        OrderStatusUi.isAnomaly(status) ->
            ConfirmationProgressModel(
                phase = ConfirmationPhase.Anomaly,
                confirmations = confirmations,
                requiredConfirmations = req,
                title = "Payment anomaly",
                detail = "Do not treat as completed",
            )
        status == OrderStatusUi.EXPIRED || status == OrderStatusUi.FAILED ->
            ConfirmationProgressModel(
                phase = ConfirmationPhase.Expired,
                confirmations = confirmations,
                requiredConfirmations = req,
                title = if (status == OrderStatusUi.EXPIRED) "Expired" else "Failed",
                detail = "Retry or create a new order",
            )
        status == OrderStatusUi.PENDING ->
            ConfirmationProgressModel(
                phase = ConfirmationPhase.Requested,
                confirmations = 0,
                requiredConfirmations = req,
                title = "Requested",
                detail = "Waiting for payment",
            )
        status == OrderStatusUi.VERIFYING || status == OrderStatusUi.CONFIRMED -> {
            if (confirmations <= 0) {
                ConfirmationProgressModel(
                    phase = ConfirmationPhase.Detected,
                    confirmations = 0,
                    requiredConfirmations = req,
                    title = "Detected",
                    detail = "Transaction found · not paid yet",
                )
            } else {
                ConfirmationProgressModel(
                    phase = ConfirmationPhase.Confirming,
                    confirmations = confirmations.coerceAtMost(req),
                    requiredConfirmations = req,
                    title = "Confirming · $confirmations/$req",
                    detail = "Confirmations $confirmations / $req",
                )
            }
        }
        else ->
            ConfirmationProgressModel(
                phase = ConfirmationPhase.Other,
                confirmations = confirmations,
                requiredConfirmations = req,
                title = OrderStatusUi.label(status),
                detail = "",
            )
    }
}

@Composable
fun ConfirmationProgressCard(
    model: ConfirmationProgressModel,
    asset: String,
    networkLabel: String,
    modifier: Modifier = Modifier,
) {
    val fraction by animateFloatAsState(
        targetValue = model.progressFraction,
        animationSpec = tween(PosMotion.Medium),
        label = "confirm-progress",
    )
    val accent =
        when (model.phase) {
            ConfirmationPhase.Paid -> Color(0xFF16A34A)
            ConfirmationPhase.Anomaly, ConfirmationPhase.Expired -> MaterialTheme.colorScheme.error
            else -> MaterialTheme.colorScheme.primary
        }

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp,
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "PAYMENT STATUS",
                fontFamily = FontFamily.Monospace,
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = model.title,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                color = accent,
            )
            if (model.detail.isNotBlank()) {
                Text(
                    text = model.detail,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(modifier = Modifier.height(12.dp))
            Box(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .height(8.dp)
                        .clip(RoundedCornerShape(99.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant),
            ) {
                Box(
                    modifier =
                        Modifier
                            .fillMaxWidth(fraction.coerceIn(0.02f, 1f))
                            .height(8.dp)
                            .clip(RoundedCornerShape(99.dp))
                            .background(accent),
                )
            }
            Spacer(modifier = Modifier.height(12.dp))
            val reachedDetected =
                model.phase == ConfirmationPhase.Detected ||
                    model.phase == ConfirmationPhase.Confirming ||
                    model.phase == ConfirmationPhase.Paid
            val reachedConfirming =
                model.phase == ConfirmationPhase.Confirming || model.phase == ConfirmationPhase.Paid
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                ProgressStep(
                    "Requested",
                    model.phase != ConfirmationPhase.Other &&
                        model.phase != ConfirmationPhase.Anomaly &&
                        model.phase != ConfirmationPhase.Expired,
                )
                ProgressStep("Detected", reachedDetected)
                ProgressStep("Confirming", reachedConfirming)
                ProgressStep("Paid", model.phase == ConfirmationPhase.Paid)
            }
            Spacer(modifier = Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = asset,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = networkLabel,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
    }
}

@Composable
private fun ProgressStep(label: String, active: Boolean) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            modifier =
                Modifier
                    .size(10.dp)
                    .clip(CircleShape)
                    .background(
                        if (active) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.outline,
                    ),
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = label,
            fontSize = 10.sp,
            color =
                if (active) MaterialTheme.colorScheme.onSurface
                else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
