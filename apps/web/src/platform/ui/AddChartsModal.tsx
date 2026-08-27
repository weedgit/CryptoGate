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

const PAGE_SIZE = 6;

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
  cards,
  draft,
  onToggle,
  onVisible,
}: {
  title: string;
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

  if (cards.length === 0) {
    return (
      <section className="add-charts-modal__section">
        <h3 className="add-charts-modal__cat">{title}</h3>
        <p className="muted">No matching charts.</p>
      </section>
    );
  }

  const visible = cards.slice(0, limit);
  const hasMore = visible.length < cards.length;

  return (
    <section className="add-charts-modal__section">
      <h3 className="add-charts-modal__cat">
        {title}
        <span className="add-charts-modal__count">
          {hasMore ? `${visible.length} / ${cards.length}` : String(cards.length)}
        </span>
      </h3>
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

  useEffect(() => {
    if (!open) return;
    setDraft(selectedIds);
    setQuery("");
    setResolved({});
    inflight.current.clear();
  }, [open, selectedIds]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
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
          <h2 id="add-charts-title">Add charts</h2>
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
            <input
              type="search"
              value={query}
              placeholder="Search platform, merchants, agents…"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <p className="add-charts-modal__hint muted">
            Scroll to browse accounts. Chart history loads as each card enters
            view.
          </p>
        </div>

        <div className="add-charts-modal__body">
          <ChartSection
            title="Platform"
            cards={filteredPlatform}
            draft={draftSet}
            onToggle={toggle}
          />
          <ChartSection
            title="Merchants"
            cards={merchantCards}
            draft={draftSet}
            onToggle={toggle}
            onVisible={onVisible}
          />
          <ChartSection
            title="Agents"
            cards={agentCards}
            draft={draftSet}
            onToggle={toggle}
            onVisible={onVisible}
          />
        </div>

        <footer className="add-charts-modal__foot">
          <button type="button" className="add-charts-modal__cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="add-charts-modal__apply"
            onClick={applyOrdered}
          >
            Apply
          </button>
        </footer>
      </div>
    </div>
  );
}
