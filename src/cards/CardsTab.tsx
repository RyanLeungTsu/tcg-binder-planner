import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { CARD_PROVIDERS } from "./providers";
import type { CardGameId, CardSet, NormalizedCard } from "./types";
import "./CardsTab.css";

type CardsTabProps = {
  onAddToBasket?: (card: NormalizedCard) => void;
  basketCount?: number;
};

const PAGE_SIZE = 20;

const GAME_OPTIONS: Array<{ value: CardGameId; label: string }> = [
  { value: "pokemon", label: "Pokémon" },
  { value: "yugioh", label: "Yu-Gi-Oh!" },
  { value: "mtg", label: "Magic: The Gathering" },
];

export default function CardsTab({
  onAddToBasket,
  basketCount = 0,
}: CardsTabProps) {
  const [game, setGame] = useState<CardGameId>("pokemon");
  const provider = CARD_PROVIDERS[game];

  const [sets, setSets] = useState<CardSet[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [archetypes, setArchetypes] = useState<string[]>([]);
  const [categoryLabel, setCategoryLabel] = useState("Card type");
  const [archetypeLabel, setArchetypeLabel] = useState("Archetype");

  const [query, setQuery] = useState("");
  const [setId, setSetId] = useState("");
  const [category, setCategory] = useState("");
  const [archetype, setArchetype] = useState("");
  const [results, setResults] = useState<NormalizedCard[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);
  const searchVersionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    // setSets([]);
    // setCategories([]);
    // setArchetypes([]);
    // setSetId("");
    // setCategory("");
    // setArchetype("");
    // setResults([]);
    // setPage(1);
    // setHasMore(false);
    // setError("");
    // setHasSearched(false);

    Promise.all([provider.getSets(), provider.getFilterOptions()])
      .then(([nextSets, options]) => {
        if (cancelled) return;

        setSets(nextSets);
        setCategories(options.categories);
        setArchetypes(options.archetypes);
        setCategoryLabel(options.categoryLabel);
        setArchetypeLabel(options.archetypeLabel);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load this game's filters.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [provider]);

  async function searchCards(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    // Note to self: invalidate any older request before starting a new search.
    const searchVersion = ++searchVersionRef.current;

    loadingMoreRef.current = false;
    setLoading(true);
    setLoadingMore(false);
    setError("");
    setHasSearched(true);
    setResults([]);
    setPage(1);
    setHasMore(false);

    try {
      const cards = await provider.searchCards(
        { query, setId, category, archetype },
        1,
        PAGE_SIZE,
      );

      if (searchVersion !== searchVersionRef.current) return;

      setResults(cards);
      setPage(1);
      setHasMore(cards.length === PAGE_SIZE);

      if (cards.length === 0) {
        setError("No cards matched those filters. Try changing your search.");
      }
    } catch (reason) {
      if (searchVersion !== searchVersionRef.current) return;

      setResults([]);
      setHasMore(false);
      setError(
        reason instanceof Error ? reason.message : "Card search failed.",
      );
    } finally {
      if (searchVersion === searchVersionRef.current) {
        setLoading(false);
      }
    }
  }

  const loadMoreCards = useCallback(async () => {
    if (!hasSearched || !hasMore || loading || loadingMoreRef.current) {
      return;
    }

    loadingMoreRef.current = true;
    setLoadingMore(true);
    setError("");

    const searchVersion = searchVersionRef.current;
    const nextPage = page + 1;

    try {
      const cards = await provider.searchCards(
        { query, setId, category, archetype },
        nextPage,
        PAGE_SIZE,
      );

      // Ignore responses belonging to a previous search.
      if (searchVersion !== searchVersionRef.current) return;

      setResults((current) => {
        // Note to self: guard against duplicates if an API returns overlapping pages.
        const existingIds = new Set(current.map((card) => card.id));
        const newCards = cards.filter((card) => !existingIds.has(card.id));
        return [...current, ...newCards];
      });

      setPage(nextPage);
      setHasMore(cards.length === PAGE_SIZE);
    } catch (reason) {
      if (searchVersion === searchVersionRef.current) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load more cards.",
        );
      }
    } finally {
      if (searchVersion === searchVersionRef.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [
    archetype,
    category,
    hasMore,
    hasSearched,
    loading,
    page,
    provider,
    query,
    setId,
  ]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasSearched || !hasMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMoreCards();
        }
      },
      {
        // Start loading before the user reaches the very bottom
        rootMargin: "500px 0px",
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, hasSearched, loading, loadMoreCards, results.length]);

  function changeGame(nextGame: CardGameId) {
    searchVersionRef.current += 1;
    loadingMoreRef.current = false;
    setGame(nextGame);
    setQuery("");
    setResults([]);
    setPage(1);
    setHasMore(false);
    setLoading(false);
    setLoadingMore(false);
    setError("");
    setHasSearched(false);
  }

  return (
    <main className="cards-area">
      <aside className="cards-sidebar">
        <div className="cards-sidebar-heading">
          <p className="cards-eyebrow">CARD CATALOGUE</p>
          <h2>Search settings</h2>
          <p>
            Choose a game, then narrow the results using that game's available
            data.
          </p>
        </div>

        <form className="cards-filter-form" onSubmit={searchCards}>
          <div className="cards-field">
            <label htmlFor="card-game">Card game</label>
            <select
              id="card-game"
              value={game}
              onChange={(event) => changeGame(event.target.value as CardGameId)}
            >
              {GAME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="cards-field">
            <label htmlFor="card-search">Search cards</label>
            <input
              id="card-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name or keyword..."
            />
          </div>

          <div className="cards-field">
            <label htmlFor="card-set">Set / expansion</label>
            <select
              id="card-set"
              value={setId}
              onChange={(event) => setSetId(event.target.value)}
            >
              <option value="">All sets</option>
              {sets.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.name}
                </option>
              ))}
            </select>
          </div>

          <div className="cards-field">
            <label htmlFor="card-category">{categoryLabel}</label>
            <select
              id="card-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">All types</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="cards-field">
            <label htmlFor="card-archetype">{archetypeLabel}</label>
            <select
              id="card-archetype"
              value={archetype}
              onChange={(event) => setArchetype(event.target.value)}
            >
              <option value="">All {archetypeLabel.toLowerCase()}s</option>
              {archetypes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            {game === "pokemon" && (
              <p className="cards-help">
                Pokémon suffixes and variants vary by card era and set.
              </p>
            )}
          </div>

          <button
            className="cards-search-button"
            type="submit"
            disabled={loading}
          >
            {loading ? "Searching…" : "Search cards"}
          </button>
        </form>

        <div className="cards-sidebar-footer">
          <span className="cards-status-dot" />
          <span>Card data provided by {provider.label}</span>
        </div>
      </aside>

      <section className="cards-results">
        <header className="cards-results-header">
          <div>
            <p className="cards-snippet">COLLECTION</p>
            <h1>Cards</h1>
            <p className="cards-subtitle">{provider.description}</p>
          </div>
          <div className="cards-basket-count" aria-live="polite">
            Basket <strong>{basketCount}</strong>
          </div>
        </header>

        {error && (
          <p className="cards-message cards-error" role="status">
            {error}
          </p>
        )}

        {!hasSearched && !loading && (
          <div className="cards-empty-state">
            <span className="cards-empty-icon">⌕</span>
            <h2>Find your next card</h2>
            <p>
              Search by name or select a set, then apply any game-specific
              filters.
            </p>
          </div>
        )}

        {loading && <p className="cards-message">Loading cards…</p>}

        {!loading && results.length > 0 && (
          <>
            <p className="cards-result-count">
              Showing {results.length} cards
              {hasMore
                ? " · Scroll down to load more"
                : " · All matching results loaded"}
            </p>

            <div className="cards-grid">
              {results.map((card) => (
                <article className="catalogue-card" key={card.id}>
                  <div className="catalogue-card-image">
                    {card.imageUrl ? (
                      <img src={card.imageUrl} alt={card.name} loading="lazy" />
                    ) : (
                      <div className="catalogue-card-no-image">
                        Image unavailable
                      </div>
                    )}
                  </div>

                  <div className="catalogue-card-info">
                    <h2 title={card.name}>{card.name}</h2>
                    <p className="catalogue-card-set">
                      {card.setName}
                      {card.number ? ` · ${card.number}` : ""}
                    </p>

                    {card.detail && (
                      <p className="catalogue-card-detail">{card.detail}</p>
                    )}

                    <button
                      className="catalogue-add-button"
                      type="button"
                      onClick={() => onAddToBasket?.(card)}
                      disabled={!onAddToBasket}
                      title={
                        !onAddToBasket
                          ? "Connect the basket handler in App.tsx to enable adding cards."
                          : "Add this card to your basket"
                      }
                    >
                      + Add to basket
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <div
              className="cards-load-more"
              ref={sentinelRef}
              aria-live="polite"
            >
              {loadingMore && (
                <p className="cards-message">Loading more cards…</p>
              )}
              {!hasMore && <p>You've reached the end of the results.</p>}
            </div>
          </>
        )}

        {!loading && hasSearched && results.length === 0 && !error && (
          <div className="cards-empty-state">
            <h2>No results yet</h2>
            <p>Try another name or set.</p>
          </div>
        )}
      </section>
    </main>
  );
}
