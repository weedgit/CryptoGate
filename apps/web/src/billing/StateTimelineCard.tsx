import type { CSSProperties } from "react";
import { ChartHelpButton } from "../platform/ui/ChartHelpButton";

export type StateTimelineStep = {
  id: string;
  label: string;
  detail: string;
  tone: "done" | "current" | "muted";
};

/** Arrows between steps: done / flowing / idle. */
function arrowTone(
  step: StateTimelineStep,
  next: StateTimelineStep | undefined,
): "is-done" | "is-flowing" | "is-idle" {
  if (!next) return "is-idle";
  if (step.tone === "done" && next.tone === "done") return "is-done";
  if (
    (step.tone === "done" && next.tone === "current") ||
    (step.tone === "current" && next.tone === "muted")
  ) {
    return "is-flowing";
  }
  return "is-idle";
}

/** Vertical state timeline card of the bill / invoice detail side column. */
export function StateTimelineCard({
  title,
  steps,
  help,
}: {
  title: string;
  steps: StateTimelineStep[];
  /** "?" tooltip next to the title. */
  help?: string;
}) {
  return (
    <section className="plat-bill-detail__card plat-bill-detail__timeline-card">
      <h2 className="plat-bill-detail__section-title">
        <span className="plat-bill-detail__section-title-icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path
              fill="currentColor"
              d="M11 6.5h2v11h-2zM12 2.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4m0 7.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4m0 7.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4"
            />
          </svg>
        </span>
        {title}
        {help ? <ChartHelpButton openOnHover label={`About ${title}`} text={help} /> : null}
      </h2>
      <ol className="plat-bill-detail__timeline">
        {steps.map((step, i, arr) => {
          const next = arr[i + 1];
          return (
            <li
              key={step.id}
              className={`plat-bill-detail__step is-${step.tone}`}
              style={
                {
                  animationDelay: `${i * 90}ms`,
                  ["--step-delay" as string]: `${i * 90}ms`,
                } as CSSProperties
              }
            >
              <span className="plat-bill-detail__step-dot" aria-hidden />
              <div className="plat-bill-detail__step-body">
                <p className="plat-bill-detail__step-label">{step.label}</p>
                <p className="plat-bill-detail__step-detail">{step.detail}</p>
              </div>
              {next ? (
                <span
                  className={`plat-bill-detail__step-arrow ${arrowTone(step, next)}`}
                  aria-hidden
                >
                  <span className="plat-bill-detail__step-arrow-inner">
                    <span className="plat-bill-detail__step-chevron">&gt;</span>
                    <span className="plat-bill-detail__step-chevron">&gt;</span>
                    <span className="plat-bill-detail__step-chevron">&gt;</span>
                  </span>
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
