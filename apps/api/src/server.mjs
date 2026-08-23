/**
 * Minimal HTTP entry (S0-07). Andrew adds auth/org/order routes in M1+.
 */
import { createServer } from "node:http";
import { getHealthPayload } from "./health-payload.mjs";
import { closePool } from "./db/pool.mjs";

const host = process.env.API_HOST ?? "0.0.0.0";
const port = Number(process.env.API_PORT ?? 3000);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function handleRequest(req, res) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    const payload = await getHealthPayload({ checkDb: true });
    const code = payload.status === "ok" ? 200 : 503;
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ service: "cryptogate-api", health: "/health" }));
    return;
  }

  await readBody(req);
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ code: "not_found", message: "Not found" }));
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: "internal_error", message: "Internal error" }));
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
