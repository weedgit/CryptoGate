import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

export type SearchableSelectOption = {
  id: string;
  label: string;
  hint?: string;
};

type Props = {
  id?: string;
  value: string;
  options: SearchableSelectOption[];
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Empty string is treated as “no selection”. */
  allowEmpty?: boolean;
  emptyLabel?: string;
  invalid?: boolean;
};

type MenuPos = { top: number; left: number; width: number; maxHeight: number };

/**
 * Dark-theme combobox — avoids unreadable native &lt;select&gt; popups on Windows.
 */
export function SearchableSelect({
  id,
  value,
  options,
  onChange,
  placeholder = "Select…",
  disabled = false,
  allowEmpty = true,
  emptyLabel,
  invalid = false,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<MenuPos | null>(null);

  const selected = options.find((o) => o.id === value) ?? null;
  const triggerLabel = selected
    ? selected.hint
      ? `${selected.label} (${selected.hint})`
      : selected.label
    : allowEmpty
      ? emptyLabel ?? placeholder
      : placeholder;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const hay = `${o.label} ${o.hint ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [options, query]);

  const updatePos = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 6;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const preferBelow = spaceBelow >= 180 || spaceBelow >= spaceAbove;
    const maxHeight = Math.min(280, Math.max(140, preferBelow ? spaceBelow : spaceAbove));
    setPos({
      top: preferBelow ? rect.bottom + gap : Math.max(8, rect.top - gap - maxHeight),
      left: rect.left,
      width: rect.width,
      maxHeight,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
    const onReposition = () => updatePos();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    const onDocPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      const menu = document.getElementById(listId);
      if (menu?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("pointerdown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, listId]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const pick = (idValue: string) => {
    onChange(idValue);
    setOpen(false);
  };

  const menuStyle: CSSProperties | undefined = pos
    ? {
        top: pos.top,
        left: pos.left,
        width: pos.width,
        maxHeight: pos.maxHeight,
      }
    : undefined;

  return (
    <div
      ref={rootRef}
      className={`searchable-select${open ? " is-open" : ""}${invalid ? " is-invalid" : ""}`}
    >
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="searchable-select__trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
      >
        <span
          className={`searchable-select__value${selected ? "" : " is-placeholder"}`}
        >
          {triggerLabel}
        </span>
        <span className="searchable-select__caret" aria-hidden />
      </button>

      {open && pos
        ? createPortal(
            <div
              id={listId}
              className="searchable-select__menu"
              role="listbox"
              style={menuStyle}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="searchable-select__search">
                <input
                  ref={searchRef}
                  type="search"
                  className="searchable-select__search-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  aria-label="Search options"
                  autoComplete="off"
                />
              </div>
              <div className="searchable-select__list">
                {allowEmpty ? (
                  <button
                    type="button"
                    role="option"
                    aria-selected={!value}
                    className={`searchable-select__option${!value ? " is-on" : ""}`}
                    onClick={() => pick("")}
                  >
                    {emptyLabel ?? placeholder}
                  </button>
                ) : null}
                {filtered.length === 0 ? (
                  <p className="searchable-select__empty">No matches</p>
                ) : (
                  filtered.map((opt) => {
                    const on = opt.id === value;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="option"
                        aria-selected={on}
                        className={`searchable-select__option${on ? " is-on" : ""}`}
                        onClick={() => pick(opt.id)}
                      >
                        <span className="searchable-select__option-label">
                          {opt.label}
                        </span>
                        {opt.hint ? (
                          <span className="searchable-select__option-hint">
                            {opt.hint}
                          </span>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
