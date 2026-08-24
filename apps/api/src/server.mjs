/**
 * HTTP entry (M1-11 + M1-12). Auth: /v1/auth/login|logout|session|mfa/*
 */
import { createServer } from "node:http";
import { closePool } from "./db/pool.mjs";
import { handleRequest } from "./http/app.mjs";

const host = process.env.API_HOST ?? "0.0.0.0";
const port = Number(process.env.API_PORT ?? 3000);

const server = createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: "internal_error", message: "Internal error" }));
    }
    if (process.env.NODE_ENV !== "test") {
      console.error(err);
    }
  });
});

server.listen(port, host, () => {
  console.log(`cryptogate-api listening on http://${host}:${port}`);
});

function shutdown() {
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
