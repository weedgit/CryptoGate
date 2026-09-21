import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  OverviewChartCardView,
  type OverviewChartCard,
} from "./OverviewTable";
import { orgMetricChartColor } from "./chartColors";

export type AccountPickOption = {
  id: string;
  name: string;
  kind: "merchant" | "agent";
};

type Props = {
  open: boolean;
  /** Platform defaults — history already resolved. */
  platformCards: OverviewChartCard[];
  merchants: AccountPickOption[];
  agents: AccountPickOption[];
  selectedIds: string[];
  /** Resolve merchant:/agent: history only when a card becomes visible. */
  resolveOrgCard: (overviewId: string) => Promise<OverviewChartCard>;
  onClose: () => void;
  onApply: (ids: string[]) => void;
};

const PAGE_SIZE = 12;

function orgCardId(kind: "merchant" | "agent", orgId: string): string {
  return `${kind}:${orgId}`;
}

function shellCard(opt: AccountPickOption): OverviewChartCard {
  const id = orgCardId(opt.kind, opt.id);
  return {
    id,
    category: opt.kind === "merchant" ? "Merchants" : "Agents",
    title: opt.name,
    help:
      opt.kind === "merchant"
        ? "Settled volume and fees for this merchant (and sites)."
        : "Settled volume and fees for this agent subtree.",
    value: "—",
    compareLabel: opt.kind === "merchant" ? "Merchant" : "Agent",
    series: [],
    chartColor: orgMetricChartColor(id, opt.kind),
    seriesStatus: "pending",
    moreLabel: "More details",
  };
}

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

function AddChartsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M3.5 14.5V16.5H16.5V14.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 12.5L8.25 8.75L10.75 11L14.5 5.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChartsGridIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect
        x="2.5"
        y="2.5"
        width="5.5"
        height="5.5"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <rect
        x="10"
        y="2.5"
        width="5.5"
        height="5.5"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <rect
        x="2.5"
        y="10"
        width="5.5"
        height="5.5"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <rect
        x="10"
        y="10"
        width="5.5"
        height="5.5"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function ApplyCheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2.5 7.2L5.4 10.1L11.5 3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlatformSectionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2.2 4.2L7 1.8L11.8 4.2L7 6.6L2.2 4.2Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        d="M2.2 7L7 9.4L11.8 7"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.2 9.8L7 12.2L11.8 9.8"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MerchantsSectionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2.5 5.5V12H11.5V5.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        d="M1.8 5.5L3.2 2.5H10.8L12.2 5.5H1.8Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 12V8.2H8.5V12"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AgentsSectionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="4.2" r="2" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M3.2 11.5C3.5 9.4 5 8.1 7 8.1C9 8.1 10.5 9.4 10.8 11.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <circle cx="11.2" cy="5.2" r="1.35" stroke="currentColor" strokeWidth="1.15" />
      <circle cx="2.8" cy="5.2" r="1.35" stroke="currentColor" strokeWidth="1.15" />
    </svg>
  );
}

function sectionIcon(title: string) {
  if (title === "Platform") return <PlatformSectionIcon />;
  if (title === "Merchants") return <MerchantsSectionIcon />;
  if (title === "Agents") return <AgentsSectionIcon />;
  return <PlatformSectionIcon />;
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle
        cx="7"
        cy="7"
        r="4.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M10.4 10.4L13.2 13.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SectionInfoIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M6 5.2V8.2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="6" cy="3.7" r="0.7" fill="currentColor" />
    </svg>
  );
}

function LazySelectCard({
  card,
  selected,
  onToggle,
  onVisible,
}: {
  card: OverviewChartCard;
  selected: boolean;
  onToggle: () => void;
  onVisible?: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!onVisible || card.seriesStatus !== "pending") return;
    const node = ref.current;
    if (!node) return;
    const root = node.closest(".add-charts-modal__body");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onVisible(card.id);
      },
      {
        root: root instanceof Element ? root : null,
        rootMargin: "160px 0px",
        threshold: 0.05,
      },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [card.id, card.seriesStatus, onVisible]);

  return (
    <div ref={ref} className="add-charts-modal__card-wrap">
      <OverviewChartCardView
        card={card}
        selectMode
        selected={selected}
        onToggle={onToggle}
      />
    </div>
  );
}

