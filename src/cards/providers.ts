import type {
  CardFilterOptions,
  CardGameId,
  CardProvider,
  CardSearchFilters,
  CardSet,
  NormalizedCard,
} from "./types";

const TCGDEX_BASE_URL = "https://api.tcgdex.net/v2/en";
const YGOPRODECK_BASE_URL = "https://db.ygoprodeck.com/api/v7";
const SCRYFALL_BASE_URL = "https://api.scryfall.com";

// API req helpers
async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${url}`);
  }

  return response.json() as Promise<T>;
}

// remove dups and sorts a-z
function uniqueSorted(values: Array<string | undefined | null>): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ].sort((a, b) => a.localeCompare(b));
}

// -----------------------------------------------------------------------------
// Pokemon — using TCGdex API
// -----------------------------------------------------------------------------
type PokemonSetResponse = {
  id: string;
  name: string;
  logo?: string;
  cardCount?: { total?: number };
};

type PokemonCard = {
  id: string;
  name: string;
  image?: string;
  localId?: string;
  category?: string;
  rarity?: string;
  suffix?: string;
  hp?: number;
  types?: string[];
  set?: { id?: string; name?: string };
};

const pokemonProvider: CardProvider = {
  id: "pokemon",
  label: "Pokémon",
  description: "Search Pokémon cards by name, expansion, and card variant.",

  async getSets(): Promise<CardSet[]> {
    const data = await fetchJson<PokemonSetResponse[]>(
      `${TCGDEX_BASE_URL}/sets`,
    );

    return data.map((set) => ({
      id: set.id,
      name: set.name,
      game: "pokemon",
      cardCount: set.cardCount?.total,
      logoUrl: set.logo,
    }));
  },

  async getFilterOptions(): Promise<CardFilterOptions> {
    const [categories, suffixes] = await Promise.all([
      fetchJson<Array<{ name: string }>>(
        `${TCGDEX_BASE_URL}/categories`,
      ).catch(() => []),

      fetchJson<Array<{ name: string }>>(
        `${TCGDEX_BASE_URL}/suffixes`,
      ).catch(() => []),
    ]);

    return {
      categories: uniqueSorted(categories.map((item) => item.name)),
      archetypes: uniqueSorted(suffixes.map((item) => item.name)),
      categoryLabel: "Card category",
      archetypeLabel: "Card variant",
    };
  },

  async searchCards(filters: CardSearchFilters): Promise<NormalizedCard[]> {
    const params = new URLSearchParams();

    if (filters.query) params.set("name", filters.query);
    if (filters.setId) params.set("set.id", filters.setId);
    if (filters.category) params.set("category", filters.category);
    if (filters.archetype) params.set("suffix", filters.archetype);

    const query = params.toString();
    const url = `${TCGDEX_BASE_URL}/cards${query ? `?${query}` : ""}`;

    const summaries = await fetchJson<PokemonCard[]>(url);

    // Limit detail requests to avoid to many reqs
    return Promise.all(
      summaries.slice(0, 60).map(async (summary) => {
        try {
          const details = await fetchJson<PokemonCard>(
            `${TCGDEX_BASE_URL}/cards/${encodeURIComponent(summary.id)}`,
          );

          return normalizePokemonCard(details);
        } catch {
          return normalizePokemonCard(summary);
        }
      }),
    );
  },
};

function normalizePokemonCard(card: PokemonCard): NormalizedCard {
  const imageBase = card.image?.replace(/\/$/, "");

  return {
    id: `pokemon-${card.id}`,
    game: "pokemon",
    name: card.name,
    imageUrl: imageBase ? `${imageBase}/low.png` : undefined,
    setId: card.set?.id,
    setName: card.set?.name,
    number: card.localId,
    rarity: card.rarity,
    category: card.category,
    archetype: card.suffix,
    detail:
      card.hp !== undefined
        ? `HP ${card.hp}`
        : card.types?.join(" · "),
  };
}

// -----------------------------------------------------------------------------
// yugioh — using YGOPRODeck
// -----------------------------------------------------------------------------

type YugiohSetResponse = {
  set_name: string;
  num_of_cards?: number;
};

type YugiohCard = {
  id: number;
  name: string;
  type?: string;
  desc?: string;
  race?: string;
  attribute?: string;
  archetype?: string;
  card_sets?: Array<{
    set_name?: string;
    set_code?: string;
    set_rarity?: string;
  }>;
  card_images?: Array<{
    image_url?: string;
    image_url_small?: string;
  }>;
};

type YugiohCardResponse = {
  data?: YugiohCard[];
};

const yugiohProvider: CardProvider = {
  id: "yugioh",
  label: "Yu-Gi-Oh!",
  description: "Search Yu-Gi-Oh! cards by name, set, type, and archetype.",

  async getSets(): Promise<CardSet[]> {
    const data = await fetchJson<YugiohSetResponse[]>(
      `${YGOPRODECK_BASE_URL}/cardsets.php`,
    );

    return data.map((set) => ({
      id: set.set_name,
      name: set.set_name,
      game: "yugioh",
      cardCount: set.num_of_cards,
    }));
  },

  async getFilterOptions(): Promise<CardFilterOptions> {
    const [archetypes, cardResponse] = await Promise.all([
      fetchJson<Array<{ archetype_name: string }>>(
        `${YGOPRODECK_BASE_URL}/archetypes.php`,
      ).catch(() => []),

      fetchJson<YugiohCardResponse>(
        `${YGOPRODECK_BASE_URL}/cardinfo.php?num=100&offset=0`,
      ).catch(() => ({ data: [] })),
    ]);

    return {
      categories: uniqueSorted(
        (cardResponse.data ?? []).map((card) => card.type),
      ),
      archetypes: uniqueSorted(
        archetypes.map((item) => item.archetype_name),
      ),
      categoryLabel: "Card type",
      archetypeLabel: "Archetype",
    };
  },

  async searchCards(filters: CardSearchFilters): Promise<NormalizedCard[]> {
    const params = new URLSearchParams();

    if (filters.query) params.set("fname", filters.query);
    if (filters.setId) params.set("cardset", filters.setId);
    if (filters.category) params.set("type", filters.category);
    if (filters.archetype) params.set("archetype", filters.archetype);

    params.set("num", "60");
    params.set("offset", "0");

    const response = await fetchJson<YugiohCardResponse>(
      `${YGOPRODECK_BASE_URL}/cardinfo.php?${params.toString()}`,
    );

    return (response.data ?? []).map((card) => {
      const image = card.card_images?.[0];
      const set = card.card_sets?.[0];

      return {
        id: `yugioh-${card.id}`,
        game: "yugioh",
        name: card.name,
        imageUrl: image?.image_url_small ?? image?.image_url,
        setId: set?.set_code,
        setName: set?.set_name,
        rarity: set?.set_rarity,
        category: card.type,
        archetype: card.archetype,
        detail: [card.attribute, card.race].filter(Boolean).join(" · "),
      };
    });
  },
};

// -----------------------------------------------------------------------------
// Magic —  using Scryfall
// -----------------------------------------------------------------------------

type MtgSetResponse = {
  code: string;
  name: string;
  card_count?: number;
  icon_svg_uri?: string;
};

type MtgCard = {
  id: string;
  name: string;
  set: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  type_line?: string;
  oracle_text?: string;
  image_uris?: {
    small?: string;
    normal?: string;
  };
  card_faces?: Array<{
    image_uris?: {
      small?: string;
      normal?: string;
    };
  }>;
};

type MtgSearchResponse = {
  data: MtgCard[];
};

const mtgProvider: CardProvider = {
  id: "mtg",
  label: "Magic: The Gathering",
  description: "Search Magic cards by name, set, and card type.",

  async getSets(): Promise<CardSet[]> {
    const response = await fetchJson<{ data: MtgSetResponse[] }>(
      `${SCRYFALL_BASE_URL}/sets`,
    );

    return response.data.map((set) => ({
      id: set.code,
      name: set.name,
      game: "mtg",
      cardCount: set.card_count,
      logoUrl: set.icon_svg_uri,
    }));
  },

  async getFilterOptions(): Promise<CardFilterOptions> {
    return {
      categories: [
        "Creature",
        "Instant",
        "Sorcery",
        "Artifact",
        "Enchantment",
        "Planeswalker",
        "Land",
        "Battle",
      ],
      archetypes: [],
      categoryLabel: "Card type",
      archetypeLabel: "Subtype",
    };
  },

  async searchCards(filters: CardSearchFilters): Promise<NormalizedCard[]> {
    const queryParts: string[] = [];

    if (filters.query) {
      // Quote names with spaces so Scryfall searches them correctly
      const safeName = filters.query.replace(/"/g, '\\"');
      queryParts.push(`name:"${safeName}"`);
    }

    if (filters.setId) queryParts.push(`set:${filters.setId}`);
    if (filters.category) queryParts.push(`type:${filters.category}`);

    // Scryfall api needs search expression.
    const query = queryParts.length
      ? queryParts.join(" ")
      : "game:paper";

    const params = new URLSearchParams({
      q: query,
      order: "name",
      unique: "cards",
    });

    try {
      const response = await fetchJson<MtgSearchResponse>(
        `${SCRYFALL_BASE_URL}/cards/search?${params.toString()}`,
      );

      return response.data.map((card) => {
        const face = card.card_faces?.[0];

        return {
          id: `mtg-${card.id}`,
          game: "mtg",
          name: card.name,
          imageUrl:
            card.image_uris?.small ??
            face?.image_uris?.small ??
            card.image_uris?.normal ??
            face?.image_uris?.normal,
          setId: card.set,
          setName: card.set_name,
          number: card.collector_number,
          rarity: card.rarity,
          category: card.type_line,
          detail: card.oracle_text,
        };
      });
    } catch (error) {
      // scryfall api seems to throw 404 when no cards match
      if (error instanceof Error && error.message.includes("(404)")) {
        return [];
      }

      throw error;
    }
  },
};

// -----------------------------------------------------------------------------
// Shared registry
// -----------------------------------------------------------------------------

export const CARD_PROVIDERS: Record<CardGameId, CardProvider> = {
  pokemon: pokemonProvider,
  yugioh: yugiohProvider,
  mtg: mtgProvider,
};
