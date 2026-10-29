import { requireCaller } from "../http/require-caller.mjs";
import { sendError } from "../http/json.mjs";
import {
  pingDashboardEventClients,
  subscribeDashboardEvents,
} from "./dashboard-events-hub.mjs";
import { resolveDashboardEventAudience } from "./dashboard-events-scope.mjs";

let pingTimer = null;

const POS_STREAM_MAX_MS = 5 * 60_000;
/** Portal streams end too, so a reconnect re-checks the session and memberships (M25). */
const PORTAL_STREAM_MAX_MS = 15 * 60_000;
/** Open streams per user; tabs reconnect, a loop of new ones should not pile up (M25). */
export const MAX_STREAMS_PER_USER = 10;

/** @type {Map<string, number>} */
const streamsByUser = new Map();

function ensurePingTimer() {
  if (pingTimer != null) return;
  pingTimer = setInterval(() => {
    pingDashboardEventClients();
  }, 15_000);
  if (typeof pingTimer.unref === "function") pingTimer.unref();
}

/**
 * GET /v1/events — SSE stream for dashboard slice invalidation.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleGetDashboardEvents(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const audience = caller.terminalId
    ? { kind: "orgs", orgIds: new Set([caller.terminalOrgId]), treeRootIds: new Set() }
    : await resolveDashboardEventAudience(caller);
  if (audience.kind === "none") {
    sendError(res, 403, "forbidden", "No dashboard event scope for this caller");
    return;
  }
  // The client may have gone while we authenticated: its close event already fired, so
  // subscribing now would leak the subscriber forever (review M25).
  if (req.destroyed || res.destroyed || res.writableEnded) return;
  const open = streamsByUser.get(caller.userId) ?? 0;
  if (open >= MAX_STREAMS_PER_USER) {
    res.setHeader("Retry-After", "30");
    sendError(res, 429, "too_many_streams", "Too many open live-update connections");
    return;
  }
  streamsByUser.set(caller.userId, open + 1);

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  const unsubscribe = subscribeDashboardEvents(audience, (chunk) => {
    if (res.writableEnded) return;
    res.write(chunk);
  });
  ensurePingTimer();

  // Sessions and memberships are checked per request: end streams regularly so the reconnect
  // re-validates them (PIN sessions: terminal too).
  const cutoff = setTimeout(
    () => res.end(),
    caller.terminalId ? POS_STREAM_MAX_MS : PORTAL_STREAM_MAX_MS,
  );

  let closed = false;
  const onClose = () => {
    if (closed) return;
    closed = true;
    clearTimeout(cutoff);
    unsubscribe();
    const left = (streamsByUser.get(caller.userId) ?? 1) - 1;
    if (left > 0) streamsByUser.set(caller.userId, left);
    else streamsByUser.delete(caller.userId);
    req.off("close", onClose);
    res.off("close", onClose);
  };
  req.on("close", onClose);
  res.on("close", onClose);
}
