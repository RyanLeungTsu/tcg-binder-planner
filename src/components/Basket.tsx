import { useEffect, useRef, useState } from "react";
import type { NormalizedCard } from "../cards/types";

type BasketProps = {
  basket: NormalizedCard[];
  basketOpen: boolean;
  basketPage: number;
  onToggle: () => void;
  onClose: () => void;
  onPageChange: (page: number) => void;
  onAddToPage: (basketIndex: number) => void;
  onRemoveCard: (basketIndex: number) => void;
};

function Basket({
  basket,
  basketOpen,
  basketPage,
  onToggle,
  onClose,
  onPageChange,
  onAddToPage,
  onRemoveCard,
}: BasketProps) {
  // ref for anims
  const basketButtonRef = useRef<HTMLButtonElement>(null);
  // remembers which direction the basket popup should open
  const [popupSide, setPopupSide] = useState<"left" | "right">("right");

  // checks which side of the basket has more available space
  useEffect(() => {
    if (!basketOpen || !basketButtonRef.current) return;

    function updatePopupSide() {
      const button = basketButtonRef.current;
      if (!button) return;

      const bounds = button.getBoundingClientRect();
      const spaceRight = window.innerWidth - bounds.right;
      const spaceLeft = bounds.left;

      setPopupSide(spaceRight >= spaceLeft ? "right" : "left");
    }

    updatePopupSide();

    window.addEventListener("resize", updatePopupSide);

    return () => {
      window.removeEventListener("resize", updatePopupSide);
    };
  }, [basketOpen]);

  return (
    <div className="basket-anchor">
      <button
        ref={basketButtonRef}
        className="button button-primary basket-toggle"
        onClick={onToggle}
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
            onClick={onClose}
          />

          <section
            className={`basket-popup basket-popup-${popupSide}`}
            aria-label="Card basket"
            // allows for mouse scrolling
            onWheel={(event) => {
              if (window.innerWidth < 768) return;

              const list = event.currentTarget.querySelector<HTMLElement>(
                ".basket-desktop-list",
              );

              if (!list || list.scrollWidth <= list.clientWidth) return;

              if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
                event.preventDefault();

                list.scrollBy({
                  // less harsh deltaY for horizontal scrolling
                  left: event.deltaY * 0.55,
                  behavior: "smooth",
                });
              }
            }}
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
                onClick={onClose}
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
                {/* desktop uses a horizontally scrolling list */}
                <div className="basket-desktop-list">
                  {basket.map((card, index) => (
                    <article
                      className="basket-card"
                      data-basket-index={index}
                      key={`${card.id}-${index}`}
                      draggable={true}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onRemoveCard(index);
                      }}
                      onDragStart={(event) => {
                        event.dataTransfer.setData(
                          "text/plain",
                          `basket:${index}`,
                        );
                        event.dataTransfer.effectAllowed = "move";
                      }}
                    >
                      {card.imageUrl ? (
                        <img
                          src={card.imageUrl}
                          alt={card.name}
                          draggable={false}
                        />
                      ) : (
                        <div className="basket-card-no-image">No image</div>
                      )}

                      <span>{card.name}</span>
                      <small>{card.game.toUpperCase()}</small>
                    </article>
                  ))}
                </div>

                {/* mobile uses a paginated card layout */}
                <div className="basket-mobile-list">
                  {basket
                    .slice(basketPage * 8, basketPage * 8 + 8)
                    .map((card, visibleIndex) => {
                      const basketIndex = basketPage * 8 + visibleIndex;

                      return (
                        <article
                          className="basket-card"
                          data-basket-index={basketIndex}
                          key={`${card.id}-${basketIndex}`}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onRemoveCard(basketIndex);
                          }}
                        >
                          {card.imageUrl ? (
                            <img src={card.imageUrl} alt={card.name} />
                          ) : (
                            <div className="basket-card-no-image">No image</div>
                          )}

                          <span title={card.name}>{card.name}</span>

                          <button
                            className="button button-secondary basket-add-button"
                            disabled={!card.imageUrl}
                            onClick={() => onAddToPage(basketIndex)}
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
                    onClick={() => onPageChange(Math.max(0, basketPage - 1))}
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
                      onPageChange(
                        Math.min(
                          Math.ceil(basket.length / 8) - 1,
                          basketPage + 1,
                        ),
                      )
                    }
                    disabled={basketPage >= Math.ceil(basket.length / 8) - 1}
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
  );
}

export default Basket;
