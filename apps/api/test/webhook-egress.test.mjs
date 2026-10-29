import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { isPublicAddress, postWebhook } from "../src/webhooks/webhook-egress.mjs";
import { validateWebhookUrl } from "../src/webhooks/webhook-rules.mjs";

describe("webhook egress (H11)", () => {
  it("classifies public vs internal addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) {
      assert.equal(isPublicAddress(ip), true, ip);
    }
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.20.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fe80::1",
      "fd00::1",
      "::ffff:127.0.0.1",
      "not-an-ip",
    ]) {
      assert.equal(isPublicAddress(ip), false, ip);
    }
  });

  it("rejects internal webhook URLs at registration", () => {
    for (const url of [
      "https://127.0.0.1/hook",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/hook",
      "https://10.0.0.5/hook",
      "https://localhost/hook",
      "https://api.internal/hook",
      "https://user:pw@example.com/hook",
    ]) {
      assert.equal(validateWebhookUrl(url, { allowLocalHttp: false }).ok, false, url);
    }
    assert.equal(validateWebhookUrl("https://example.com/hook", { allowLocalHttp: false }).ok, true);
  });

  it("never connects to a host that resolves to loopback", async () => {
    let connections = 0;
    const server = createServer((socket) => {
      connections += 1;
      socket.destroy();
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());
    try {
      await assert.rejects(
        postWebhook(`https://localhost:${port}/hook`, { headers: {}, body: "{}" }),
        (err) => err.code === "WEBHOOK_TARGET_NOT_PUBLIC",
      );
      assert.equal(connections, 0);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
