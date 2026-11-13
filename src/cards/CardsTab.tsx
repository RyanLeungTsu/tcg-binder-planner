import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, MouseEvent } from "react";
import { CARD_PROVIDERS } from "../cards/providers";
import type { CardGameId, CardSet, NormalizedCard, Wishlist } from "./types";
import "./CardsTab.css";
// component imports
import Basket from "../components/Basket";

type CardsTabProps = {
  onAddToBasket?: (card: NormalizedCard) => void;
  basket: NormalizedCard[];
  basketOpen: boolean;
  basketPage: number;
  onToggleBasket: () => void;
  onCloseBasket: () => void;
  onBasketPageChange: (page: number) => void;
  onAddBasketCardToPage: (basketIndex: number) => void;
  onRemoveBasketCard: (basketIndex: number) => void;
  wishlists: Wishlist[];
  onAddCardToWishlist: (card: NormalizedCard, wishlistId: string) => void;
  onOpenImage: (image: string) => void;
};

const PAGE_SIZE = 20;

const GAME_OPTIONS: Array<{ value: CardGameId; label: string }> = [
  { value: "pokemon", label: "Pokémon" },
  { value: "yugioh", label: "Yu-Gi-Oh!" },
  { value: "mtg", label: "Magic: The Gathering" },
];

