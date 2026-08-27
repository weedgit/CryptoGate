import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { RateLimitPerMinute } from "@cryptogate/domain";
import { applyRateLimits } from "../src/rate-limit/apply-rate-limits.mjs";
import { resetRateLimitStore } from "../src/rate-limit/rate-limit-store.mjs";
import {
  clientIp,
  isGuestPaymentPath,
  isLoginPath,
  isRateLimitExemptPath,
  rateLimitDecision,
  rateLimitsPerMinute,
} from "../src/rate-limit/rate-limit-rules.mjs";
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

function mockRes() {
  /** @type {Record<string, string>} */
  const headers = {};
  let body = "";
  return {
    headers,
    statusCode: 0,
    ended: false,
    setHeader(k, v) {
      headers[k] = String(v);
    },
    end(payload) {
      this.ended = true;
      body = String(payload ?? "");
    },
    body() {
      return body;
    },
  };
}

function mockReq(ip, method, url, extraHeaders = {}) {
  return {
    headers: { "x-forwarded-for": ip, ...extraHeaders },
    method,
    url,
    socket: { remoteAddress: ip },
  };
}

describe("rate-limit rules (M3-11)", () => {
  it("uses domain per-minute defaults", () => {
    const limits = rateLimitsPerMinute();
    assert.equal(limits.apiKey, RateLimitPerMinute.apiKey);
    assert.equal(limits.ip, RateLimitPerMinute.ip);
    assert.equal(limits.login, RateLimitPerMinute.login);
    assert.equal(limits.guestPayment, RateLimitPerMinute.guestPayment);
  });

  it("trips after the limit and sets retryAfter from the window", () => {
    const now = 1_000_000;
    const first = rateLimitDecision([], now, 60_000, 2);
    assert.equal(first.ok, true);
    const second = rateLimitDecision(first.next, now + 100, 60_000, 2);
    assert.equal(second.ok, true);
    const third = rateLimitDecision(second.next, now + 200, 60_000, 2);
    assert.equal(third.ok, false);
    assert.equal(third.retryAfter, 60);
  });

  it("classifies login and guest payment paths", () => {
    assert.equal(isLoginPath("POST", "/v1/auth/login"), true);
    assert.equal(isGuestPaymentPath("GET", "/v1/orders/ord-1/payment"), true);
    assert.equal(isGuestPaymentPath("GET", "/v1/orders/ord-1"), false);
  });

  it("exempts health and session from IP rate limit", () => {
    assert.equal(isRateLimitExemptPath("GET", "/health"), true);
    assert.equal(isRateLimitExemptPath("GET", "/v1/auth/session"), true);
    assert.equal(isRateLimitExemptPath("GET", "/v1/orgs"), false);
  });

  it("reads the first X-Forwarded-For hop", () => {
    assert.equal(
      clientIp({ "x-forwarded-for": "203.0.113.1, 10.0.0.1" }, "127.0.0.1"),
      "203.0.113.1",
    );
  });
});

