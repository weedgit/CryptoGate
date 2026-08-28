import { useEffect, useState } from "react";

export function ServerConnectionStatus() {
  const [ok, setOk] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      try {
        const base =
          (import.meta.env.VITE_API_ORIGIN as string | undefined)?.replace(
            /\/$/,
            "",
          ) || "";
        const res = await fetch(`${base}/health`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = (await res.json()) as { status?: string };
        if (!cancelled) setOk(payload.status === "ok");
      } catch {
        if (!cancelled) setOk(false);
      }
    };
    void probe();
    const id = window.setInterval(() => void probe(), 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
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
