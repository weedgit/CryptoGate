import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type FeedbackCategory = "bug" | "idea" | "other";

type Props = {
  open: boolean;
  email: string;
  onClose: () => void;
};

const CATEGORIES: { id: FeedbackCategory; label: string }[] = [
  { id: "bug", label: "Bug" },
  { id: "idea", label: "Idea" },
  { id: "other", label: "Other" },
];

const STORAGE_KEY = "cryptogate.platform.feedback.v1";

/**
 * Lightweight feedback capture until a support inbox API exists.
 * Entries are stored locally for Phase 1 review.
 */
export function FeedbackModal({ open, email, onClose }: Props) {
  const [category, setCategory] = useState<FeedbackCategory>("idea");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCategory("idea");
    setMessage("");
    setSent(false);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = () => {
    const body = message.trim();
    if (body.length < 8) {
      setError("Please add a bit more detail (at least 8 characters).");
      return;
    }
    const entry = {
      id: `fb_${Date.now()}`,
      category,
      message: body,
      email,
      path: typeof window !== "undefined" ? window.location.pathname : "",
      createdAt: new Date().toISOString(),
    };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const prev = raw ? (JSON.parse(raw) as unknown) : [];
      const list = Array.isArray(prev) ? prev : [];
      list.unshift(entry);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 50)));
      setSent(true);
      setError(null);
    } catch {
      setError("Could not save feedback on this device. Try again.");
    }
  };

  return createPortal(
    <div className="feedback-modal" role="presentation" onClick={onClose}>
      <div
        className="feedback-modal__panel panel glass-tone-slate"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="feedback-modal__head">
          <h2 id="feedback-modal-title">Send feedback</h2>
          <button
            type="button"
            className="feedback-modal__close"
            aria-label="Close feedback"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        {sent ? (
          <div className="feedback-modal__body">
            <p className="feedback-modal__thanks">
              Thanks — your feedback was saved. We use it to improve CryptoGate.
            </p>
            <div className="feedback-modal__foot">
              <button
                type="button"
                className="feedback-modal__primary"
                onClick={onClose}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="feedback-modal__body">
            <p className="muted feedback-modal__lead">
              Report a bug, share an idea, or tell us what slowed you down.
            </p>

            <div className="feedback-modal__cats" role="radiogroup" aria-label="Feedback type">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={category === c.id}
                  className={`feedback-modal__cat${category === c.id ? " is-on" : ""}`}
                  onClick={() => setCategory(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <label className="feedback-modal__field">
              <span>Message</span>
              <textarea
                value={message}
                rows={5}
                placeholder="What happened? What did you expect?"
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>

            <p className="feedback-modal__meta muted">
              Sending as <strong>{email}</strong>
            </p>

            {error ? <p className="error">{error}</p> : null}

            <div className="feedback-modal__foot">
              <button
                type="button"
                className="feedback-modal__cancel"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="feedback-modal__primary"
                onClick={submit}
              >
                Send feedback
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
