import { useState } from "react";
import { createPortal } from "react-dom";
import { ApiError, updateProfile, type Session } from "../merchant/api";
import { browserTimeZone } from "../shared/dateTime";
import { timeZoneShortLabel } from "../shared/timeZoneOptions";
import { showToast } from "../shared/toast";
import {
  mismatchPairKey,
  timeZonePrompt,
  TZ_MISMATCH_DISMISS_KEY,
} from "./timeZonePrompt";

type Props = {
  session: Session;
  onSessionRefresh?: (session: Session) => void;
  /** Opens the Profile window to pick a different zone. */
  onChooseAnother: () => void;
};

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(TZ_MISMATCH_DISMISS_KEY);
  } catch {
    return null;
  }
}

export function TimeZonePromptCard({ session, onSessionRefresh, onChooseAnother }: Props) {
  const [dismissed, setDismissed] = useState(readDismissed);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  const prompt = timeZonePrompt({
    profileTimeZone: session.timezone,
    confirmed: session.timezoneConfirmed,
    deviceTimeZone: browserTimeZone(),
    dismissedPair: dismissed,
  });
  if (!prompt || hidden) return null;

  async function save(timezone: string) {
    setBusy(true);
    try {
      const next = await updateProfile({ timezone });
      onSessionRefresh?.(next);
      showToast(`Times now show in ${timeZoneShortLabel(timezone)}.`, { tone: "ok" });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not save time zone", {
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  function keepProfile(device: string, profile: string) {
    const key = mismatchPairKey(device, profile);
    try {
      window.localStorage.setItem(TZ_MISMATCH_DISMISS_KEY, key);
    } catch {
      /* private mode */
    }
    setDismissed(key);
  }

  const body =
    prompt.kind === "confirm" ? (
      <>
        <p className="tz-prompt__title">Confirm your time zone</p>
        <p className="tz-prompt__text">
          This device is set to <strong>{timeZoneShortLabel(prompt.detected)}</strong>. Your
          dashboards, order times and date filters will use it.
        </p>
        <div className="tz-prompt__actions">
          <button
            type="button"
            className="tz-prompt__btn is-primary"
            disabled={busy}
            onClick={() => void save(prompt.detected)}
          >
            Use this time zone
          </button>
          <button
            type="button"
            className="tz-prompt__btn is-ghost"
            disabled={busy}
            onClick={() => {
              setHidden(true);
              onChooseAnother();
            }}
          >
            Choose another
          </button>
        </div>
      </>
    ) : (
      <>
        <p className="tz-prompt__title">Different time zone on this device</p>
        <p className="tz-prompt__text">
          This device is in <strong>{timeZoneShortLabel(prompt.device)}</strong>. Times are shown
          in your profile zone, <strong>{timeZoneShortLabel(prompt.profile)}</strong>.
        </p>
        <div className="tz-prompt__actions">
          <button
            type="button"
            className="tz-prompt__btn is-primary"
            disabled={busy}
            onClick={() => void save(prompt.device)}
          >
            Switch to device zone
          </button>
          <button
            type="button"
            className="tz-prompt__btn is-ghost"
            disabled={busy}
            onClick={() => keepProfile(prompt.device, prompt.profile)}
          >
            Keep profile zone
          </button>
        </div>
      </>
    );

  return createPortal(
    <aside className="tz-prompt" role="status" aria-live="polite">
      <span className="tz-prompt__icon" aria-hidden>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      </span>
      <div className="tz-prompt__body">{body}</div>
      <button
        type="button"
        className="tz-prompt__close"
        aria-label="Dismiss"
        onClick={() => setHidden(true)}
      >
        ×
      </button>
    </aside>,
    document.body,
  );
}
