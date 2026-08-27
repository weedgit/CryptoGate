import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  body: string;
  actions?: ReactNode;
  mark?: ReactNode;
  className?: string;
};

/** Figma 03 empty panel — title/body/actions with enter motion via CSS. */
export function EmptyState({
  title,
  body,
  actions,
  mark = "○",
  className = "",
}: EmptyStateProps) {
  return (
    <div className={`cg-empty ${className}`.trim()}>
      <div className="cg-empty__mark" aria-hidden>
        {mark}
      </div>
      <h2 className="cg-empty__title">{title}</h2>
      <p className="cg-empty__body">{body}</p>
      {actions ? <div className="cg-empty__actions">{actions}</div> : null}
    </div>
  );
}
