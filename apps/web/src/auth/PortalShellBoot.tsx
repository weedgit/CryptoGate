type Props = {
  title: string;
  copy?: string;
};

/** Shell-style boot — dark workspace chrome, not the auth marketing backdrop. */
export function PortalShellBoot({ title, copy }: Props) {
  return (
    <div
      className="portal-shell-boot"
      role="status"
      aria-busy="true"
      aria-live="polite"
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "#0b0e11",
        color: "#e2e8f0",
        fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
      }}
    >
      <div style={{ textAlign: "center", padding: 24, maxWidth: 360 }}>
        <div
          aria-hidden
          style={{
            width: 52,
            height: 52,
            margin: "0 auto 18px",
            borderRadius: 12,
            border: "1px solid rgba(251, 191, 36, 0.18)",
            background: "rgba(251, 191, 36, 0.06)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <span
            style={{
              display: "block",
              width: 22,
              height: 22,
              border: "2px solid rgba(251, 191, 36, 0.2)",
              borderTopColor: "rgba(251, 191, 36, 0.85)",
              borderRadius: "50%",
              animation: "portal-shell-boot-spin 0.75s linear infinite",
            }}
          />
        </div>
        <p
          style={{
            margin: "0 0 8px",
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: "0.01em",
          }}
        >
          {title}
        </p>
        {copy ? (
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: "#94a3b8" }}>
            {copy}
          </p>
        ) : null}
      </div>
      <style>{`@keyframes portal-shell-boot-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
