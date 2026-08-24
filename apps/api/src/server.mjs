import { createServer } from "node:http";
import { closePool } from "./db/pool.mjs";
import { handleRequest } from "./http/app.mjs";
import { startOrderExpiryJob } from "./orders/order-expiry-job.mjs";
import { startWebhookDeliveryJob } from "./webhooks/webhook-delivery-job.mjs";

/**
 * HTTP entry. Background: order expiry (M2-14), webhook fan-out + delivery (M3-14).
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

server.listen(port, host, () => {
  console.log(`cryptogate-api listening on http://${host}:${port}`);
  expiryJob = startOrderExpiryJob();
  webhookJob = startWebhookDeliveryJob();
});

function shutdown() {
  expiryJob?.stop();
  expiryJob = null;
  webhookJob?.stop();
  webhookJob = null;
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
