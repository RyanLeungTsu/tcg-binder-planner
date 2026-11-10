import { useEffect, useState } from "react";
import "./App.css";
//card imports
import CardsTab from "./cards/CardsTab";
import type { NormalizedCard, Wishlist, WishlistItem } from "./cards/types";
// Wishlist imports
import WishlistTab from "./wishlist/WishlistTab";
// component imports
import Basket from "./components/Basket";

type GridOption = {
  label: string;
  rows: number;
  cols: number;
};

type BinderSlot = {
  owned: boolean;
  image: string | null;
  // keeps card data for returning to basket
  card: NormalizedCard | null;
};

type CombinedSlot = {
  id: string;
  slots: [number, number];
};

type BinderPage = {
  id: number;
  slots: BinderSlot[];
  combinedSlots: CombinedSlot[];
};

type BinderData = {
  pages: BinderPage[];
  grid: string;
  currentPage: number;
  coverColor: string;
  name: string;
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
const WISHLIST_STORAGE_KEY = "tcg-binder-planner-wishlists";
const MAX_SLOTS = 36;

// for later acc feature
// const WISHLIST_LIMITS = {
//   free: ,
//   pro: ,
// };

// restores wishlist before render
function loadWishlists(): Wishlist[] {
  try {
    const saved = localStorage.getItem(WISHLIST_STORAGE_KEY);

    if (!saved) return [];

    const parsed: unknown = JSON.parse(saved);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (wishlist) =>
          wishlist &&
          typeof wishlist.id === "string" &&
          typeof wishlist.name === "string",
      )
      .map((wishlist) => {
        // converts old cards array to new array.
        const oldCards = Array.isArray(wishlist.cards)
          ? wishlist.cards
          : [];

        const oldItems = Array.isArray(wishlist.items)
          ? wishlist.items
          : oldCards;

        const items: WishlistItem[] = oldItems
          .filter((item: any) => item && item.card)
          .map((item: any) => ({
            id: item.id || crypto.randomUUID(),
            type: "card" as const,
            card: item.card,
            owned: Boolean(item.owned),
            comment: item.comment || "",
          }));

        return {
          id: wishlist.id,
          name: wishlist.name,
          items,
          createdAt: wishlist.createdAt || Date.now(),
        };
      });
  } catch {
    return [];
  }
}

function createPage(id: number): BinderPage {
  return {
    id,
    slots: Array.from({ length: MAX_SLOTS }, () => ({
      owned: false,
      image: null,
      card: null,
    })),
    combinedSlots: [],
  };
}

// keep every page at 36 slots so changing layouts never deletes hidden slots
function createInitialData(): BinderData {
  return {
    name: "My Binder",
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
            card:
              slot?.card && typeof slot.card === "object"
                ? (slot.card as NormalizedCard)
                : null,
          };
        }),
        //
        combinedSlots: Array.isArray(page.combinedSlots)
          ? page.combinedSlots.filter(
              (merge: CombinedSlot) =>
                Array.isArray(merge.slots) &&
                merge.slots.length === 2 &&
                merge.slots.every(
                  (slotIndex: number) =>
                    Number.isInteger(slotIndex) &&
                    slotIndex >= 0 &&
                    slotIndex < MAX_SLOTS,
                ),
            )
          : [],
      };
    });

    return {
      name: typeof parsed.name === "string" ? parsed.name : initial.name,
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
  updateSlot: (
    pageId: number,
    index: number,
    changes: Partial<BinderSlot>,
  ) => void;
  onDropBasketCard: (
    basketIndex: number,
    pageId: number,
    slotIndex: number,
  ) => void;
  onDropBinderCard: (
    sourcePageId: number,
    sourceSlotIndex: number,
    targetPageId: number,
    targetSlotIndex: number,
  ) => void;
  onReturnCardToBasket: (pageId: number, slotIndex: number) => void;
  combineMode: boolean;
  selectedCombineSlot: number | null;
  onSelectCombineSlot: (pageId: number, slotIndex: number) => void;
  onRemoveCombinedSlot: (pageId: number, mergeId: string) => void;
};

