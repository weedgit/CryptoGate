import { requireCaller } from "../http/require-caller.mjs";
import { sendError } from "../http/json.mjs";
import {
  pingDashboardEventClients,
  subscribeDashboardEvents,
} from "./dashboard-events-hub.mjs";
import { resolveDashboardEventAudience } from "./dashboard-events-scope.mjs";

let pingTimer = null;

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

  const audience = await resolveDashboardEventAudience(caller);
  if (audience.kind === "none") {
    sendError(res, 403, "forbidden", "No dashboard event scope for this caller");
    return;
  }

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

  const onClose = () => {
    unsubscribe();
    req.off("close", onClose);
    res.off("close", onClose);
  };
  req.on("close", onClose);
  res.on("close", onClose);
}