function ChartSection({
  title,
  description,
  hint,
  cards,
  draft,
  onToggle,
  onVisible,
}: {
  title: string;
  description?: string;
  hint?: string;
  cards: OverviewChartCard[];
  draft: Set<string>;
  onToggle: (id: string) => void;
  onVisible?: (id: string) => void;
}) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const cardsKey = cards.map((c) => c.id).join("|");

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [cardsKey]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || cards.length <= limit) return;
    const root = node.closest(".add-charts-modal__body");
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        setLimit((n) => Math.min(n + PAGE_SIZE, cards.length));
      },
      {
        root: root instanceof Element ? root : null,
        rootMargin: "120px 0px",
        threshold: 0,
      },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [cards.length, limit]);

  const visible = cards.slice(0, limit);
  const hasMore = visible.length < cards.length;
  const selectedInSection = cards.reduce(
    (n, c) => n + (draft.has(c.id) ? 1 : 0),
    0,
  );
  const countLabel =
    cards.length === 0
      ? null
      : `${selectedInSection} / ${cards.length}`;

  const heading = (
    <div className="add-charts-modal__cat-row">
      <div className="add-charts-modal__cat-left">
        <h3 className="add-charts-modal__cat">
          <span className="add-charts-modal__cat-icon" aria-hidden>
            {sectionIcon(title)}
          </span>
          <span className="add-charts-modal__cat-label">{title}</span>
          {countLabel ? (
            <span
              className="add-charts-modal__section-count"
              title={`${selectedInSection} selected of ${cards.length}`}
            >
              {countLabel}
            </span>
          ) : null}
        </h3>
        {hint ? (
          <p className="add-charts-modal__cat-hint">
            <span className="add-charts-modal__cat-hint-icon" aria-hidden>
              <SectionInfoIcon />
            </span>
            {hint}
          </p>
        ) : null}
      </div>
      {description ? (
        <p className="add-charts-modal__cat-desc">{description}</p>
      ) : null}
    </div>
  );

  if (cards.length === 0) {
    return (
      <section className="add-charts-modal__section">
        {heading}
        <p className="muted">No matching charts.</p>
      </section>
    );
  }

  return (
    <section className="add-charts-modal__section">
      {heading}
      <div className="add-charts-modal__grid">
        {visible.map((card) => (
          <LazySelectCard
            key={card.id}
            card={card}
            selected={draft.has(card.id)}
            onToggle={() => onToggle(card.id)}
            onVisible={onVisible}
          />
        ))}
      </div>
      {hasMore ? (
        <div
          ref={sentinelRef}
          className="add-charts-modal__scroll-sentinel"
          aria-hidden
        >
          <span className="add-charts-modal__scroll-hint">Scroll for more</span>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Stripe-style Add charts picker.
 * Org history is lazy: shells render pending until the card scrolls into view.
 * Sections reveal more cards via infinite scroll (no “Show more” button).
 */
export function AddChartsModal({
  open,
  platformCards,
  merchants,
  agents,
  selectedIds,
  resolveOrgCard,
  onClose,
  onApply,
}: Props) {
  const [draft, setDraft] = useState<string[]>(selectedIds);
  const [query, setQuery] = useState("");
  const [resolved, setResolved] = useState<Record<string, OverviewChartCard>>({});
  const inflight = useRef(new Set<string>());
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [modKey, setModKey] = useState("Ctrl");

  useEffect(() => {
    setModKey(isMacPlatform() ? "⌘" : "Ctrl");
  }, []);

  useEffect(() => {
    if (!open) return;
    setDraft(selectedIds);
    setQuery("");
    setResolved({});
    inflight.current.clear();
    const t = window.setTimeout(() => searchRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open, selectedIds]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const q = query.trim().toLowerCase();

  const filteredPlatform = useMemo(
    () =>
      platformCards.filter(
        (c) => !q || c.title.toLowerCase().includes(q),
      ),
    [platformCards, q],
  );

  const merchantCards = useMemo(() => {
    return merchants
      .filter((m) => !q || m.name.toLowerCase().includes(q))
      .map((m) => {
        const id = orgCardId("merchant", m.id);
        return resolved[id] ?? shellCard(m);
      });
  }, [merchants, q, resolved]);

  const agentCards = useMemo(() => {
    return agents
      .filter((a) => !q || a.name.toLowerCase().includes(q))
      .map((a) => {
        const id = orgCardId("agent", a.id);
        return resolved[id] ?? shellCard(a);
      });
  }, [agents, q, resolved]);

  const draftSet = useMemo(() => new Set(draft), [draft]);

  const onVisible = useCallback(
    (id: string) => {
      if (resolved[id] || inflight.current.has(id)) return;
      inflight.current.add(id);
      void resolveOrgCard(id)
        .then((card) => {
          setResolved((prev) => ({
            ...prev,
            [id]: { ...card, seriesStatus: "ready" as const },
          }));
        })
        .catch(() => {
          setResolved((prev) => ({
            ...prev,
            [id]: {
              id,
              title: id,
              value: "—",
              series: [],
              seriesStatus: "error",
              updatedLabel: "Failed to load",
            },
          }));
        })
        .finally(() => {
          inflight.current.delete(id);
        });
    },
    [resolveOrgCard, resolved],
  );

  if (!open) return null;

  const toggle = (id: string) => {
    setDraft((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const applyOrdered = () => {
    const draftNext = new Set(draft);
    const kept = selectedIds.filter((id) => draftNext.has(id));
    const added = draft.filter((id) => !selectedIds.includes(id));
    onApply([...kept, ...added]);
  };

  const selectedCount = draft.length;
  const selectedLabel =
    selectedCount === 1 ? "1 chart selected" : `${selectedCount} charts selected`;

  return (
    <div className="add-charts-modal" role="presentation" onClick={onClose}>
      <div
        className="add-charts-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-charts-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="add-charts-modal__head">
          <div className="add-charts-modal__head-main">
            <span className="add-charts-modal__badge" aria-hidden>
              <AddChartsIcon />
            </span>
            <div className="add-charts-modal__titles">
              <h2 id="add-charts-title">Add charts</h2>
              <p className="add-charts-modal__subtitle">
                Choose metrics for your overview
              </p>
            </div>
          </div>
          <button
            type="button"
            className="add-charts-modal__close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="add-charts-modal__toolbar">
          <label className="add-charts-modal__search">
            <span className="sr-only">Search charts</span>
            <span className="add-charts-modal__search-icon" aria-hidden>
              <SearchIcon />
            </span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder="Search platform, merchants, agents…"
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd className="add-charts-modal__kbd" aria-hidden>
              {modKey} K
            </kbd>
          </label>
          <p className="add-charts-modal__hint">
            <span className="add-charts-modal__hint-icon" aria-hidden>
              <SectionInfoIcon />
            </span>
            Scroll to browse accounts. Chart history loads as each card enters
            view.
          </p>
        </div>

        <div className="add-charts-modal__body">
          <ChartSection
            title="Platform"
            description="One convert-rate chart per Networks & Assets pair"
            cards={filteredPlatform}
            draft={draftSet}
            onToggle={toggle}
          />
          <ChartSection
            title="Merchants"
            description="Select merchants to add individual charts"
            cards={merchantCards}
            draft={draftSet}
            onToggle={toggle}
            onVisible={onVisible}
          />
          <ChartSection
            title="Agents"
            description="Select agents to add individual charts"
            cards={agentCards}
            draft={draftSet}
            onToggle={toggle}
            onVisible={onVisible}
          />
        </div>

        <footer className="add-charts-modal__foot">
          <div className="add-charts-modal__selection" aria-live="polite">
            <span className="add-charts-modal__selection-icon" aria-hidden>
              <ChartsGridIcon />
            </span>
            <div className="add-charts-modal__selection-text">
              <p className="add-charts-modal__selected">{selectedLabel}</p>
              <p className="add-charts-modal__selection-hint">
                Choose charts to add to your dashboard
              </p>
            </div>
          </div>
          <div className="add-charts-modal__foot-actions">
            <button
              type="button"
              className="add-charts-modal__cancel"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="add-charts-modal__apply"
              onClick={applyOrdered}
            >
              <ApplyCheckIcon />
              Apply
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
