import { createServer } from "node:http";
import { closePool } from "./db/pool.mjs";
import { handleRequest } from "./http/app.mjs";
import { startOrderExpiryJob } from "./orders/order-expiry-job.mjs";
import { startServiceBillOverdueJob } from "./service-bills/service-bill-overdue-job.mjs";
import { startDailyServiceBillInvoiceJob } from "./service-bills/daily-invoice-job.mjs";
import { startDailyAgentCommissionInvoiceJob } from "./commercial/daily-commission-invoice-job.mjs";
import { startWebhookDeliveryJob } from "./webhooks/webhook-delivery-job.mjs";
import { startInvoiceExportJob } from "./orders/order-export-job.mjs";
import { startOrderRetentionPurgeJob } from "./retention/order-retention-purge-job.mjs";
import { startAuditArchiveJob } from "./retention/audit-archive-job.mjs";
import { startRateRefreshJob } from "./rates/rate-refresh-job.mjs";
import { assertWatchOnlyEnv } from "./security/spend-material.mjs";
import { ensureDefaultFeeTierBands } from "./platform-settings/fee-tier-store.mjs";
import { assertPosPinPepperEnv } from "./auth/pos-pin-hash.mjs";

assertWatchOnlyEnv();
assertPosPinPepperEnv();

/**
 * HTTP entry. Background: order expiry (M2-14), service bill overdue + daily
 * invoices, agent commission day-C invoices, webhook fan-out + delivery (M3-14),
 * invoice CSV export jobs, order retention purge, audit hot→archive, FX rate refresh.
 */

const host = process.env.API_HOST ?? "0.0.0.0";
const port = Number(process.env.API_PORT ?? 3000);

const server = createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ code: "internal_error", message: "Internal error" }));
    }
    if (process.env.NODE_ENV !== "test") {
      console.error(err);
    }
  });
});

/** @type {{ stop: () => void } | null} */
let expiryJob = null;
/** @type {{ stop: () => void } | null} */
let webhookJob = null;
/** @type {{ stop: () => void } | null} */
let invoiceExportJob = null;
/** @type {{ stop: () => void } | null} */
let serviceBillOverdueJob = null;
/** @type {{ stop: () => void } | null} */
let dailyServiceBillInvoiceJob = null;
/** @type {{ stop: () => void } | null} */
let dailyAgentCommissionInvoiceJob = null;
/** @type {{ stop: () => void } | null} */
let orderRetentionPurgeJob = null;
/** @type {{ stop: () => void } | null} */
let auditArchiveJob = null;
/** @type {{ stop: () => void } | null} */
let rateRefreshJob = null;

server.listen(port, host, () => {
  console.log(`paymentgate-api listening on http://${host}:${port}`);
  void ensureDefaultFeeTierBands().catch((err) => {
    console.error("[fee-tiers] failed to seed default tier bands:", err);
  });
  expiryJob = startOrderExpiryJob();
  serviceBillOverdueJob = startServiceBillOverdueJob();
  dailyServiceBillInvoiceJob = startDailyServiceBillInvoiceJob();
  dailyAgentCommissionInvoiceJob = startDailyAgentCommissionInvoiceJob();
  webhookJob = startWebhookDeliveryJob();
  invoiceExportJob = startInvoiceExportJob();
  orderRetentionPurgeJob = startOrderRetentionPurgeJob();
  rateRefreshJob = startRateRefreshJob();
  void import("./retention/audit-archive.mjs")
    .then(async ({ ensureAuditArchiveSchema }) => {
      await ensureAuditArchiveSchema();
      auditArchiveJob = startAuditArchiveJob();
    })
    .catch((err) => {
      console.error("[retention] failed to start audit archive job:", err);
    });
});

function shutdown() {
  expiryJob?.stop();
  expiryJob = null;
  serviceBillOverdueJob?.stop();
  serviceBillOverdueJob = null;
  dailyServiceBillInvoiceJob?.stop();
  dailyServiceBillInvoiceJob = null;
  dailyAgentCommissionInvoiceJob?.stop();
  dailyAgentCommissionInvoiceJob = null;
  webhookJob?.stop();
  webhookJob = null;
  invoiceExportJob?.stop();
  invoiceExportJob = null;
  orderRetentionPurgeJob?.stop();
  orderRetentionPurgeJob = null;
  auditArchiveJob?.stop();
  auditArchiveJob = null;
  rateRefreshJob?.stop();
  rateRefreshJob = null;
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
  // Keep-alive sockets and dashboard SSE streams never end on their own.
  server.closeIdleConnections?.();
  setTimeout(() => server.closeAllConnections?.(), SHUTDOWN_DRAIN_MS).unref();
  setTimeout(() => process.exit(0), SHUTDOWN_FORCE_EXIT_MS).unref();
}

const SHUTDOWN_DRAIN_MS = 3_000;
const SHUTDOWN_FORCE_EXIT_MS = 10_000;

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);