// renders one physical binder page so two pages can sit side by side
function BinderPageView({
  page,
  grid,
  massMode,
  updateSlot,
  onDropBasketCard,
  onDropBinderCard,
  onReturnCardToBasket,
  combineMode,
  selectedCombineSlot,
  onSelectCombineSlot,
  onRemoveCombinedSlot,
}: BinderPageViewProps) {
  const visibleCount = grid.rows * grid.cols;
  // render merges that fit the current grid and visible area
  const validMerges = page.combinedSlots.filter(
    (merge) =>
      merge.slots.every((index) => index < visibleCount) &&
      areAdjacentSlots(merge.slots[0], merge.slots[1], grid.cols),
  );

  const mergeBySlot = new Map(
    validMerges.map((merge) => [merge.slots[0], merge]),
  );

  const hiddenMergedSlots = new Set(validMerges.map((merge) => merge.slots[1]));

  return (
    <div className="binder-page">
      <div
        className="card-grid"
        style={{
          gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
        }}
      >
        {page.slots.slice(0, visibleCount).map((slot, index) => {
          if (hiddenMergedSlots.has(index)) return null;

          const merge = mergeBySlot.get(index);
          const nextIndex = merge?.slots[1];
          const isHorizontalMerge =
            merge !== undefined &&
            nextIndex !== undefined &&
            Math.floor(index / grid.cols) === Math.floor(nextIndex / grid.cols);

          const isVerticalMerge = merge !== undefined && !isHorizontalMerge;

          return (
            <article
              key={`${page.id}-${index}`}
              className={[
                "card-slot",
                slot.card ? (slot.owned ? "owned" : "unowned") : "",
                merge ? "combined-slot" : "",
                combineMode && selectedCombineSlot === index
                  ? "combine-selected"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              data-binder-page={page.id}
              data-binder-slot={index}

              style={{
                gridColumn: isHorizontalMerge ? "span 2" : undefined,
                gridRow: isVerticalMerge ? "span 2" : undefined,
                aspectRatio: merge ? "auto" : undefined,
              }}
              draggable={Boolean(slot.card) && !combineMode}
              onClick={() => {
                if (combineMode) {
                  if (!merge) onSelectCombineSlot(page.id, index);
                  return;
                }

                if (massMode && slot.card) {
                  updateSlot(page.id, index, { owned: !slot.owned });
                }
              }}
              onDragStart={(event) => {
                if (combineMode || !slot.card) {
                  event.preventDefault();
                  return;
                }

                event.dataTransfer.setData(
                  "text/plain",
                  `binder:${page.id}:${index}`,
                );

                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                // prevents dropping into merged slot
                if (combineMode || merge) return;

                const dragData = event.dataTransfer.getData("text/plain");

                if (dragData.startsWith("binder:")) {
                  const [, sourcePage, sourceIndex] = dragData.split(":");

                  const sourcePageId = Number(sourcePage);
                  const sourceSlotIndex = Number(sourceIndex);

                  if (
                    Number.isInteger(sourcePageId) &&
                    Number.isInteger(sourceSlotIndex)
                  ) {
                    onDropBinderCard(
                      sourcePageId,
                      sourceSlotIndex,
                      page.id,
                      index,
                    );
                  }

                  return;
                }

                if (slot.card) return;

                const basketIndex = dragData.startsWith("basket:")
                  ? Number(dragData.slice("basket:".length))
                  : Number(dragData);

                if (!Number.isInteger(basketIndex) || basketIndex < 0) return;

                onDropBasketCard(basketIndex, page.id, index);
              }}
            >
              {combineMode && merge && (
                <button
                  type="button"
                  className="combined-slot-remove"
                  title="Separate these slots"
                  aria-label={`Separate combined slots on page ${page.id}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveCombinedSlot(page.id, merge.id);
                  }}
                >
                  ×
                </button>
              )}
              {slot.image ? (
                <img
                  className="slot-image"
                  src={slot.image}
                  alt={
                    slot.card?.name ?? `Page ${page.id}, pocket ${index + 1}`
                  }
                  draggable={false}
                />
              ) : slot.card ? (
                <div className="slot-no-image">
                  <span>{slot.card.name}</span>
                  <small>{slot.card.game.toUpperCase()}</small>
                </div>
              ) : (
                <div className="slot-placeholder">
                  <span className="slot-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="slot-plus">+</span>
                  <span className="slot-prompt">Add artwork</span>
                </div>
              )}

              {!combineMode && !slot.image && (
                <label
                  className="slot-upload"
                  title="Upload artwork"
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                  onDragStart={(event) => event.preventDefault()}
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
                          updateSlot(page.id, index, {
                            image: reader.result,
                            card: null,
                            owned: false,
                          });
                        }
                      };
                      reader.readAsDataURL(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              )}

              {!combineMode && slot.image && (
                <>
                  <button
                    type="button"
                    className="slot-remove"
                    title="Remove artwork"
                    aria-label={`Remove artwork from page ${page.id}, pocket ${index + 1}`}
                    draggable={false}
                    onPointerDown={(event) => event.stopPropagation()}
                    onDragStart={(event) => event.preventDefault()}
                    onClick={(event) => {
                      event.stopPropagation();

                      if (
                        window.confirm(
                          "Remove this card from the binder? This will not return it to the basket.",
                        )
                      ) {
                        updateSlot(page.id, index, {
                          image: null,
                          card: null,
                          owned: false,
                        });
                      }
                    }}
                  >
                    ×
                  </button>

                  {/* only cards from basket will be returned */}
                  {slot.card && (
                    <button
                      type="button"
                      className="slot-return"
                      title="Return card to basket"
                      aria-label={`Return ${slot.card.name} to basket`}
                      draggable={false}
                      onPointerDown={(event) => event.stopPropagation()}
                      onDragStart={(event) => event.preventDefault()}
                      onClick={(event) => {
                        event.stopPropagation();
                        onReturnCardToBasket(page.id, index);
                      }}
                    >
                      ↩
                    </button>
                  )}
                </>
              )}

              {!combineMode && !massMode && slot.card && (
                <button
                  type="button"
                  className="owned-cards-button"
                  draggable={false}
                  onPointerDown={(event) => event.stopPropagation()}
                  onDragStart={(event) => event.preventDefault()}
                  onClick={(event) => {
                    event.stopPropagation();
                    updateSlot(page.id, index, { owned: !slot.owned });
                  }}
                >
                  {slot.owned ? "✓ Owned" : "Mark owned"}
                </button>
              )}

              {!combineMode && massMode && slot.card && (
                <span className="mass-mode-indicator">
                  {slot.owned ? "✓ Owned" : "Unowned"}
                </span>
              )}
            </article>
          );
        })}
      </div>

      <span className="binder-page-number">PAGE {page.id}</span>
    </div>
  );
}

// help function for checking adjacent slots
function areAdjacentSlots(
  firstIndex: number,
  secondIndex: number,
  cols: number,
): boolean {
  const firstRow = Math.floor(firstIndex / cols);
  const firstCol = firstIndex % cols;
  const secondRow = Math.floor(secondIndex / cols);
  const secondCol = secondIndex % cols;

  return (
    (firstRow === secondRow && Math.abs(firstCol - secondCol) === 1) ||
    (firstCol === secondCol && Math.abs(firstRow - secondRow) === 1)
  );
}
// helper function for combined slots to not erase an existing card in a slot
function canCombineSlots(
  page: BinderPage,
  firstIndex: number,
  secondIndex: number,
  cols: number,
): boolean {
  const firstSlot = page.slots[firstIndex];
  const secondSlot = page.slots[secondIndex];

  if (
    !firstSlot ||
    !secondSlot ||
    firstSlot.card ||
    secondSlot.card ||
    !areAdjacentSlots(firstIndex, secondIndex, cols)
  ) {
    return false;
  }

  return !page.combinedSlots.some((merge) =>
    merge.slots.some(
      (slotIndex) => slotIndex === firstIndex || slotIndex === secondIndex,
    ),
  );
}

function App() {
  const [data, setData] = useState<BinderData>(loadBinder);
  const [wishlists, setWishlists] = useState<Wishlist[]>(loadWishlists);
  const [massMode, setMassMode] = useState(false);
  // Combined slots const
  const [combineMode, setCombineMode] = useState(false);
  const [selectedCombineSlot, setSelectedCombineSlot] = useState<{
    pageId: number;
    slotIndex: number;
  } | null>(null);
  const [pageInput, setPageInput] = useState("20");
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [coverSide, setCoverSide] = useState<"front" | "back">("front");
  const [viewMode, setViewMode] = useState<
    "cover" | "inside" | "pages" | "back"
  >("cover");
  const [spreadStart, setSpreadStart] = useState(2);

  const [activeTab, setActiveTab] = useState<"binder" | "cards" | "wishlist">(
    "binder",
  );
  const [basket, setBasket] = useState<NormalizedCard[]>([]);
  // for basket modal
  const [basketOpen, setBasketOpen] = useState(false);
  const [basketPage, setBasketPage] = useState(0);

  function addToBasket(card: NormalizedCard) {
    setBasket((previous) => [...previous, card]);
    setBasketPage(0);
  }

  // removes card in basket using position in the list
  function removeBasketCard(basketIndex: number) {
    setBasket((previous) =>
      previous.filter((_, index) => index !== basketIndex),
    );

    setBasketPage((previous) =>
      Math.min(previous, Math.max(0, Math.ceil((basket.length - 1) / 8) - 1)),
    );
  }

  // for creating wishlist
  function createWishlist(name: string) {
    const newWishlist: Wishlist = {
      id: crypto.randomUUID(),
      name: name.trim(),
      items: [],
      createdAt: Date.now(),
    };

    setWishlists((previous) => [...previous, newWishlist]);
  }

  // creates a wishlist from binder cards
  // creates wishlist based on binder cards
  function createWishlistFromBinder() {
    const name = data.name.trim() || "My Binder";

    if (
      !window.confirm(
        `Create a wishlist named "${name}" using the cards in this binder?`,
      )
    ) {
      return;
    }

    const items: WishlistItem[] = data.pages.flatMap((page) =>
      page.slots
        .filter((slot) => slot.card !== null)
        .map((slot) => ({
          id: crypto.randomUUID(),
          type: "card" as const,
          card: { ...slot.card! },
          owned: slot.owned,
          comment: "",
        })),
    );

    const newWishlist: Wishlist = {
      id: crypto.randomUUID(),
      name,
      items,
      createdAt: Date.now(),
    };

    setWishlists((previous) => [...previous, newWishlist]);
  }

  // renames a wishlist w/o changing cards
  function renameWishlist(id: string, name: string) {
    const trimmedName = name.trim();

    if (!trimmedName) return;

    setWishlists((previous) =>
      previous.map((wishlist) =>
        wishlist.id === id ? { ...wishlist, name: trimmedName } : wishlist,
      ),
    );
  }

  function updateWishlistItems(id: string, items: WishlistItem[]) {
    setWishlists((previous) =>
      previous.map((wishlist) =>
        wishlist.id === id ? { ...wishlist, items } : wishlist,
      ),
    );
  }

  // for placing basket cards into a binder
  function placeBasketCard(
    basketIndex: number,
    pageId: number,
    slotIndex: number,
  ) {
    const card = basket[basketIndex];
    // for invalid drags
    if (!Number.isInteger(basketIndex) || basketIndex < 0 || !card) {
      return;
    }

    const targetPage = data.pages.find((page) => page.id === pageId);
    const targetSlot = targetPage?.slots[slotIndex];

    // place into empty pockets, and unmerged slots
    if (
      !targetPage ||
      !targetSlot ||
      slotIndex >= visibleCount ||
      targetSlot.card ||
      targetPage.combinedSlots.some((merge) => merge.slots.includes(slotIndex))
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
                  ? {
                      ...slot,
                      image: card.imageUrl ?? null,
                      owned: true,
                      card,
                    }
                  : slot,
              ),
            },
      ),
    }));

    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(
        `.card-slot[data-binder-page="${pageId}"][data-binder-slot="${slotIndex}"]`,
      );

      target?.animate(
        [
          { transform: "scale(1.5)" },
          { transform: "scale(1.04)" },
          { transform: "scale(1)" },
        ],
        {
          duration: 800,
          easing: "ease-out",
        },
      );
    });

    // for removing only if dragged onto a valid binder spot
    setBasket((previous) =>
      previous.filter((_, index) => index !== basketIndex),
    );
    setBasketPage(0);
  }

  function returnCardToBasket(pageId: number, slotIndex: number) {
    const page = data.pages.find((item) => item.id === pageId);
    const slot = page?.slots[slotIndex];

    if (!slot?.image || !slot.card) {
      alert("No card to be returned.");
      return;
    }

    setBasket((previous) => [...previous, slot.card!]);
    setBasketPage(0);

    setData((previous) => ({
      ...previous,
      pages: previous.pages.map((item) =>
        item.id !== pageId
          ? item
          : {
              ...item,
              slots: item.slots.map((currentSlot, index) =>
                index === slotIndex
                  ? { owned: false, image: null, card: null }
                  : currentSlot,
              ),
            },
      ),
    }));
  }

  function moveBinderCard(
    sourcePageId: number,
    sourceSlotIndex: number,
    targetPageId: number,
    targetSlotIndex: number,
  ) {
    setData((previous) => {
      const sourcePage = previous.pages.find(
        (page) => page.id === sourcePageId,
      );
      const targetPage = previous.pages.find(
        (page) => page.id === targetPageId,
      );

      const sourceSlot = sourcePage?.slots[sourceSlotIndex];
      const targetSlot = targetPage?.slots[targetSlotIndex];

      // validation for slots before moving
      if (
        !sourcePage ||
        !targetPage ||
        !sourceSlot ||
        !targetSlot ||
        !sourceSlot.image ||
        sourceSlotIndex >= visibleCount ||
        targetSlotIndex >= visibleCount ||
        (sourcePageId === targetPageId && sourceSlotIndex === targetSlotIndex)
      ) {
        return previous;
      }

      return {
        ...previous,
        currentPage: targetPageId,
        pages: previous.pages.map((page) => {
          if (page.id !== sourcePageId && page.id !== targetPageId) {
            return page;
          }

          return {
            ...page,
            slots: page.slots.map((slot, index) => {
              // for moving on same page
              if (sourcePageId === targetPageId) {
                if (index === sourceSlotIndex) {
                  return targetSlot.image
                    ? { ...targetSlot }
                    : { owned: false, image: null, card: null };
                }

                if (index === targetSlotIndex) {
                  return { ...sourceSlot };
                }

                return slot;
              }

              // clears og pocket when moving between pages
              if (page.id === sourcePageId && index === sourceSlotIndex) {
                return targetSlot.image
                  ? { ...targetSlot }
                  : { owned: false, image: null, card: null };
              }

              // for dragging onto slot
              if (page.id === targetPageId && index === targetSlotIndex) {
                return { ...sourceSlot };
              }

              return slot;
            }),
          };
        }),
      };
    });
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

  const spreadStyle = {
    maxWidth: `min(90rem, calc(75vh * ${(2 * grid.cols * 65) / (grid.rows * 90)}))`,
  };

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

  // persist wishlist controls seperately
  useEffect(() => {
    try {
      localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(wishlists));
    } catch {
      console.warn("Wishlist storage is full.");
    }
  }, [wishlists]);

  function updateData(changes: Partial<BinderData>) {
    setData((previous) => ({ ...previous, ...changes }));
  }

  function updateSlot(
    pageId: number,
    index: number,
    changes: Partial<BinderSlot>,
  ) {
    setData((previous) => ({
      ...previous,
      pages: previous.pages.map((page) =>
        page.id !== pageId
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

  // selects 2 grid slots to combine into a unified slot for art/misc etc.
  function selectCombineSlot(pageId: number, slotIndex: number) {
    const page = data.pages.find((item) => item.id === pageId);
    if (!page || slotIndex >= visibleCount) return;

    const slot = page.slots[slotIndex];

    // Cards and existing merged slots cannot be part of a new merge.
    if (
      slot?.card ||
      page.combinedSlots.some((merge) => merge.slots.includes(slotIndex))
    ) {
      return;
    }

    if (!selectedCombineSlot || selectedCombineSlot.pageId !== pageId) {
      setSelectedCombineSlot({ pageId, slotIndex });
      return;
    }

    const firstIndex = selectedCombineSlot.slotIndex;

    if (firstIndex === slotIndex) {
      setSelectedCombineSlot(null);
      return;
    }

    if (!canCombineSlots(page, firstIndex, slotIndex, grid.cols)) {
      alert("Choose an empty slot directly beside the selected slot.");
      setSelectedCombineSlot({ pageId, slotIndex });
      return;
    }

    setData((previous) => ({
      ...previous,
      pages: previous.pages.map((item) =>
        item.id !== pageId
          ? item
          : {
              ...item,
              combinedSlots: [
                ...item.combinedSlots,
                {
                  id: `${pageId}-${Math.min(firstIndex, slotIndex)}-${Math.max(firstIndex, slotIndex)}`,
                  slots: [
                    Math.min(firstIndex, slotIndex),
                    Math.max(firstIndex, slotIndex),
                  ] as [number, number],
                },
              ],
            },
      ),
    }));

    setSelectedCombineSlot(null);
  }

  // deleting merge restores original slots
  function removeCombinedSlot(pageId: number, mergeId: string) {
    setData((previous) => ({
      ...previous,
      pages: previous.pages.map((page) =>
        page.id !== pageId
          ? page
          : {
              ...page,
              combinedSlots: page.combinedSlots.filter(
                (merge) => merge.id !== mergeId,
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
          <a
            className={activeTab === "wishlist" ? "nav-active" : ""}
            href="#wishlist"
            onClick={(event) => {
              event.preventDefault();
              setActiveTab("wishlist");
            }}
          >
            Wishlist
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

      <div hidden={activeTab !== "cards"}>
        <CardsTab
          onAddToBasket={addToBasket}
          basket={basket}
          basketOpen={basketOpen}
          basketPage={basketPage}
          onToggleBasket={() => setBasketOpen((open) => !open)}
          onCloseBasket={() => setBasketOpen(false)}
          onBasketPageChange={setBasketPage}
          onAddBasketCardToPage={addBasketCardToPage}
          onRemoveBasketCard={removeBasketCard}
        />
      </div>

      <div hidden={activeTab !== "wishlist"}>
        <WishlistTab
          wishlists={wishlists}
          onCreateWishlist={createWishlist}
          onRenameWishlist={renameWishlist}
          onUpdateWishlistItems={updateWishlistItems}
        />
      </div>

      <div hidden={activeTab !== "binder"}>
        <div className="workspace" id="binder">
          <aside className="sidebar">
            <div className="sidebar-heading">
              <p className="eyebrow">YOUR COLLECTION</p>
              <input
                className="binder-name-input"
                type="text"
                value={data.name}
                maxLength={40}
                aria-label="Binder name"
                onChange={(event) => updateData({ name: event.target.value })}
              />
              <p className="subheading">
                Page{" "}
                {data.pages.findIndex((page) => page.id === data.currentPage) +
                  1}{" "}
                of {data.pages.length}
                <span className="dot-separator">·</span>
                {visibleCount} pockets
              </p>
            </div>

            <div className="sidebar-divider" />

            {/* create wihslist btn */}
            <section className="setting-group">
              <button
                type="button"
                className="button button-secondary"
                onClick={createWishlistFromBinder}
              >
                Create Wishlist
              </button>
              <p className="help-text">
                Creates wishlist based on your binder cards!
              </p>
            </section>

            <div className="sidebar-divider" />

            <section className="setting-group">
              <button
                className={`mode-button ${massMode ? "mode-enabled" : ""}`}
                onClick={() => {
                  setMassMode((previous) => !previous);
                  setCombineMode(false);
                  setSelectedCombineSlot(null);
                }}
                aria-pressed={massMode}
              >
                <span className={`toggle-track ${massMode ? "toggle-on" : ""}`}>
                  <span className="toggle-thumb" />
                </span>

                <span>
                  <strong>Mass toggle</strong>
                  <small>
                    {massMode ? "Click slots to toggle" : "Use hover buttons"}
                  </small>
                </span>
              </button>
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
                onClick={() => {
                  setMassMode((previous) => !previous);
                  setCombineMode(false);
                  setSelectedCombineSlot(null);
                }}
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
              <button
                className={`mode-button ${combineMode ? "mode-enabled" : ""}`}
                onClick={() => {
                  setCombineMode((previous) => !previous);
                  setMassMode(false);
                  setSelectedCombineSlot(null);
                }}
                aria-pressed={combineMode}
              >
                <span
                  className={`toggle-track ${combineMode ? "toggle-on" : ""}`}
                >
                  <span className="toggle-thumb" />
                </span>

                <span>
                  <strong>Combine slots</strong>
                  <small>
                    {combineMode
                      ? "Select two adjacent slots"
                      : "Merge empty slots"}
                  </small>
                </span>
              </button>
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
            <Basket
              basket={basket}
              basketOpen={basketOpen}
              basketPage={basketPage}
              onToggle={() => setBasketOpen((previous) => !previous)}
              onClose={() => setBasketOpen(false)}
              onPageChange={setBasketPage}
              onAddToPage={addBasketCardToPage}
              onRemoveCard={removeBasketCard}
            />

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
                  <strong>{data.name.trim() || "MY BINDER"}</strong>
                  <span>{data.pages.length} pages · Click to open</span>
                  {/*placeholder*/}
                  <span className="cover-mark">TCG</span>
                </button>
              )}

              {viewMode === "inside" && (
                <div className="binder-spread" style={spreadStyle}>
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
                    combineMode={combineMode}
                    selectedCombineSlot={
                      selectedCombineSlot?.pageId === 1
                        ? selectedCombineSlot.slotIndex
                        : null
                    }
                    onSelectCombineSlot={selectCombineSlot}
                    onRemoveCombinedSlot={removeCombinedSlot}
                    updateSlot={updateSlot}
                    onDropBasketCard={placeBasketCard}
                    onDropBinderCard={moveBinderCard}
                    onReturnCardToBasket={returnCardToBasket}
                  />
                </div>
              )}

              {viewMode === "pages" && (
                <div className="binder-spread" style={spreadStyle}>
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
                            combineMode={combineMode}
                            selectedCombineSlot={
                              selectedCombineSlot?.pageId === leftPage.id
                                ? selectedCombineSlot.slotIndex
                                : null
                            }
                            onSelectCombineSlot={selectCombineSlot}
                            onRemoveCombinedSlot={removeCombinedSlot}
                            updateSlot={updateSlot}
                            onDropBasketCard={placeBasketCard}
                            onDropBinderCard={moveBinderCard}
                            onReturnCardToBasket={returnCardToBasket}
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
                            combineMode={combineMode}
                            selectedCombineSlot={
                              selectedCombineSlot?.pageId === rightPage.id
                                ? selectedCombineSlot.slotIndex
                                : null
                            }
                            onSelectCombineSlot={selectCombineSlot}
                            onRemoveCombinedSlot={removeCombinedSlot}
                            updateSlot={updateSlot}
                            onDropBasketCard={placeBasketCard}
                            onDropBinderCard={moveBinderCard}
                            onReturnCardToBasket={returnCardToBasket}
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
                <div className="binder-spread" style={spreadStyle}>
                  <BinderPageView
                    page={data.pages[data.pages.length - 1]}
                    grid={grid}
                    massMode={massMode}
                    combineMode={combineMode}
                    selectedCombineSlot={
                      selectedCombineSlot?.pageId ===
                      data.pages[data.pages.length - 1].id
                        ? selectedCombineSlot.slotIndex
                        : null
                    }
                    onSelectCombineSlot={selectCombineSlot}
                    onRemoveCombinedSlot={removeCombinedSlot}
                    updateSlot={updateSlot}
                    onDropBasketCard={placeBasketCard}
                    onDropBinderCard={moveBinderCard}
                    onReturnCardToBasket={returnCardToBasket}
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

              <button
                type="button"
                className="binder-nav binder-nav-prev"
                aria-label="Previous page"
                title="Previous page"
                disabled={viewMode === "cover"}
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
              >
                ←
              </button>

              <button
                type="button"
                className="binder-nav binder-nav-next"
                aria-label="Next page"
                title="Next page"
                disabled={viewMode === "back"}
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
              >
                →
              </button>
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
      </div>
    </div>
  );
}

export default App;
