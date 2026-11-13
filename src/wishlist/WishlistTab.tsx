import { useState } from "react";
import type { FormEvent, DragEvent } from "react";
import type { Wishlist, WishlistItem } from "../cards/types";
import "./WishlistTab.css";

type WishlistTabProps = {
  wishlists: Wishlist[];
  onCreateWishlist: (name: string) => void;
  onRenameWishlist: (id: string, name: string) => void;
  onUpdateWishlistItems: (id: string, items: WishlistItem[]) => void;
  onDeleteWishlist: (id: string) => void;
  onOpenImage: (image: string) => void;
};


// calculate wishlist total price
function getWishlistPricing(items: WishlistItem[]) {
  const totals = new Map<
    string,
    { source: string; currency: string; total: number }
  >();

  let missingPriceCount = 0;

  for (const item of items) {
    if (item.type !== "card") continue;

    const quantity = Math.max(1, item.quantity ?? 1);
    const prices = item.card.prices ?? [];

    const hasUsablePrice = prices.some(
      (price) =>
        typeof price.market === "number" &&
        Number.isFinite(price.market),
    );

    // cards without usable prices count as zero
    if (!hasUsablePrice) {
      missingPriceCount += quantity;
    }

    for (const price of prices) {
      if (
        typeof price.market !== "number" ||
        !Number.isFinite(price.market)
      ) {
        continue;
      }

      const key = `${price.source}::${price.currency}`;
      const existing = totals.get(key);

      if (existing) {
        existing.total += price.market * quantity;
      } else {
        totals.set(key, {
          source: price.source,
          currency: price.currency,
          total: price.market * quantity,
        });
      }
    }
  }

  return {
    totals: Array.from(totals.values()),
    missingPriceCount,
  };
}

function formatWishlistPrice(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(value);
}

