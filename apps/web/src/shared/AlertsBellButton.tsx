type Props = {
  open: boolean;
  unreadCount: number;
  onOpen: () => void;
};

/** Top-bar alerts control with unread count badge (A9). */
export function AlertsBellButton({ open, unreadCount, onOpen }: Props) {
  const count = Math.max(0, Math.floor(unreadCount));
  const badge = count > 99 ? "99+" : String(count);
  const label =
    count > 0 ? `Open alerts, ${count} unread` : "Open alerts";

  return (
    <button
      type="button"
      className={`alerts-bell${open ? " is-open" : ""}${count > 0 ? " has-unread" : ""}`}
      aria-label={label}
      aria-expanded={open}
      aria-controls="alerts-drawer-title"
      title={label}
      onClick={onOpen}
    >
      <span
        className="alerts-bell-icon"
        style={{
          WebkitMaskImage: "url(/icons/nav/bell-ring.svg)",
          maskImage: "url(/icons/nav/bell-ring.svg)",
        }}
        aria-hidden
      />
      {count > 0 ? (
        <span className="alerts-bell-badge" aria-hidden key={count}>
          {badge}
        </span>
      ) : null}
    </button>
  );
}
