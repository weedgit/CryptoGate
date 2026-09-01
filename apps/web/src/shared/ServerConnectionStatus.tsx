import { useEffect, useState } from "react";
import {
  ensureHealthPolling,
  fetchSharedHealth,
  subscribeSharedHealth,
} from "./healthPolling";

export function ServerConnectionStatus() {
  const [ok, setOk] = useState(true);

  useEffect(() => {
    ensureHealthPolling(true);
    const sync = (health: Awaited<ReturnType<typeof fetchSharedHealth>>) => {
      setOk(health !== "unreachable" && health.api);
    };
    const unsub = subscribeSharedHealth(sync);
    void fetchSharedHealth(true).then(sync);
    return () => {
      unsub();
      ensureHealthPolling(false);
    };
  }, []);

  return (
    <div className="topbar-status" aria-label="Connection status">
      <span
        className={`net-indicator topbar-status__pill${ok ? "" : " is-warn"}`}
        title={ok ? "Connected to API server" : "Cannot reach API server"}
      >
        <span
          className={`net-indicator-dot${ok ? "" : " is-warn"}`}
          aria-hidden
        />
        {ok ? "Connected" : "Disconnected"}
      </span>
    </div>
  );
}
