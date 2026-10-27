// game IDs
export type CardGameId = "pokemon" | "yugioh" | "mtg";

// for sets
export type CardSet = {
  id: string;
  name: string;
  game: CardGameId;
  cardCount?: number;
  logoUrl?: string;
};

// ui normalization
export type NormalizedCard = {
  // unique card ID from the provider, prefixed with the game ID
  id: string;

  // Unique basket entry ID for staging cards to binder
  basketEntryId?: string;

  game: CardGameId;
  name: string;
  imageUrl?: string;

  // Set info
  setId?: string;
  setName?: string;
  number?: string;

  // card subtype
  rarity?: string;
  category?: string;
  archetype?: string;
  detail?: string;
};

// shared filters
export type CardSearchFilters = {
  query: string;
  setId: string;
  category: string;
  archetype: string;
};

// dynamic filter for the selected tcg
export type CardFilterOptions = {
  categories: string[];
  archetypes: string[];
  categoryLabel: string;
  archetypeLabel: string;
};

export type CardProvider = {
  id: CardGameId;
  label: string;
  description: string;

  getSets: () => Promise<CardSet[]>;

  getFilterOptions: () => Promise<CardFilterOptions>;

  searchCards: (
    filters: CardSearchFilters,
    page: number,
    pageSize: number,
  ) => Promise<NormalizedCard[]>;
};
