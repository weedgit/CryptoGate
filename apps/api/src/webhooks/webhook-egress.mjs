/**
 * Outbound webhook POSTs that can only reach public internet hosts (review H11).
 * The address check runs inside the DNS lookup the socket connects with, so a host that
 * resolves to (or rebinds to) loopback, private, link-local or metadata addresses is refused.
 * Redirects are never followed: a 3xx is just a failed delivery.
 */
import { lookup as dnsLookup } from "node:dns";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";

const NON_PUBLIC = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]) {
  NON_PUBLIC.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
]) {
  NON_PUBLIC.addSubnet(net, prefix, "ipv6");
}

/**
 * True for a routable public unicast address.
 * @param {string} address
 */
export function isPublicAddress(address) {
  const raw = String(address ?? "").trim().replace(/^\[|\]$/g, "");
  const family = isIP(raw);
  if (family === 4) return !NON_PUBLIC.check(raw, "ipv4");
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(raw);
    if (mapped) return !NON_PUBLIC.check(mapped[1], "ipv4");
    return !NON_PUBLIC.check(raw, "ipv6");
  }
  return false;
}

/**
 * dns.lookup replacement for http(s).request: resolves, then refuses any non-public answer.
 * @param {string} hostname
 * @param {object} options
 * @param {Function} callback
 */
export function publicOnlyLookup(hostname, options, callback) {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) {
      callback(err);
      return;
    }
    const list = Array.isArray(addresses) ? addresses : [];
    if (list.length === 0 || list.some((a) => !isPublicAddress(a.address))) {
      const blocked = new Error(`webhook host ${hostname} does not resolve to a public address`);
      blocked.code = "WEBHOOK_TARGET_NOT_PUBLIC";
      callback(blocked);
      return;
    }
    if (options?.all) callback(null, list);
    else callback(null, list[0].address, list[0].family);
  });
}

/**
 * POST `body` to `url`; resolves with the HTTP status (no redirects followed).
 * @param {string} url
 * @param {{ headers: Record<string, string>, body: string, signal?: AbortSignal, allowLocalHttp?: boolean }} init
 * @returns {Promise<{ status: number }>}
 */
export function postWebhook(url, init) {
  const target = new URL(url);
  const localHttp =
    init.allowLocalHttp === true &&
    target.protocol === "http:" &&
    (target.hostname === "127.0.0.1" || target.hostname === "localhost");
  if (target.protocol !== "https:" && !localHttp) {
    return Promise.reject(new Error("webhook URL must be https"));
  }
  const send = target.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = send(
      target,
      {
        method: "POST",
        headers: { ...init.headers, "Content-Length": Buffer.byteLength(init.body) },
        signal: init.signal,
        ...(localHttp ? {} : { lookup: publicOnlyLookup }),
      },
      (res) => {
        res.resume();
        resolve({ status: res.statusCode ?? 0 });
      },
    );
    req.on("error", reject);
    req.end(init.body);
  });
}
