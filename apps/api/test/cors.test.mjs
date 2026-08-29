import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { handleRequest } from "../src/http/app.mjs";
import {
  applyCorsHeaders,
  listCorsAllowedOrigins,
} from "../src/http/cors.mjs";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve(`http://127.0.0.1:${addr.port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

describe("CORS", () => {
  const prevCors = process.env.CORS_ALLOWED_ORIGINS;
  const prevPay = process.env.PAYMENT_PAGE_BASE_URL;

  before(() => {
    process.env.CORS_ALLOWED_ORIGINS = "http://localhost:5173";
    delete process.env.PAYMENT_PAGE_BASE_URL;
  });

  after(() => {
    if (prevCors === undefined) delete process.env.CORS_ALLOWED_ORIGINS;
    else process.env.CORS_ALLOWED_ORIGINS = prevCors;
    if (prevPay === undefined) delete process.env.PAYMENT_PAGE_BASE_URL;
    else process.env.PAYMENT_PAGE_BASE_URL = prevPay;
  });

  it("lists configured origins", () => {
    assert.deepEqual(listCorsAllowedOrigins(), ["http://localhost:5173"]);
  });

  it("sets ACAO on allowed Origin for GET /health", async () => {
    const prevDb = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    const server = createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        res.writeHead(500);
        res.end(String(err));
      });
    });
    const base = await listen(server);
    try {
      const res = await fetch(`${base}/health`, {
        headers: { Origin: "http://localhost:5173" },
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:5173");
      assert.equal(res.headers.get("access-control-allow-credentials"), "true");
    } finally {
      await close(server);
      if (prevDb === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prevDb;
    }
  });

  it("answers OPTIONS preflight for payment path", async () => {
    const server = createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        res.writeHead(500);
        res.end(String(err));
      });
    });
    const base = await listen(server);
    try {
      const res = await fetch(`${base}/v1/orders/ord-1/payment`, {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:5173",
          "Access-Control-Request-Method": "GET",
        },
      });
      assert.equal(res.status, 204);
      assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:5173");
    } finally {
      await close(server);
    }
  });

  it("does not echo disallowed Origin", () => {
    const req = { headers: { origin: "http://evil.example" } };
    const headers = {};
    const res = {
      setHeader(k, v) {
        headers[k] = v;
      },
    };
    assert.equal(applyCorsHeaders(req, res), false);
    assert.equal(headers["Access-Control-Allow-Origin"], undefined);
  });
});
