import { Link } from "react-router-dom";
import type { Session } from "../merchant/api";
import {
  setupChecklistItems,
  type SetupChecklistItem,
} from "./contactVerification";

type Props = {
  session: Session;
  portal: "agent" | "merchant";
  /** Called when the user follows a deep link (optional refresh). */
  onNavigate?: () => void;
};

/**
 * Compact “N/M done” setup progress for settings pages.
 * Hidden when setup is already complete.
 */
export function SetupChecklistCard({ session, portal, onNavigate }: Props) {
  const items = setupChecklistItems(session, portal);
  const done = items.filter((i) => i.done).length;
  const total = items.length;
  if (done >= total) return null;

  return (
    <section
      className="setup-checklist"
      aria-label={`Account setup ${done} of ${total} complete`}
    >
      <header className="setup-checklist__head">
        <h2 className="setup-checklist__title">Account setup</h2>
        <p className="setup-checklist__progress">
          <strong>
            {done}/{total}
          </strong>{" "}
          done — Watch-only until this is complete
        </p>
      </header>
      <ul className="setup-checklist__list">
        {items.map((item) => (
          <ChecklistRow
            key={item.id}
            item={item}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
    </section>
  );
}

function ChecklistRow({
  item,
  onNavigate,
}: {
  item: SetupChecklistItem;
  onNavigate?: () => void;
}) {
  return (
    <li
      className={`setup-checklist__item${item.done ? " is-done" : ""}`}
    >
      <span className="setup-checklist__mark" aria-hidden>
        {item.done ? "✓" : "○"}
      </span>
      <div className="setup-checklist__body">
        <span className="setup-checklist__label">{item.label}</span>
        {!item.done && item.href ? (
          <Link
            className="setup-checklist__link"
            to={item.href}
            onClick={() => onNavigate?.()}
          >
            {item.cta}
          </Link>
        ) : null}
      </div>
    </li>
  );
}