function WishlistTab({
  wishlists,
  onCreateWishlist,
  onRenameWishlist,
  onUpdateWishlistItems,
  onDeleteWishlist,
  onOpenImage,
}: WishlistTabProps) {
  const [newWishlistName, setNewWishlistName] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [editingWishlistId, setEditingWishlistId] = useState<string | null>(
    null,
  );
  const [editingWishlistName, setEditingWishlistName] = useState("");

  const [activeWishlistId, setActiveWishlistId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");

  const activeWishlist =
    wishlists.find((wishlist) => wishlist.id === activeWishlistId) ?? null;

  const wishlistPricing = activeWishlist
    ? getWishlistPricing(activeWishlist.items)
    : null;

  const [editingQuantityId, setEditingQuantityId] = useState<string | null>(
    null,
  );
  const [quantityInput, setQuantityInput] = useState("");

  // creates an empty wishlist
  function handleCreateWishlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = newWishlistName.trim();
    if (!name) return;

    onCreateWishlist(name);
    setNewWishlistName("");
    setShowCreateForm(false);
  }

  // open wishlist
  function openWishlist(id: string) {
    setActiveWishlistId(id);
    setViewMode("list");
    setFeedback("");
  }

  // close wishlist
  function closeWishlist() {
    setActiveWishlistId(null);
    setDraggedItemId(null);
    setDropTargetId(null);
    setFeedback("");
  }

  // for name edit
  function startEditingWishlist(id: string, name: string) {
    setEditingWishlistId(id);
    setEditingWishlistName(name);
  }

  function handleRenameWishlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = editingWishlistName.trim();
    if (!editingWishlistId || !name) return;

    onRenameWishlist(editingWishlistId, name);
    setEditingWishlistId(null);
    setEditingWishlistName("");
    setFeedback("Wishlist renamed.");
  }

  // for wishlist deletion
  function handleDeleteWishlist(id: string, name: string) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${name}"? This cannot be undone.`,
    );

    if (!confirmed) return;

    onDeleteWishlist(id);

    if (activeWishlistId === id) {
      closeWishlist();
    }

    if (editingWishlistId === id) {
      setEditingWishlistId(null);
      setEditingWishlistName("");
    }
  }

  // update wishlist items
  function updateItems(items: WishlistItem[]) {
    if (!activeWishlist) return;
    onUpdateWishlistItems(activeWishlist.id, items);
  }

  // remove a card from the wishlist
  function removeCard(id: string) {
    if (!activeWishlist) return;

    updateItems(activeWishlist.items.filter((item) => item.id !== id));
  }

  // comments for cards
  function updateComment(id: string, comment: string) {
    if (!activeWishlist) return;

    updateItems(
      activeWishlist.items.map((item) =>
        item.id === id && item.type === "card" ? { ...item, comment } : item,
      ),
    );
  }

  // update qty
  function updateQuantity(id: string, quantity: number) {
    if (!activeWishlist || !Number.isFinite(quantity)) return;

    const safeQuantity = Math.max(1, Math.floor(quantity));

    updateItems(
      activeWishlist.items.map((item) =>
        item.id === id && item.type === "card"
          ? { ...item, quantity: safeQuantity }
          : item,
      ),
    );
  }

  // owned toggle
  function toggleOwned(id: string) {
    if (!activeWishlist) return;

    updateItems(
      activeWishlist.items.map((item) =>
        item.id === id && item.type === "card"
          ? { ...item, owned: !item.owned }
          : item,
      ),
    );

    setFeedback("Card ownership updated.");
  }

  // adds divider
  function addSection() {
    if (!activeWishlist) return;

    const section = {
      id: crypto.randomUUID(),
      type: "section" as const,
      title: "New section",
    };

    updateItems([section, ...activeWishlist.items]);
    setFeedback("Section added.");
  }

  // divider section title
  function updateSectionTitle(id: string, title: string) {
    if (!activeWishlist) return;

    updateItems(
      activeWishlist.items.map((item) =>
        item.id === id && item.type === "section" ? { ...item, title } : item,
      ),
    );
  }

  // for dragging items
  function handleDragStart(event: DragEvent<HTMLElement>, id: string) {
    setDraggedItemId(id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
  }

  function handleDrop(event: DragEvent<HTMLElement>, targetId: string) {
    event.preventDefault();

    if (!activeWishlist || !draggedItemId || draggedItemId === targetId) {
      setDraggedItemId(null);
      setDropTargetId(null);
      return;
    }

    const items = [...activeWishlist.items];
    const fromIndex = items.findIndex((item) => item.id === draggedItemId);
    const toIndex = items.findIndex((item) => item.id === targetId);

    if (fromIndex === -1 || toIndex === -1) return;

    const [movedItem] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, movedItem);

    updateItems(items);
    setFeedback("Item moved.");

    setDraggedItemId(null);
    setDropTargetId(null);
  }

  function handleDragEnd() {
    setDraggedItemId(null);
    setDropTargetId(null);
  }

  return (
    <main className="wishlist-page">
      <header className="wishlist-header">
        <div>
          <p className="wishlist-eyebrow">YOUR COLLECTION</p>
          <h1>Wishlists</h1>
          <p className="wishlist-description">
            Keep track of the cards you're looking for.
          </p>
        </div>

        {wishlists.length > 0 && !showCreateForm && (
          <button
            type="button"
            className="wishlist-create-button"
            onClick={() => setShowCreateForm(true)}
          >
            + New wishlist
          </button>
        )}
      </header>

      {showCreateForm && (
        <form className="wishlist-create-form" onSubmit={handleCreateWishlist}>
          <label htmlFor="new-wishlist-name">Wishlist name</label>

          <div className="wishlist-create-fields">
            <input
              id="new-wishlist-name"
              type="text"
              placeholder="e.g. Pokémon Collection"
              value={newWishlistName}
              onChange={(event) => setNewWishlistName(event.target.value)}
              autoFocus
              maxLength={40}
            />

            <button type="submit" disabled={!newWishlistName.trim()}>
              Create
            </button>

            <button
              type="button"
              className="wishlist-cancel-button"
              onClick={() => {
                setShowCreateForm(false);
                setNewWishlistName("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {wishlists.length === 0 ? (
        <section className="wishlist-empty">
          <div className="wishlist-empty-icon">☆</div>
          <h2>No wishlists yet</h2>
          <p>
            Create your first wishlist to start keeping track of cards you want
            to collect.
          </p>

          {!showCreateForm && (
            <button
              type="button"
              className="wishlist-create-button"
              onClick={() => setShowCreateForm(true)}
            >
              + Create your first wishlist
            </button>
          )}
        </section>
      ) : (
        <section className="wishlist-grid">
          {wishlists.map((wishlist) => {
            const firstCard = wishlist.items.find(
              (item) => item.type === "card",
            );
            const isEditing = editingWishlistId === wishlist.id;
            const cardCount = wishlist.items.reduce((total, item) => {
              if (item.type !== "card" || !item.owned) return total;

              return total + Math.max(1, item.quantity ?? 1);
            }, 0);

            return (
              <article className="wishlist-tile" key={wishlist.id}>
                <button
                  type="button"
                  className="wishlist-open-button"
                  onClick={() => openWishlist(wishlist.id)}
                  aria-label={`Open ${wishlist.name}`}
                >
                  <div className="wishlist-thumbnail">
                    {firstCard?.type === "card" && firstCard.card.imageUrl ? (
                      <img
                        src={firstCard.card.imageUrl}
                        alt={firstCard.card.name}
                        loading="lazy"
                      />
                    ) : (
                      <div className="wishlist-thumbnail-placeholder">
                        <span>☆</span>
                      </div>
                    )}
                  </div>

                  <div className="wishlist-tile-heading">
                    <h2 title={wishlist.name}>{wishlist.name}</h2>
                    <span>
                      {cardCount} {cardCount === 1 ? "card" : "cards"}
                    </span>
                  </div>
                </button>

                <div className="wishlist-tile-info">
                  {isEditing ? (
                    <form
                      className="wishlist-rename-form"
                      onSubmit={handleRenameWishlist}
                    >
                      <input
                        type="text"
                        aria-label="New wishlist name"
                        value={editingWishlistName}
                        onChange={(event) =>
                          setEditingWishlistName(event.target.value)
                        }
                        maxLength={40}
                        autoFocus
                      />

                      <div className="wishlist-rename-actions">
                        <button
                          type="submit"
                          disabled={!editingWishlistName.trim()}
                        >
                          Save
                        </button>

                        <button
                          type="button"
                          className="wishlist-cancel-button"
                          onClick={() => {
                            setEditingWishlistId(null);
                            setEditingWishlistName("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="wishlist-edit-button"
                      onClick={() =>
                        startEditingWishlist(wishlist.id, wishlist.name)
                      }
                    >
                      Edit name
                    </button>
                  )}
                  <button
                    type="button"
                    className="wishlist-delete-button"
                    onClick={() => handleDeleteWishlist(wishlist.id, wishlist.name)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {activeWishlist && (
        <div
          className="wishlist-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeWishlist();
          }}
        >
          <section
            className="wishlist-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wishlist-modal-title"
          >
            <header className="wishlist-modal-header">
              <div className="wishlist-modal-title">
                <p className="wishlist-eyebrow">YOUR COLLECTION</p>
                <h2 id="wishlist-modal-title">{activeWishlist.name}</h2>
                <span>
                  {activeWishlist.items.reduce(
                    (total, item) =>
                      item.type === "card" ? total + item.quantity : total,
                    0,
                  )}{" "}
                  cards
                </span>
              </div>

              <button
                type="button"
                className="wishlist-modal-close"
                onClick={closeWishlist}
                aria-label="Close wishlist"
              >
                ×
              </button>
            </header>

            <div className="wishlist-modal-toolbar">
              <div className="wishlist-view-toggle">
                <button
                  type="button"
                  className={viewMode === "list" ? "active" : ""}
                  onClick={() => setViewMode("list")}
                  aria-pressed={viewMode === "list"}
                >
                  ☰ List
                </button>
                <button
                  type="button"
                  className={viewMode === "grid" ? "active" : ""}
                  onClick={() => setViewMode("grid")}
                  aria-pressed={viewMode === "grid"}
                >
                  ▦ Grid
                </button>
              </div>

              <button
                type="button"
                className="wishlist-add-section-button"
                onClick={addSection}
              >
                + Add section
              </button>
            </div>

            {/* wishlist price summary */}
            {wishlistPricing && (
              <div className="wishlist-pricing-summary">
                <div className="wishlist-pricing-heading">
                  <h3>Wishlist value</h3>

                  {wishlistPricing.totals.length > 0 ? (
                    <div className="wishlist-pricing-totals">
                      {wishlistPricing.totals.map((total) => (
                        <p key={`${total.source}-${total.currency}`}>
                          <span>{total.source}</span>
                          <strong>
                            {formatWishlistPrice(total.total, total.currency)}
                          </strong>
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="wishlist-pricing-zero">Total: 0</p>
                  )}

                  <p className="wishlist-pricing-missing">
                    ({wishlistPricing.missingPriceCount}{" "}
                    {wishlistPricing.missingPriceCount === 1
                      ? "card has"
                      : "cards have"}{" "}
                    no price data)
                  </p>
                </div>
              </div>
            )}

            {feedback && (
              <p className="wishlist-feedback" role="status">
                {feedback}
              </p>
            )}

            <div className={`wishlist-items wishlist-items-${viewMode}`}>
              {activeWishlist.items.length === 0 ? (
                <div className="wishlist-modal-empty">
                  <span>☆</span>
                  <h3>This wishlist is empty</h3>
                  <p>Add cards from the Cards tab to get started.</p>
                </div>
              ) : (
                activeWishlist.items.map((item) => {
                  if (item.type === "section") {
                    return (
                      <div
                        className={`wishlist-section ${
                          dropTargetId === item.id ? "drop-target" : ""
                        }`}
                        key={item.id}
                        draggable
                        onDragStart={(event) => handleDragStart(event, item.id)}
                        onDragOver={(event) => {
                          event.preventDefault();
                          setDropTargetId(item.id);
                        }}
                        onDrop={(event) => handleDrop(event, item.id)}
                        onDragEnd={handleDragEnd}
                      >
                        <span
                          className="wishlist-drag-handle"
                          aria-hidden="true"
                        >
                          ⠿
                        </span>
                        <input
                          type="text"
                          value={item.title}
                          maxLength={40}
                          aria-label="Section title"
                          onChange={(event) =>
                            updateSectionTitle(item.id, event.target.value)
                          }
                        />
                      </div>
                    );
                  }

                  return (
                    <article
                      className={`wishlist-card ${
                        item.owned ? "is-owned" : ""
                      } ${draggedItemId === item.id ? "is-dragging" : ""} ${
                        dropTargetId === item.id ? "drop-target" : ""
                      }`}
                      key={item.id}
                      draggable
                      onDragStart={(event) => handleDragStart(event, item.id)}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDropTargetId(item.id);
                      }}
                      onDrop={(event) => handleDrop(event, item.id)}
                      onDragEnd={handleDragEnd}
                    >
                      <span
                        className="wishlist-drag-handle"
                        aria-label="Drag to reorder"
                      >
                        ⠿
                      </span>

                      {item.card.imageUrl ? (
                        <img
                          className="wishlist-card-image"
                          src={item.card.imageUrl}
                          alt={item.card.name}
                          loading="lazy"
                          onClick={() => onOpenImage(item.card.imageUrl!)}
                        />
                      ) : (
                        <div className="wishlist-card-image-placeholder">☆</div>
                      )}

                      <div className="wishlist-card-details">
                        <h3>{item.card.name}</h3>
                        <p>{item.card.setName || "Unknown set"}</p>
                        <div className="wishlist-card-pricing">
                          {(() => {
                            const selectedVariant =
                              item.card.variants?.find(
                                (variant) => variant.id === item.card.selectedVariantId,
                              ) ?? item.card.variants?.[0];

                            return selectedVariant ? (
                              <span className="wishlist-card-variant">
                                {selectedVariant.label}
                              </span>
                            ) : null;
                          })()}

                          {item.card.prices && item.card.prices.length > 0 ? (
                            item.card.prices.map((price, index) => (
                              <p key={`${price.source}-${price.currency}-${index}`}>
                                <span>{price.source}</span>
                                <strong>
                                  {typeof price.market === "number"
                                    ? formatWishlistPrice(price.market, price.currency)
                                    : "Price unavailable"}
                                </strong>
                              </p>
                            ))
                          ) : (
                            <p className="wishlist-card-price-unavailable">
                              Price unavailable
                            </p>
                          )}
                        </div>
                        <label className="wishlist-comment-label">
                          Comment
                          <input
                            type="text"
                            value={item.comment}
                            placeholder="Add a note..."
                            maxLength={200}
                            onChange={(event) =>
                              updateComment(item.id, event.target.value)
                            }
                          />
                        </label>

                        <div className="wishlist-quantity-control">
                          {editingQuantityId === item.id ? (
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={quantityInput}
                              autoFocus
                              onChange={(event) =>
                                setQuantityInput(event.target.value)
                              }
                              onBlur={() => {
                                const quantity = Number(quantityInput);

                                if (
                                  Number.isInteger(quantity) &&
                                  quantity >= 1
                                ) {
                                  updateQuantity(item.id, quantity);
                                }

                                setEditingQuantityId(null);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.currentTarget.blur();
                                }
                              }}
                            />
                          ) : (
                            <button
                              type="button"
                              className="wishlist-quantity-text"
                              onClick={() => {
                                setQuantityInput(String(item.quantity));
                                setEditingQuantityId(item.id);
                              }}
                            >
                              Qty: {item.quantity}
                            </button>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="wishlist-owned-button"
                        onClick={() => toggleOwned(item.id)}
                        aria-pressed={item.owned}
                      >
                        {item.owned ? "✓ Owned" : "Mark owned"}
                      </button>
                      <button
                        type="button"
                        className="wishlist-remove-card-button"
                        onClick={() => removeCard(item.id)}
                        aria-label={`Remove ${item.card.name} from wishlist`}
                        title="Remove card"
                      >
                        ×
                      </button>
                    </article>
                  );
                })
              )}
            </div>

            <footer className="wishlist-modal-footer">
              <span>Drag cards or sections to rearrange your wishlist.</span>
              <button
                type="button"
                className="wishlist-done-button"
                onClick={closeWishlist}
              >
                Done
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}

export default WishlistTab;