describe("applyRateLimits", () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  it("returns 429 rate_limited with Retry-After on login overage", () => {
    const prev = process.env.RATE_LIMIT_LOGIN_PER_MINUTE;
    process.env.RATE_LIMIT_LOGIN_PER_MINUTE = "2";
    try {
      const ip = "203.0.113.50";
      for (let i = 0; i < 2; i++) {
        const res = mockRes();
        assert.equal(
          applyRateLimits(mockReq(ip, "POST", "/v1/auth/login"), res, {
            method: "POST",
            path: "/v1/auth/login",
          }),
          false,
        );
      }
      const res = mockRes();
      assert.equal(
        applyRateLimits(mockReq(ip, "POST", "/v1/auth/login"), res, {
          method: "POST",
          path: "/v1/auth/login",
        }),
        true,
      );
      assert.equal(res.statusCode, 429);
      assert.equal(res.headers["Retry-After"], "60");
      const body = JSON.parse(res.body());
      assert.equal(body.code, "rate_limited");
    } finally {
      if (prev === undefined) delete process.env.RATE_LIMIT_LOGIN_PER_MINUTE;
      else process.env.RATE_LIMIT_LOGIN_PER_MINUTE = prev;
    }
  });

  it("applies API-key limit in addition to IP", () => {
    const prevIp = process.env.RATE_LIMIT_IP_PER_MINUTE;
    const prevKey = process.env.RATE_LIMIT_API_KEY_PER_MINUTE;
    process.env.RATE_LIMIT_IP_PER_MINUTE = "50";
    process.env.RATE_LIMIT_API_KEY_PER_MINUTE = "1";
    try {
      const ip = "203.0.113.51";
      const headers = { "x-api-key": "cgk_test_key" };
      const first = mockRes();
      assert.equal(
        applyRateLimits(mockReq(ip, "GET", "/v1/orders", headers), first, {
          method: "GET",
          path: "/v1/orders",
        }),
        false,
      );
      const second = mockRes();
      assert.equal(
        applyRateLimits(mockReq(ip, "GET", "/v1/orders", headers), second, {
          method: "GET",
          path: "/v1/orders",
        }),
        true,
      );
      assert.equal(second.statusCode, 429);
    } finally {
      if (prevIp === undefined) delete process.env.RATE_LIMIT_IP_PER_MINUTE;
      else process.env.RATE_LIMIT_IP_PER_MINUTE = prevIp;
      if (prevKey === undefined) delete process.env.RATE_LIMIT_API_KEY_PER_MINUTE;
      else process.env.RATE_LIMIT_API_KEY_PER_MINUTE = prevKey;
    }
  });

  it("does not consume IP when a tighter bucket rejects", () => {
    const prevIp = process.env.RATE_LIMIT_IP_PER_MINUTE;
    const prevKey = process.env.RATE_LIMIT_API_KEY_PER_MINUTE;
    process.env.RATE_LIMIT_IP_PER_MINUTE = "2";
    process.env.RATE_LIMIT_API_KEY_PER_MINUTE = "1";
    try {
      const ip = "203.0.113.52";
      const headers = { "x-api-key": "cgk_peek" };
      assert.equal(
        applyRateLimits(mockReq(ip, "GET", "/v1/orders", headers), mockRes(), {
          method: "GET",
          path: "/v1/orders",
        }),
        false,
      );
      assert.equal(
        applyRateLimits(mockReq(ip, "GET", "/v1/orders", headers), mockRes(), {
          method: "GET",
          path: "/v1/orders",
        }),
        true,
      );
      // Same IP, no API key — still has IP budget (rejected request did not commit).
      assert.equal(
        applyRateLimits(mockReq(ip, "GET", "/health"), mockRes(), {
          method: "GET",
          path: "/health",
        }),
        false,
      );
    } finally {
      if (prevIp === undefined) delete process.env.RATE_LIMIT_IP_PER_MINUTE;
      else process.env.RATE_LIMIT_IP_PER_MINUTE = prevIp;
      if (prevKey === undefined) delete process.env.RATE_LIMIT_API_KEY_PER_MINUTE;
      else process.env.RATE_LIMIT_API_KEY_PER_MINUTE = prevKey;
    }
  });
});

describe("rate-limit HTTP", () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  it("returns 429 on login overage through the router", async () => {
    const prev = process.env.RATE_LIMIT_LOGIN_PER_MINUTE;
    process.env.RATE_LIMIT_LOGIN_PER_MINUTE = "1";
    const server = createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        res.writeHead(500);
        res.end(String(err));
      });
    });
    const base = await listen(server);
    try {
      const first = await fetch(`${base}/v1/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": "198.51.100.10",
        },
        body: JSON.stringify({
          email: "a@b.com",
          password: "password12chars",
        }),
      });
      assert.notEqual(first.status, 429);

      const second = await fetch(`${base}/v1/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": "198.51.100.10",
        },
        body: JSON.stringify({
          email: "a@b.com",
          password: "password12chars",
        }),
      });
      assert.equal(second.status, 429);
      assert.equal(second.headers.get("retry-after"), "60");
      const body = await second.json();
      assert.equal(body.code, "rate_limited");
    } finally {
      await close(server);
      if (prev === undefined) delete process.env.RATE_LIMIT_LOGIN_PER_MINUTE;
      else process.env.RATE_LIMIT_LOGIN_PER_MINUTE = prev;
    }
  });
});
