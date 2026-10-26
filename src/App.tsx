import { useEffect, useState } from "react";
import "./App.css";
//card imports
import CardsTab from "./cards/CardsTab";
import type { NormalizedCard } from "./cards/types";

type GridOption = {
  label: string;
  rows: number;
  cols: number;
};

type BinderSlot = {
  owned: boolean;
  image: string | null;
};

type BinderPage = {
  id: number;
  slots: BinderSlot[];
};

type BinderData = {
  pages: BinderPage[];
  grid: string;
  currentPage: number;
  coverColor: string;
};

const GRID_OPTIONS: GridOption[] = [
  { label: "2 × 2", rows: 2, cols: 2 },
  { label: "3 × 3", rows: 3, cols: 3 },
  { label: "3 × 4", rows: 3, cols: 4 },
  { label: "4 × 4", rows: 4, cols: 4 },
  { label: "4 × 5", rows: 4, cols: 5 },
  { label: "5 × 4", rows: 5, cols: 4 },
  { label: "5 × 5", rows: 5, cols: 5 },
  { label: "6 × 6", rows: 6, cols: 6 },
];

const STORAGE_KEY = "tcg-binder-planner";
const MAX_SLOTS = 36;

function createPage(id: number): BinderPage {
  return {
    id,
    slots: Array.from({ length: MAX_SLOTS }, () => ({
      owned: false,
      image: null,
    })),
  };
}

// keep every page at 36 slots so changing layouts never deletes hidden slots
function createInitialData(): BinderData {
  return {
    pages: Array.from({ length: 20 }, (_, index) => createPage(index + 1)),
    grid: "3 × 3",
    currentPage: 1,
    coverColor: "#334155",
  };
}

// restores the saved binder before the first render to avoid overwriting it
function loadBinder(): BinderData {
  const initial = createInitialData();

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return initial;

    const parsed = JSON.parse(saved) as Partial<BinderData>;

    if (!Array.isArray(parsed.pages)) return initial;

    const pages = parsed.pages.map((page, index) => {
      // const fallback = createPage(index + 1);

      return {
        id: Number.isInteger(page.id) ? page.id : index + 1,
        slots: Array.from({ length: MAX_SLOTS }, (_, slotIndex) => {
          const slot = page.slots?.[slotIndex];

          return {
            owned: Boolean(slot?.owned),
            image: typeof slot?.image === "string" ? slot.image : null,
          };
        }),
      };
    });

    return {
      pages: pages.length > 0 ? pages : initial.pages,
      grid: GRID_OPTIONS.some((option) => option.label === parsed.grid)
        ? parsed.grid!
        : initial.grid,
      currentPage: pages.some((page) => page.id === parsed.currentPage)
        ? parsed.currentPage!
        : (pages[0]?.id ?? 1),
      coverColor:
        typeof parsed.coverColor === "string"
          ? parsed.coverColor
          : initial.coverColor,
    };
  } catch {
    return initial;
  }
}

type BinderPageViewProps = {
  page: BinderPage;
  grid: GridOption;
  massMode: boolean;
  updateSlot: (index: number, changes: Partial<BinderSlot>) => void;
  onDropBasketCard: (
    basketIndex: number,
    pageId: number,
    slotIndex: number,
  ) => void;
};

