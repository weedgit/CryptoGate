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

  it("rejects org list without session", async () => {
    const server = createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        res.writeHead(500);
        res.end(String(err));
      });
    });
    const base = await listen(server);
    try {
      const res = await fetch(`${base}/v1/orgs`);
      assert.equal(res.status, 401);
    } finally {
      await close(server);
    }
  });

  it("rejects org invite without session", async () => {
    const server = createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        res.writeHead(500);
        res.end(String(err));
      });
    });
    const base = await listen(server);
    try {
      const res = await fetch(`${base}/v1/orgs/org-1/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "a@b.com", role: "viewer" }),
      });
      assert.equal(res.status, 401);
    } finally {
      await close(server);
    }
  });

  it("rejects role assign without session", async () => {
    const server = createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        res.writeHead(500);
        res.end(String(err));
      });
    });
    const base = await listen(server);
    try {
      const res = await fetch(`${base}/v1/orgs/org-1/users/user-1/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "viewer" }),
      });
      assert.equal(res.status, 401);
    } finally {
      await close(server);
    }
  });

  it("rejects org create without session", async () => {
    const server = createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        res.writeHead(500);
        res.end(String(err));
      });
    });
    const base = await listen(server);
    try {
      const res = await fetch(`${base}/v1/orgs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "platform", name: "CryptoGate", parentId: "" }),
      });
      assert.equal(res.status, 401);
    } finally {
      await close(server);
    }
  });

  it("rejects order create without session", async () => {
    const server = createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        res.writeHead(500);
        res.end(String(err));
      });
    });
    const base = await listen(server);
    try {
      const res = await fetch(`${base}/v1/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "test-key-01",
        },
        body: JSON.stringify({
          amount: "10.00",
          asset: "USDT",
          network: "tron",
          validitySeconds: 900,
        }),
      });
      assert.equal(res.status, 401);
    } finally {
      await close(server);
    }
  });

  it("rejects order list without session", async () => {
    const server = createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        res.writeHead(500);
        res.end(String(err));
      });
    });
    const base = await listen(server);
    try {
      const res = await fetch(`${base}/v1/orders`);
      assert.equal(res.status, 401);
    } finally {
      await close(server);
    }
  });

  it("rejects merchant order get without session", async () => {
    const server = createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        res.writeHead(500);
        res.end(String(err));
      });
    });
    const base = await listen(server);
    try {
      const res = await fetch(`${base}/v1/orders/ord-1`);
      assert.equal(res.status, 401);
    } finally {
      await close(server);
    }
  });

  it("rejects on-chain get without session", async () => {
    const server = createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        res.writeHead(500);
        res.end(String(err));
      });
    });
    const base = await listen(server);
    try {
      const res = await fetch(`${base}/v1/orders/ord-1/on-chain`);
      assert.equal(res.status, 401);
    } finally {
      await close(server);
    }
  });

  it("rejects API key without signing headers", async () => {
    const server = createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        res.writeHead(500);
        res.end(String(err));
      });
    });
    const base = await listen(server);
    try {
      const res = await fetch(`${base}/v1/orders/ord-1`, {
        headers: { "X-Api-Key": "cgk_unsigned" },
      });
      assert.equal(res.status, 401);
      const body = await res.json();
      assert.equal(body.code, "signature_invalid");
    } finally {
      await close(server);
    }
  });

  it("rejects settlement get and put without session", async () => {
    const server = createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        res.writeHead(500);
        res.end(String(err));
      });
    });
    const base = await listen(server);
    try {
      const get = await fetch(`${base}/v1/orgs/org-1/settlement`);
      assert.equal(get.status, 401);
      const put = await fetch(`${base}/v1/orgs/org-1/settlement`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset: "USDT",
          network: "tron",
          address: "TCryptoGateStubReceiveAddress00001",
        }),
      });
      assert.equal(put.status, 401);
    } finally {
      await close(server);
    }
  });

  it("rejects matching-mode get and put without session", async () => {
    const server = createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        res.writeHead(500);
        res.end(String(err));
      });
    });
    const base = await listen(server);
    try {
      const get = await fetch(`${base}/v1/orgs/org-1/matching-mode`);
      assert.equal(get.status, 401);
      const put = await fetch(`${base}/v1/orgs/org-1/matching-mode`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchingMode: "C" }),
      });
      assert.equal(put.status, 401);
    } finally {
      await close(server);
    }
  });

  it("rejects xpub get and put without session", async () => {
    const server = createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        res.writeHead(500);
        res.end(String(err));
      });
    });
    const base = await listen(server);
    try {
      const get = await fetch(`${base}/v1/orgs/org-1/xpub`);
      assert.equal(get.status, 401);
      const put = await fetch(`${base}/v1/orgs/org-1/xpub`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset: "USDT",
          network: "tron",
          xPub: "xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKpovv",
          mfaCode: "123456",
        }),
      });
      assert.equal(put.status, 401);
    } finally {
      await close(server);
    }
  });

  it("rejects hd-pool get without session", async () => {
    const server = createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        res.writeHead(500);
        res.end(String(err));
      });
    });
    const base = await listen(server);
    try {
      const res = await fetch(`${base}/v1/orgs/org-1/hd-pool`);
      assert.equal(res.status, 401);
    } finally {
      await close(server);
    }
  });

  it("rejects webhooks list and register without session", async () => {
    const server = createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        res.writeHead(500);
        res.end(String(err));
      });
    });
    const base = await listen(server);
    try {
      const list = await fetch(`${base}/v1/webhooks`);
      assert.equal(list.status, 401);
      const create = await fetch(`${base}/v1/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://hooks.example/cb" }),
      });
      assert.equal(create.status, 401);
      const test = await fetch(`${base}/v1/webhooks/test`, { method: "POST" });
      assert.equal(test.status, 401);
    } finally {
      await close(server);
    }
  });
});
