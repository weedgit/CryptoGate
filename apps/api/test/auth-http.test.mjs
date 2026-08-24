import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { handleRequest } from "../src/http/app.mjs";

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

describe("auth HTTP (no DB)", () => {
  it("rejects invalid JSON on login", async () => {
    const server = createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        res.writeHead(500);
        res.end(String(err));
      });
    });
    const base = await listen(server);
    try {
      const res = await fetch(`${base}/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not-json",
      });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.code, "invalid_json");
    } finally {
      await close(server);
    }
  });

  it("requires email and password", async () => {
    const server = createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        res.writeHead(500);
        res.end(String(err));
      });
    });
    const base = await listen(server);
    try {
      const res = await fetch(`${base}/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "a@b.com" }),
      });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.code, "invalid_request");
    } finally {
      await close(server);
    }
  });

  it("returns 401 on session without cookie", async () => {
    const server = createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        res.writeHead(500);
        res.end(String(err));
      });
    });
    const base = await listen(server);
    try {
      const res = await fetch(`${base}/v1/auth/session`);
      assert.equal(res.status, 401);
      const body = await res.json();
      assert.equal(body.code, "unauthenticated");
    } finally {
      await close(server);
    }
  });

  it("rejects MFA enroll and verify without session", async () => {
    const server = createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        res.writeHead(500);
        res.end(String(err));
      });
    });
    const base = await listen(server);
    try {
      const enroll = await fetch(`${base}/v1/auth/mfa/enroll`, { method: "POST" });
      assert.equal(enroll.status, 401);
      const verify = await fetch(`${base}/v1/auth/mfa/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "123456" }),
      });
      assert.equal(verify.status, 401);
    } finally {
      await close(server);
    }
  });
});