// renders one physical binder page so two pages can sit side by side
function BinderPageView({
  page,
  grid,
  massMode,
  updateSlot,
  onDropBasketCard,
}: BinderPageViewProps) {
  const visibleCount = grid.rows * grid.cols;

  return (
    <div className="binder-page">
      <div
        className="card-grid"
        style={{
          gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
        }}
      >
        {page.slots.slice(0, visibleCount).map((slot, index) => (
          <article
            key={`${page.id}-${index}`}
            className={`card-slot ${slot.owned ? "owned" : "unowned"}`}
            onClick={() => {
              if (massMode) updateSlot(index, { owned: !slot.owned });
            }}
            onDragOver={(event) => {
              // only allos card to be dropped in empty pocket
              if (!slot.image) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();

              // occupied slots cant have a card from basket
              if (slot.image) return;

              const draggedIndex = event.dataTransfer.getData("text/plain");

              // ignores drops not from basket
              if (draggedIndex.trim() === "") return;

              const basketIndex = Number(draggedIndex);

              if (!Number.isInteger(basketIndex) || basketIndex < 0) return;

              onDropBasketCard(basketIndex, page.id, index);
            }}
          >
            {slot.image ? (
              <img
                className="slot-image"
                src={slot.image}
                alt={`Page ${page.id}, pocket ${index + 1}`}
              />
            ) : (
              <div className="slot-placeholder">
                <span className="slot-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="slot-plus">+</span>
                <span className="slot-prompt">Add artwork</span>
              </div>
            )}

            <label
              className="slot-upload"
              title="Upload artwork"
              onClick={(event) => event.stopPropagation()}
            >
              ↑
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;

                  if (
                    !file.type.startsWith("image/") ||
                    file.size > 5 * 1024 * 1024
                  ) {
                    alert("Choose an image smaller than 5 MB.");
                    event.currentTarget.value = "";
                    return;
                  }

                  const reader = new FileReader();
                  reader.onload = () => {
                    if (typeof reader.result === "string") {
                      updateSlot(index, { image: reader.result });
                    }
                  };
                  reader.readAsDataURL(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>

            {slot.image && (
              <button
                className="slot-remove"
                title="Remove artwork"
                onClick={(event) => {
                  event.stopPropagation();
                  updateSlot(index, { image: null });
                }}
              >
                ×
              </button>
            )}

            {!massMode && (
              <button
                className="owned-cards-button"
                onClick={(event) => {
                  event.stopPropagation();
                  updateSlot(index, { owned: !slot.owned });
                }}
              >
                {slot.owned ? "✓ Owned" : "Mark owned"}
              </button>
            )}

            {massMode && (
              <span className="mass-mode-indicator">
                {slot.owned ? "✓ Owned" : "Unowned"}
              </span>
            )}
          </article>
        ))}
      </div>

      <span className="binder-page-number">PAGE {page.id}</span>
    </div>
  );
}

function App() {
  const [data, setData] = useState<BinderData>(loadBinder);
  const [massMode, setMassMode] = useState(false);
  const [pageInput, setPageInput] = useState("20");
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [coverSide, setCoverSide] = useState<"front" | "back">("front");
  const [viewMode, setViewMode] = useState<
    "cover" | "inside" | "pages" | "back"
  >("cover");
  const [spreadStart, setSpreadStart] = useState(2);

  const [activeTab, setActiveTab] = useState<"binder" | "cards">("binder");
  const [basket, setBasket] = useState<NormalizedCard[]>([]);
  // for basket modal
  const [basketOpen, setBasketOpen] = useState(false);
  const [basketPage, setBasketPage] = useState(0);

  function addToBasket(card: NormalizedCard) {
    setBasket((previous) => [...previous, card]);
    setBasketPage(0);
  }

  // for placing basket cards into a binder
  function placeBasketCard(
    basketIndex: number,
    pageId: number,
    slotIndex: number,
  ) {
    const card = basket[basketIndex];
    // for invalid drags
    if (!Number.isInteger(basketIndex) || basketIndex < 0 || !card?.imageUrl) {
      return;
    }

    const targetPage = data.pages.find((page) => page.id === pageId);
    const targetSlot = targetPage?.slots[slotIndex];

    // place into empty pockets
    if (
      !targetPage ||
      !targetSlot ||
      slotIndex >= visibleCount ||
      targetSlot.image
    ) {
      return;
    }

    setData((previous) => ({
      ...previous,
      currentPage: pageId,
      pages: previous.pages.map((page) =>
        page.id !== pageId
          ? page
          : {
              ...page,
              slots: page.slots.map((slot, index) =>
                index === slotIndex
                  ? { ...slot, image: card.imageUrl!, owned: true }
                  : slot,
              ),
            },
      ),
    }));

    // for removing only if dragged onto a valid binder spot
    setBasket((previous) =>
      previous.filter((_, index) => index !== basketIndex),
    );
    setBasketPage(0);
  }

  function addBasketCardToPage(basketIndex: number) {
    // uses the page currently being viewed
    const pageId =
      viewMode === "inside"
        ? 1
        : viewMode === "pages"
          ? spreadStart
          : viewMode === "back"
            ? (data.pages[data.pages.length - 1]?.id ?? data.currentPage)
            : data.currentPage;

    const page = data.pages.find((item) => item.id === pageId);
    const emptySlotIndex = page?.slots
      .slice(0, visibleCount)
      .findIndex((slot) => !slot.image);

    if (emptySlotIndex === undefined || emptySlotIndex === -1) {
      alert("There are no empty pockets on this page.");
      return;
    }

    placeBasketCard(basketIndex, pageId, emptySlotIndex);
    setBasketOpen(false);
    setBasketPage(0);
  }

  const grid =
    GRID_OPTIONS.find((option) => option.label === data.grid) ??
    GRID_OPTIONS[1];

  const activePage =
    data.pages.find((page) => page.id === data.currentPage) ?? data.pages[0];

  const visibleCount = grid.rows * grid.cols;

  // persist binder edits in this browser
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      console.warn(
        "Binder storage is full. Try removing some uploaded images.",
      );
    }
  }, [data]);

  function updateData(changes: Partial<BinderData>) {
    setData((previous) => ({ ...previous, ...changes }));
  }

  function updateSlot(index: number, changes: Partial<BinderSlot>) {
    setData((previous) => ({
      ...previous,
      pages: previous.pages.map((page) =>
        page.id !== previous.currentPage
          ? page
          : {
              ...page,
              slots: page.slots.map((slot, slotIndex) =>
                slotIndex === index ? { ...slot, ...changes } : slot,
              ),
            },
      ),
    }));
  }

  function addPages() {
    const amount = Number(pageInput);

    if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
      alert("Enter a number between 1 and 100.");
      return;
    }

    setData((previous) => {
      const lastId = Math.max(0, ...previous.pages.map((page) => page.id));
      const newPages = Array.from({ length: amount }, (_, index) =>
        createPage(lastId + index + 1),
      );

      setViewMode("pages");
      setSpreadStart(2 + 2 * Math.floor((data.pages.length - 2) / 2));

      return {
        ...previous,
        pages: [...previous.pages, ...newPages],
        currentPage: lastId + 1,
      };
    });
  }

  // convert uploaded files into previewable images for this prototype
  function uploadImage(
    file: File | undefined,
    onLoaded: (image: string) => void,
  ) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Please use an image smaller than 5 MB.");
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        onLoaded(reader.result);
      }
    };

    reader.readAsDataURL(file);
  }

  function uploadCover(file: File | undefined) {
    uploadImage(file, setCoverImage);
  }

  // page 1 sits alone on the right; later pages are paired left-to-right
  function goToPage(id: number) {
    updateData({ currentPage: id });

    if (id === 1) {
      setViewMode("inside");
    } else {
      setViewMode("pages");
      setSpreadStart(2 + 2 * Math.floor((id - 2) / 2));
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#binder">
          {/*placeholder*/}
          <span className="brand-icon">▤</span>
          TCG Binder Planner
        </a>

        <nav className="main-nav">
          <a
            className={activeTab === "binder" ? "nav-active" : ""}
            href="#binder"
            onClick={(event) => {
              event.preventDefault();
              setActiveTab("binder");
            }}
          >
            Binder
          </a>
          <a
            className={activeTab === "cards" ? "nav-active" : ""}
            href="#cards"
            onClick={(event) => {
              event.preventDefault();
              setActiveTab("cards");
            }}
          >
            Cards
          </a>
          <a href="#faq" onClick={(event) => event.preventDefault()}>
            FAQ
          </a>
          <a href="#help" onClick={(event) => event.preventDefault()}>
            Help
          </a>
        </nav>

        <div className="auth-actions">
          <button
            className="button button-ghost"
            onClick={() => alert("Sign-in will be added with Supabase.")}
          >
            Sign in
          </button>
          <button
            className="button button-primary"
            onClick={() =>
              alert("Account creation will be added with Supabase.")
            }
          >
            Sign up
          </button>
        </div>
      </header>

      {activeTab === "cards" ? (
        <CardsTab onAddToBasket={addToBasket} basketCount={basket.length} />
      ) : (
        <div className="workspace" id="binder">
          <aside className="sidebar">
            <div className="sidebar-heading">
              <p className="eyebrow">WORKSPACE</p>
              <h2>Binder settings</h2>
            </div>

            <div className="sidebar-divider" />

            <section className="setting-group">
              <label className="field-label" htmlFor="grid-size">
                Grid layout
              </label>
              <select
                id="grid-size"
                value={data.grid}
                onChange={(event) => updateData({ grid: event.target.value })}
              >
                {GRID_OPTIONS.map((option) => (
                  <option key={option.label} value={option.label}>
                    {option.label} ({option.rows * option.cols} slots)
                  </option>
                ))}
              </select>
              <p className="help-text">
                Hidden slots keep their contents when you change layouts.
              </p>
            </section>

            <div className="sidebar-divider" />

            <section className="setting-group">
              <label className="field-label" htmlFor="page-select">
                Current page
              </label>
              <select
                id="page-select"
                value={data.currentPage}
                onChange={(event) => goToPage(Number(event.target.value))}
              >
                {data.pages.map((page, index) => (
                  <option key={page.id} value={page.id}>
                    Page {index + 1}
                  </option>
                ))}
              </select>

              <div className="page-count">
                <span>Total pages</span>
                <strong>{data.pages.length / 2 + 1}</strong>
              </div>

              <label className="field-label" htmlFor="page-count">
                Add pages
              </label>
              <div className="add-pages-row">
                <input
                  id="page-count"
                  type="number"
                  min="1"
                  max="100"
                  value={pageInput}
                  onChange={(event) => setPageInput(event.target.value)}
                />
                <button className="button button-secondary" onClick={addPages}>
                  Add
                </button>
              </div>
              <p className="help-text">
                Add between 1 and 100 pages at a time.
              </p>
            </section>

            <div className="sidebar-divider" />

            <section className="setting-group">
              <p className="field-label">Toggle Owned Cards</p>
              <button
                className={`mode-button ${massMode ? "mode-enabled" : ""}`}
                onClick={() => setMassMode((previous) => !previous)}
                aria-pressed={massMode}
              >
                <span className={`toggle-track ${massMode ? "toggle-on" : ""}`}>
                  <span className="toggle-thumb" />
                </span>
                <span>
                  <strong>Mass toggle</strong>
                  <small>
                    {massMode
                      ? "Click a slot to toggle owned"
                      : "Use hover buttons"}
                  </small>
                </span>
              </button>
              <p className="help-text">
                {massMode
                  ? "Click any slot to switch between owned and unowned."
                  : "Hover over a slot to mark it owned."}
              </p>
            </section>

            <div className="sidebar-divider" />

            <section className="setting-group">
              <p className="field-label">Binder cover</p>
              <div className="cover-tabs">
                <button
                  className={
                    coverSide === "front" ? "cover-tab active" : "cover-tab"
                  }
                  onClick={() => setCoverSide("front")}
                >
                  Front
                </button>
                <button
                  className={
                    coverSide === "back" ? "cover-tab active" : "cover-tab"
                  }
                  onClick={() => setCoverSide("back")}
                >
                  Back
                </button>
              </div>

              <label className="field-label" htmlFor="cover-color">
                Cover colour
              </label>
              <div className="color-row">
                <input
                  id="cover-color"
                  type="color"
                  value={data.coverColor}
                  onChange={(event) =>
                    updateData({ coverColor: event.target.value })
                  }
                />
                <span>{data.coverColor.toUpperCase()}</span>
              </div>

              <label className="field-label" htmlFor="cover-upload">
                Cover image
              </label>
              <label className="file-picker">
                <span>↑</span> Upload {coverSide} cover
                <input
                  id="cover-upload"
                  type="file"
                  accept="image/*"
                  onChange={(event) => uploadCover(event.target.files?.[0])}
                />
              </label>

              {coverImage && (
                <button
                  className="text-button"
                  onClick={() => setCoverImage(null)}
                >
                  Remove cover image
                </button>
              )}
              <p className="help-text">
                Cover images are preview-only for now and aren't yet saved
                between refreshes.
              </p>
            </section>

            <div className="sidebar-footer">
              <span className="save-indicator" />
              Saved in this browser
            </div>
          </aside>

          <main className="binder-main">
            <div className="binder-toolbar">
              <div>
                <p className="eyebrow">YOUR COLLECTION</p>
                <h1>My Binder</h1>
                <p className="subheading">
                  Page{" "}
                  {data.pages.findIndex(
                    (page) => page.id === data.currentPage,
                  ) + 1}{" "}
                  of {data.pages.length}
                  <span className="dot-separator">·</span>
                  {visibleCount} pockets
                </p>
                </div>

                <div className="basket-anchor">
                  <button
                    className="button button-primary basket-toggle"
                    onClick={() => setBasketOpen((previous) => !previous)}
                    aria-expanded={basketOpen}
                    aria-label={`Open card basket, ${basket.length} cards`}
                  >
                    Basket ({basket.length})
                  </button>

                  {basketOpen && (
                    <>
                      <button
                        className="basket-backdrop"
                        aria-label="Close basket"
                        onClick={() => setBasketOpen(false)}
                      />

                      <section
                        className="basket-popup"
                        aria-label="Card basket"
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                      >
                        <div className="basket-popup-header">
                          <div>
                            <strong>Your card basket</strong>
                            <p>{basket.length} cards waiting to be placed</p>
                          </div>

                          <button
                            className="basket-close"
                            onClick={() => setBasketOpen(false)}
                            aria-label="Close basket"
                          >
                            ×
                          </button>
                        </div>

                        {basket.length === 0 ? (
                          <p className="help-text">
                            Your basket is empty. Visit the Cards tab to add some.
                          </p>
                        ) : (
                          <>
                            {/* desktop will be horiz scroll. */}
                            <div className="basket-desktop-list">
                              {basket.map((card, index) => (
                                <article
                                  className="basket-card"
                                  key={`${card.id}-${index}`}
                                  draggable={Boolean(card.imageUrl)}
                                  onDragStart={(event) => {
                                    if (!card.imageUrl) {
                                      event.preventDefault();
                                      return;
                                    }

                                    event.dataTransfer.setData(
                                      "text/plain",
                                      String(index),
                                    );
                                    event.dataTransfer.effectAllowed = "move";
                                  }}
                                  title={
                                    card.imageUrl
                                      ? `Drag ${card.name} onto an empty binder pocket`
                                      : "This card has no available image"
                                  }
                                >
                                  {card.imageUrl ? (
                                    <img
                                      src={card.imageUrl}
                                      alt={card.name}
                                      draggable={false}
                                    />
                                  ) : (
                                    <div className="basket-card-no-image">
                                      No image
                                    </div>
                                  )}

                                  <span>{card.name}</span>
                                  <small>{card.game.toUpperCase()}</small>
                                </article>
                              ))}
                            </div>

                            {/* mobile, page layout */}
                            <div className="basket-mobile-list">
                              {basket
                                .slice(basketPage * 8, basketPage * 8 + 8)
                                .map((card, visibleIndex) => {
                                  const basketIndex = basketPage * 8 + visibleIndex;

                                  return (
                                    <article
                                      className="basket-card"
                                      key={`${card.id}-${basketIndex}`}
                                    >
                                      {card.imageUrl ? (
                                        <img src={card.imageUrl} alt={card.name} />
                                      ) : (
                                        <div className="basket-card-no-image">
                                          No image
                                        </div>
                                      )}

                                      <span title={card.name}>{card.name}</span>

                                      <button
                                        className="button button-secondary basket-add-button"
                                        disabled={!card.imageUrl}
                                        onClick={() =>
                                          addBasketCardToPage(basketIndex)
                                        }
                                      >
                                        Add to page
                                      </button>
                                    </article>
                                  );
                                })}
                            </div>

                            <div className="basket-mobile-pagination">
                              <button
                                className="button button-secondary"
                                onClick={() =>
                                  setBasketPage((previous) =>
                                    Math.max(0, previous - 1),
                                  )
                                }
                                disabled={basketPage === 0}
                              >
                                ← Previous
                              </button>

                              <span>
                                {basketPage + 1} / {Math.ceil(basket.length / 8)}
                              </span>

                              <button
                                className="button button-secondary"
                                onClick={() =>
                                  setBasketPage((previous) =>
                                    Math.min(
                                      Math.ceil(basket.length / 8) - 1,
                                      previous + 1,
                                    ),
                                  )
                                }
                                disabled={
                                  basketPage >= Math.ceil(basket.length / 8) - 1
                                }
                              >
                                Next →
                              </button>
                            </div>
                          </>
                        )}
                      </section>
                    </>
                  )}
                </div>

              {/* move through the physical binder in reading order. */}
              <div className="pagination">
                <button
                  className="button button-secondary"
                  onClick={() => {
                    if (viewMode === "cover") return;

                    if (viewMode === "inside") {
                      setViewMode("cover");
                    } else if (viewMode === "back") {
                      const lastPage = data.pages.length;
                      if (lastPage <= 1) {
                        setViewMode("inside");
                      } else {
                        setViewMode("pages");
                        setSpreadStart(2 + 2 * Math.floor((lastPage - 2) / 2));
                      }
                    } else if (spreadStart === 2) {
                      setViewMode("inside");
                    } else {
                      setSpreadStart((previous) => previous - 2);
                    }
                  }}
                  disabled={viewMode === "cover"}
                >
                  ← Previous
                </button>

                <button
                  className="button button-secondary"
                  onClick={() => {
                    if (viewMode === "cover") {
                      setViewMode("inside");
                    } else if (viewMode === "inside") {
                      setViewMode(data.pages.length <= 1 ? "back" : "pages");
                      setSpreadStart(2);
                    } else if (viewMode === "pages") {
                      if (spreadStart + 2 >= data.pages.length) {
                        setViewMode("back");
                      } else {
                        setSpreadStart((previous) => previous + 2);
                      }
                    }
                  }}
                  disabled={viewMode === "back"}
                >
                  Next →
                </button>
              </div>
            </div>



            {/* show the closed cover first, then the inside cover and page 1, followed by paired pages */}
            <div className="binder-viewer">
              {viewMode === "cover" && (
                <button
                  className="closed-cover"
                  style={{
                    backgroundColor: data.coverColor,
                    backgroundImage: coverImage
                      ? `linear-gradient(#0002, #0004), url("${coverImage}")`
                      : undefined,
                  }}
                  onClick={() => setViewMode("inside")}
                  title="Open binder"
                >
                  <span className="cover-kicker">TRADING CARD COLLECTION</span>
                  <strong>MY BINDER</strong>
                  <span>{data.pages.length} pages · Click to open</span>
                  {/*placeholder*/}
                  <span className="cover-mark">TCG</span>
                </button>
              )}

              {viewMode === "inside" && (
                <div className="binder-spread">
                  <div
                    className="inside-cover"
                    style={{ backgroundColor: data.coverColor }}
                  >
                    <small>Front Cover</small>
                  </div>

                  <BinderPageView
                    page={
                      data.pages.find((page) => page.id === 1) ?? data.pages[0]
                    }
                    grid={grid}
                    massMode={massMode}
                    updateSlot={updateSlot}
                    onDropBasketCard={placeBasketCard}
                  />
                </div>
              )}

              {viewMode === "pages" && (
                <div className="binder-spread">
                  {(() => {
                    const leftPage = data.pages.find(
                      (page) => page.id === spreadStart,
                    );
                    const rightPage = data.pages.find(
                      (page) => page.id === spreadStart + 1,
                    );

                    return (
                      <>
                        {leftPage ? (
                          <BinderPageView
                            page={leftPage}
                            grid={grid}
                            massMode={massMode}
                            updateSlot={updateSlot}
                            onDropBasketCard={placeBasketCard}
                          />
                        ) : (
                          <div
                            className="inside-cover"
                            style={{ backgroundColor: data.coverColor }}
                          />
                        )}

                        {rightPage ? (
                          <BinderPageView
                            page={rightPage}
                            grid={grid}
                            massMode={massMode}
                            updateSlot={updateSlot}
                            onDropBasketCard={placeBasketCard}
                          />
                        ) : (
                          <div
                            className="inside-cover"
                            style={{ backgroundColor: data.coverColor }}
                          />
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {viewMode === "back" && (
                <div className="binder-spread">
                  <BinderPageView
                    page={data.pages[data.pages.length - 1]}
                    grid={grid}
                    massMode={massMode}
                    updateSlot={updateSlot}
                    onDropBasketCard={placeBasketCard}
                  />

                  <div
                    className="inside-cover back-cover"
                    style={{
                      backgroundColor: data.coverColor,
                      backgroundImage: coverImage
                        ? `linear-gradient(#0002, #0004), url("${coverImage}")`
                        : undefined,
                    }}
                  >
                    <small>Back Cover</small>
                  </div>
                </div>
              )}
            </div>

            <footer className="binder-footer">
              <span>{visibleCount} visible pockets</span>
              <span>
                {activePage?.slots.filter((slot) => slot.owned).length} owned on
                this page
              </span>
            </footer>
          </main>
        </div>
      )}
    </div>
  );
}

export default App;