export default function CardsTab({
  onAddToBasket,
  basket,
  basketOpen,
  basketPage,
  onToggleBasket,
  onCloseBasket,
  onBasketPageChange,
  onAddBasketCardToPage,
  onRemoveBasketCard,
  wishlists,
  onAddCardToWishlist,
  onOpenImage,
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
  const [pokemonLanguage, setPokemonLanguage] = useState<"en" | "jp" | "both">(
    "en",
  );
  const [includePocket, setIncludePocket] = useState(false);
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

  // wishlist
  const [wishlistPickerCardId, setWishlistPickerCardId] = useState<
    string | null
  >(null);
  // card anim
  function animateCardToBasket(
    event: MouseEvent<HTMLButtonElement>,
    card: NormalizedCard,
  ) {
    const source = event.currentTarget
      .closest(".catalogue-card")
      ?.querySelector(".catalogue-card-image");

    const target = document.querySelector(".basket-toggle");

    if (!source || !target) {
      onAddToBasket?.(card);
      return;
    }

    // reduced-motion pref
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onAddToBasket?.(card);
      return;
    }

    const sourceBounds = source.getBoundingClientRect();
    const targetBounds = target.getBoundingClientRect();

    // temp copy of card for anims
    const flyingCard = source.cloneNode(true) as HTMLElement;

    Object.assign(flyingCard.style, {
      position: "fixed",
      top: `${sourceBounds.top}px`,
      left: `${sourceBounds.left}px`,
      width: `${sourceBounds.width}px`,
      height: `${sourceBounds.height}px`,
      margin: "0",
      zIndex: "9999",
      pointerEvents: "none",
      overflow: "hidden",
      borderRadius: "0.5rem",
      boxShadow: "0 0.75rem 2rem #00000080",
      transformOrigin: "top left",
    });

    document.body.appendChild(flyingCard);

    // for distance to basket
    const moveX =
      targetBounds.left + targetBounds.width / 2 - sourceBounds.left;
    const moveY = targetBounds.top + targetBounds.height / 2 - sourceBounds.top;

    const scale = Math.min(
      targetBounds.width / sourceBounds.width,
      targetBounds.height / sourceBounds.height,
    );

    // guard to add cards regardless of anim
    onAddToBasket?.(card);

    // anims temp card to basket
    const animation = flyingCard.animate(
      [
        {
          transform: "translate(0, 0) scale(1)",
          opacity: 1,
        },
        {
          transform: `translate(${moveX * 0.45}px, ${moveY * 0.35}px) scale(0.8)`,
          opacity: 1,
          offset: 0.45,
        },
        {
          transform: `translate(${moveX}px, ${moveY}px) scale(${scale})`,
          opacity: 0,
        },
      ],
      {
        duration: 900,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "forwards",
      },
    );

    animation.onfinish = () => {
      flyingCard.remove();
    };
  }

  function animateBasketCardToGallery(basketIndex: number) {
    // finds the visible basket card
    const source = Array.from(
      document.querySelectorAll<HTMLElement>(".basket-card[data-basket-index]"),
    ).find(
      (element) =>
        element.getClientRects().length > 0 &&
        Number(element.dataset.basketIndex) === basketIndex,
    );

    if (
      !source ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      onRemoveBasketCard(basketIndex);
      return;
    }

    const bounds = source.getBoundingClientRect();

    // temp copy of anim card
    const flyingCard = source.cloneNode(true) as HTMLElement;

    Object.assign(flyingCard.style, {
      position: "fixed",
      top: `${bounds.top}px`,
      left: `${bounds.left}px`,
      width: `${bounds.width}px`,
      height: `${bounds.height}px`,
      margin: "0",
      zIndex: "99999",
      pointerEvents: "none",
      overflow: "hidden",
      borderRadius: "0.5rem",
      boxShadow: "0 0.75rem 2rem #00000080",
    });

    document.body.appendChild(flyingCard);

    // card flies to center of viewport
    const moveX = window.innerWidth / 2 - (bounds.left + bounds.width / 2);
    const moveY = window.innerHeight / 2 - (bounds.top + bounds.height / 2);

    const animation = flyingCard.animate(
      [
        {
          transform: "translate(0, 0) scale(1)",
          opacity: 1,
        },
        {
          transform: `translate(${moveX}px, ${moveY}px) scale(0.5)`,
          opacity: 0,
        },
      ],
      {
        duration: 550,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "forwards",
      },
    );

    // card removes instatnly
    onRemoveBasketCard(basketIndex);

    // temp copdy anim
    animation.onfinish = () => {
      flyingCard.remove();
    };

    animation.oncancel = () => {
      flyingCard.remove();
    };
  }

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

  async function searchCards(
    event?: FormEvent<HTMLFormElement>,
    pocketOverride = includePocket,
  ) {
    event?.preventDefault();

    // start new search, inv old reqs
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
        {
          query,
          setId,
          category,
          archetype,
          ...(game === "pokemon" && {
            language: pokemonLanguage,
            includePocket: pocketOverride,
          }),
        },
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
        {
          query,
          setId,
          category,
          archetype,
          ...(game === "pokemon" && {
            language: pokemonLanguage,
            includePocket,
          }),
        },
        nextPage,
        PAGE_SIZE,
      );

      // ignore prew serach responsne
      if (searchVersion !== searchVersionRef.current) return;

      setResults((current) => {
        // guard for dups
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
    game,
    hasMore,
    includePocket,
    pokemonLanguage,
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
        // auto laod on scroll for card search
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
    <>
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
                onChange={(event) =>
                  changeGame(event.target.value as CardGameId)
                }
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

          {game === "pokemon" && (
            <>
              <div className="cards-field">
                <label htmlFor="pokemon-language">Card language</label>
                <select
                  id="pokemon-language"
                  value={pokemonLanguage}
                  onChange={(event) =>
                    setPokemonLanguage(
                      event.target.value as "en" | "jp" | "both",
                    )
                  }
                >
                  <option value="en">English</option>
                  <option value="jp">Japanese</option>
                  <option value="both">Both</option>
                </select>
              </div>

              <label className="cards-checkbox">
                <input
                  type="checkbox"
                  checked={includePocket}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setIncludePocket(checked);

                    if (hasSearched) {
                      searchCards(undefined, checked);
                    }
                  }}
                />
                Pokémon TCG Pocket
              </label>
            </>
          )}

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
            <Basket
              basket={basket}
              basketOpen={basketOpen}
              basketPage={basketPage}
              onToggle={onToggleBasket}
              onClose={onCloseBasket}
              onPageChange={onBasketPageChange}
              onAddToPage={onAddBasketCardToPage}
              onRemoveCard={animateBasketCardToGallery}
            />
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
                  <article
                    className="catalogue-card"
                    data-card-id={card.id}
                    key={card.id}
                  >
                    <div className="catalogue-card-image">
                      {card.imageUrl ? (
                        <img
                          src={card.imageUrl}
                          alt={card.name}
                          loading="lazy"
                          onClick={() => onOpenImage(card.imageUrl!)}
                        />
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

                      {card.variants && card.variants.length > 0 && (
                        <div className="catalogue-card-variant">
                          <div className="catalogue-card-variant-options">
                            {card.variants.map((variant) => (
                              <button
                                key={variant.id}
                                type="button"
                                className={`catalogue-card-variant-option ${
                                  (card.selectedVariantId ??
                                    card.variants?.[0]?.id) === variant.id
                                    ? "selected"
                                    : ""
                                }`}
                                onClick={() => {
                                  setResults((current) =>
                                    current.map((item) =>
                                      item.id === card.id
                                        ? {
                                            ...item,
                                            selectedVariantId: variant.id,
                                            prices: variant.prices,
                                          }
                                        : item,
                                    ),
                                  );
                                }}
                              >
                                {variant.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="catalogue-card-prices">
                        {card.prices && card.prices.length > 0 ? (
                          card.prices.map((price, index) => (
                            <p
                              key={`${price.source}-${price.currency}-${index}`}
                            >
                              <span>{price.source}</span>
                              <strong>
                                {typeof price.market === "number"
                                  ? new Intl.NumberFormat(undefined, {
                                      style: "currency",
                                      currency: price.currency,
                                    }).format(price.market)
                                  : "Price unavailable"}
                              </strong>
                            </p>
                          ))
                        ) : (
                          <p className="catalogue-price-unavailable">
                            Price unavailable
                          </p>
                        )}
                      </div>

                      <div className="catalogue-card-actions">
                        <button
                          className="catalogue-add-button"
                          type="button"
                          onClick={(event) => animateCardToBasket(event, card)}
                          disabled={!onAddToBasket}
                          title={
                            !onAddToBasket ? "" : "Add this card to your basket"
                          }
                        >
                          + Add to basket
                        </button>

                        <div className="wishlist-picker">
                          <button
                            className="wishlist-star-button"
                            type="button"
                            aria-label={`Add ${card.name} to a wishlist`}
                            aria-expanded={wishlistPickerCardId === card.id}
                            title="Add to wishlist"
                            onClick={() =>
                              setWishlistPickerCardId((current) =>
                                current === card.id ? null : card.id,
                              )
                            }
                          >
                            {wishlistPickerCardId === card.id ? "★" : "☆"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              {wishlistPickerCardId && (
                <div
                  className="wishlist-picker-overlay"
                  onClick={() => setWishlistPickerCardId(null)}
                >
                  <div
                    className="wishlist-picker-popup"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="wishlist-picker-heading"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <p
                      className="wishlist-picker-heading"
                      id="wishlist-picker-heading"
                    >
                      Add to wishlist
                    </p>

                    {wishlists.length === 0 ? (
                      <p className="wishlist-picker-empty">
                        You haven't created any wishlists yet.
                      </p>
                    ) : (
                      <div className="wishlist-picker-list">
                        {wishlists.map((wishlist) => (
                          <button
                            key={wishlist.id}
                            type="button"
                            className="wishlist-picker-option"
                            onClick={() => {
                              const card = results.find(
                                (item) => item.id === wishlistPickerCardId,
                              );

                              if (!card) return;

                              onAddCardToWishlist(card, wishlist.id);
                              setWishlistPickerCardId(null);
                            }}
                          >
                            <span>{wishlist.name}</span>
                            <span className="wishlist-picker-arrow">+</span>
                          </button>
                        ))}
                      </div>
                    )}

                    <button
                      className="wishlist-picker-close"
                      type="button"
                      onClick={() => setWishlistPickerCardId(null)}
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}

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
    </>
  );
}
