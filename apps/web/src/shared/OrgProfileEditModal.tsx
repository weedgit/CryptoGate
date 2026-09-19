import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { OrgBrandMark } from "./OrgBrandMark";
import { isCustomOrgIcon, readOrgIconFile } from "./orgBrand";

type Props = {
  open: boolean;
  name: string;
  iconKey?: string | null;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (next: { name: string; iconKey: string | null }) => void | Promise<void>;
};

export function OrgProfileEditModal({
  open,
  name,
  iconKey = null,
  busy = false,
  error = null,
  onClose,
  onSave,
}: Props) {
  const titleId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [draftName, setDraftName] = useState(name);
  const [draftIcon, setDraftIcon] = useState<string | null>(iconKey ?? null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [readingFile, setReadingFile] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraftName(name);
    setDraftIcon(iconKey ?? null);
    setFileError(null);
    setReadingFile(false);
  }, [open, name, iconKey]);

  if (!open) return null;

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    setReadingFile(true);
    try {
      const dataUrl = await readOrgIconFile(file);
      setDraftIcon(dataUrl);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Could not use that file");
    } finally {
      setReadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const saving = busy || readingFile;

  return createPortal(
    <div
      className="b3-commission-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="b3-commission-modal org-profile-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="b3-commission-modal__head">
          <h3 id={titleId}>Edit organization</h3>
          <button
            type="button"
            className="b3-commission-modal__close"
            aria-label="Close"
            disabled={saving}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="b3-commission-modal__body">
          <div className="org-profile-edit-modal__preview">
            <OrgBrandMark name={draftName.trim() || name} iconKey={draftIcon} size={48} />
            <p className="org-profile-edit-modal__preview-name">
              {draftName.trim() || name}
            </p>
          </div>

          <label className="field">
            <span className="field-label">Name</span>
            <input
              className="field-control"
              value={draftName}
              maxLength={120}
              disabled={saving}
              onChange={(e) => setDraftName(e.target.value)}
              autoFocus
            />
          </label>

          <div className="org-profile-edit-modal__icons">
            <p className="field-label">Icon</p>
            <p className="org-profile-edit-modal__icon-hint">
              Choose an image or icon file from your computer (PNG, JPEG, WebP, or GIF).
            </p>
            <div className="org-profile-edit-modal__file-row">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
                className="sr-only"
                disabled={saving}
                onChange={(e) => void onPickFile(e.target.files?.[0])}
              />
              <button
                type="button"
                className="btn-secondary org-profile-edit-modal__file-btn"
                disabled={saving}
                onClick={() => fileInputRef.current?.click()}
              >
                {readingFile
                  ? "Reading…"
                  : isCustomOrgIcon(draftIcon)
                    ? "Change image…"
                    : "Choose image…"}
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={saving || draftIcon == null}
                onClick={() => {
                  setDraftIcon(null);
                  setFileError(null);
                }}
              >
                Use initials
              </button>
            </div>
            {fileError ? <p className="banner banner-warn">{fileError}</p> : null}
          </div>

          {error ? <p className="banner banner-warn">{error}</p> : null}
        </div>
        <footer className="b3-commission-modal__foot">
          <button type="button" className="btn-ghost" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={saving || draftName.trim().length < 2}
            onClick={() =>
              void onSave({
                name: draftName.trim(),
                iconKey: draftIcon,
              })
            }
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
