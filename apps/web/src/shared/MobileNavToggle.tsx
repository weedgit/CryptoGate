type Props = {
  open: boolean;
  onToggle: () => void;
};

/** Hamburger control for portal shells (visible ≤1100px via CSS). */
export function MobileNavToggle({ open, onToggle }: Props) {
  return (
    <button
      type="button"
      className={`portal-mobile-nav-toggle${open ? " is-open" : ""}`}
      aria-label={open ? "Close navigation" : "Open navigation"}
      aria-expanded={open}
      aria-controls="portal-sidebar"
      onClick={onToggle}
    >
      <span className="portal-mobile-nav-toggle__bars" aria-hidden>
        <span />
        <span />
        <span />
      </span>
    </button>
  );
}
