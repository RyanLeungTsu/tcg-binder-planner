// src/cards/types.ts

// Supported card games.
// Add new game IDs here when integrating more APIs.
export type CardGameId = "pokemon" | "yugioh" | "mtg";

// A card set or expansion returned by a game's API.
export type CardSet = {
  id: string;
  name: string;
  game: CardGameId;
  cardCount?: number;
  logoUrl?: string;
};

// A shared card format so every game can use the same UI.
export type NormalizedCard = {
  // Unique card ID from the provider, prefixed with the game ID.
  id: string;

  // Unique basket entry ID, useful when adding multiple copies.
  basketEntryId?: string;

  game: CardGameId;
  name: string;
  imageUrl?: string;

  // Set or expansion information.
  setId?: string;
  setName?: string;
  number?: string;

  // Optional game-specific metadata.
  rarity?: string;
  category?: string;
  archetype?: string;
  detail?: string;
};

// Filters shared by the Cards tab and each API provider.
export type CardSearchFilters = {
  query: string;
  setId: string;
  category: string;
  archetype: string;
};

// Dynamic filter choices loaded for the selected card game.
export type CardFilterOptions = {
  categories: string[];
  archetypes: string[];
};

// Every game provider implements the same interface.
// This keeps game-specific API logic out of the UI.
export type CardProvider = {
  id: CardGameId;
  label: string;

  getSets: () => Promise<CardSet[]>;

  getFilterOptions: () => Promise<CardFilterOptions>;

  searchCards: (
    filters: CardSearchFilters,
  ) => Promise<NormalizedCard[]>;
};
