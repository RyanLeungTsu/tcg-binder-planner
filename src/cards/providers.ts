export {};

import type {
  CardFilterOptions,
  CardGameId,
  CardPrice,
  CardVariant,
  CardProvider,
  CardSearchFilters,
  CardSet,
  NormalizedCard,
} from "./types";

const TCGDEX_BASE_URL = "https://api.tcgdex.net/v2/en";
const YGOPRODECK_BASE_URL = "https://db.ygoprodeck.com/api/v7";
const SCRYFALL_BASE_URL = "https://api.scryfall.com";

// API req helpers
const responseCache = new Map<string, Promise<unknown>>();

async function fetchJson<T>(url: string): Promise<T> {
  let request = responseCache.get(url);

  if (!request) {
    request = fetch(url).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Request failed (${response.status}): ${url}`);
      }

      return response.json();
    });

    responseCache.set(url, request);
  }

  try {
    return (await request) as T;
  } catch (error) {
    responseCache.delete(url);
    throw error;
  }
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

type PokemonSetDetails = {
  serie?: {
    id?: string;
  };
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
  set?: {
    id?: string;
    name?: string;
    serie?: {
      id?: string;
    };
  };
  variants?: {
    normal?: boolean;
    reverse?: boolean;
    holo?: boolean;
    firstEdition?: boolean;
    wPromo?: boolean;
  };
  pricing?: {
    cardmarket?: {
      unit?: string;
      trend?: number;
      low?: number;
      avg?: number;
      "trend-holo"?: number;
    };
    tcgplayer?: {
      unit?: string;
      updated?: string | number;
      normal?: PokemonMarketPrice;
      holofoil?: PokemonMarketPrice;
      "reverse-holofoil"?: PokemonMarketPrice;
      "1st-edition"?: PokemonMarketPrice;
      "1st-edition-holofoil"?: PokemonMarketPrice;
      unlimited?: PokemonMarketPrice;
      "unlimited-holofoil"?: PokemonMarketPrice;
    };
  };
};

type PokemonMarketPrice = {
  marketPrice?: number;
  lowPrice?: number;
  midPrice?: number;
  highPrice?: number;
};

// current sets with issues from api
const POKEMON_IMAGE_FALLBACKS: Record<
  string,
  { series: string; assetSetId: string; language?: string }
> = {
  "swsh4.5sv": { series: "swsh", assetSetId: "swsh4.5" },
  "swsh12.5gg": { series: "swsh", assetSetId: "swsh12.5" },
  swsh9tg: { series: "swsh", assetSetId: "swsh9" },
  "swsh9.5tg": { series: "swsh", assetSetId: "swsh9" },
  swsh10tg: { series: "swsh", assetSetId: "swsh10" },
  "swsh10.5tg": { series: "swsh", assetSetId: "swsh10" },
  swsh11tg: { series: "swsh", assetSetId: "swsh11" },
  "swsh11.5tg": { series: "swsh", assetSetId: "swsh11" },
  swsh12tg: { series: "swsh", assetSetId: "swsh12" },
  "swsh12.5tg": { series: "swsh", assetSetId: "swsh12" },
  exu: { series: "ex", assetSetId: "ex10", language: "fr" },
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
      fetchJson<Array<{ name: string }>>(`${TCGDEX_BASE_URL}/categories`).catch(
        () => [],
      ),

      fetchJson<Array<{ name: string }>>(`${TCGDEX_BASE_URL}/suffixes`).catch(
        () => [],
      ),
    ]);

    return {
      categories: uniqueSorted(categories.map((item) => item.name)),
      archetypes: uniqueSorted(suffixes.map((item) => item.name)),
      categoryLabel: "Card category",
      archetypeLabel: "Card variant",
    };
  },

  async searchCards(
    filters: CardSearchFilters,
    page: number,
    pageSize: number,
  ): Promise<NormalizedCard[]> {
    const language = filters.language ?? "en";
    const languages: Array<"en" | "jp"> =
      language === "both" ? ["en", "jp"] : [language];

    // default set to exclude pockettcg
    const pocketSetIds = new Set<string>();

    if (filters.includePocket !== true) {
      const pocketSeriesByLanguage = await Promise.all(
        languages.map((selectedLanguage) =>
          fetchJson<{ sets?: Array<{ id: string }> }>(
            `https://api.tcgdex.net/v2/${selectedLanguage}/series/tcgp`,
          ),
        ),
      );

      pocketSeriesByLanguage.forEach((series) => {
        series.sets?.forEach((set) => {
          pocketSetIds.add(set.id.toLowerCase());
        });
      });
    }

    async function searchLanguage(
      selectedLanguage: "en" | "jp",
    ): Promise<PokemonCard[]> {
      const params = new URLSearchParams();

      if (filters.query) params.set("name", filters.query);
      if (filters.setId) params.set("set.id", filters.setId);
      if (filters.category) params.set("category", filters.category);
      if (filters.archetype) params.set("suffix", filters.archetype);

      params.set("pagination:page", String(page));
      params.set("pagination:itemsPerPage", String(pageSize));

      const query = params.toString();
      const baseUrl = `https://api.tcgdex.net/v2/${selectedLanguage}`;

      return fetchJson<PokemonCard[]>(
        `${baseUrl}/cards${query ? `?${query}` : ""}`,
      );
    }

    const batches = await Promise.all(
      languages.map((selectedLanguage) => searchLanguage(selectedLanguage)),
    );

    // combine languages without dup card ID
    const uniqueCards = new Map<string, PokemonCard>();

    batches.flat().forEach((card) => {
      // TCGdex card IDs begin with their set ID (ex A1-001)
      const cardId = card.id.toLowerCase();

      const isPocketCard = Array.from(pocketSetIds).some((setId) =>
        cardId.startsWith(`${setId}-`),
      );

      if (filters.includePocket !== true && isPocketCard) {
        return;
      }

      if (!uniqueCards.has(card.id)) {
        uniqueCards.set(card.id, card);
      }
    });

    const cards = Array.from(uniqueCards.values()).slice(0, pageSize);

    return Promise.all(
      cards.map(async (summary) => {
        try {
          const details = await fetchJson<PokemonCard>(
            `https://api.tcgdex.net/v2/${language === "jp" ? "jp" : "en"}/cards/${encodeURIComponent(summary.id)}`,
          );

          return normalizePokemonCard({
            ...details,
            image: details.image ?? summary.image,
            localId: details.localId ?? summary.localId,
          });
        } catch {
          return normalizePokemonCard(summary);
        }
      }),
    );
  },
};

async function getPokemonFallbackImage(
  card: PokemonCard,
): Promise<string | undefined> {
  const setId = card.set?.id;
  const localId = card.localId;

  if (!setId || !localId) return undefined;

  const knownFallback = POKEMON_IMAGE_FALLBACKS[setId];

  let seriesId = knownFallback?.series;

  if (!seriesId) {
    try {
      const setDetails = await fetchJson<PokemonSetDetails>(
        `${TCGDEX_BASE_URL}/sets/${encodeURIComponent(setId)}`,
      );

      seriesId = setDetails.serie?.id;
    } catch {
      return undefined;
    }
  }

  if (!seriesId) return undefined;

  const assetSetId = knownFallback?.assetSetId ?? setId;
  const language = knownFallback?.language ?? "en";

  return `https://assets.tcgdex.net/${language}/${seriesId}/${assetSetId}/${encodeURIComponent(localId)}/low.png`;
}

function getPokemonVariants(card: PokemonCard): CardVariant[] {
  const variants = card.variants;
  const pricing = card.pricing;

  if (!variants) return [];

  const variantOptions: Array<{
    id: string;
    label: string;
    tcgplayerKey: "normal" | "holofoil" | "reverse-holofoil" | "1st-edition";
    cardmarketKey?: "trend" | "trend-holo";
  }> = [
    {
      id: "normal",
      label: "Normal",
      tcgplayerKey: "normal",
      cardmarketKey: "trend",
    },
    {
      id: "reverse",
      label: "Reverse Holo",
      tcgplayerKey: "reverse-holofoil",
    },
    {
      id: "holo",
      label: "Holo",
      tcgplayerKey: "holofoil",
      cardmarketKey: "trend-holo",
    },
    {
      id: "firstEdition",
      label: "First Edition",
      tcgplayerKey: "1st-edition",
    },
  ];

  return variantOptions
    .filter((variant) => variants[variant.id as keyof typeof variants] === true)
    .map((variant) => {
      const tcgPrice = pricing?.tcgplayer?.[variant.tcgplayerKey];
      const cardmarketPrice = variant.cardmarketKey
        ? pricing?.cardmarket?.[variant.cardmarketKey]
        : undefined;

      const prices: CardPrice[] = [];

      if (tcgPrice && typeof tcgPrice === "object") {
        if (typeof tcgPrice.marketPrice === "number") {
          prices.push({
            source: "TCGplayer",
            currency: pricing?.tcgplayer?.unit ?? "USD",
            market: tcgPrice.marketPrice,
            low: tcgPrice.lowPrice,
            mid: tcgPrice.midPrice,
          });
        }
      }

      if (typeof cardmarketPrice === "number") {
        prices.push({
          source: "Cardmarket",
          currency: pricing?.cardmarket?.unit ?? "EUR",
          market: cardmarketPrice,
          low: pricing?.cardmarket?.low,
        });
      }

      return {
        id: variant.id,
        label: variant.label,
        prices,
      };
    });
}

async function normalizePokemonCard(
  card: PokemonCard,
): Promise<NormalizedCard> {
  const imageBase = card.image?.replace(/\/$/, "");

  const fallbackImageUrl = imageBase
    ? undefined
    : await getPokemonFallbackImage(card);

  const variants = getPokemonVariants(card);

  // normal as default otherwise uses 1st available var
  const selectedVariant =
    variants.find((variant) => variant.id === "normal") ?? variants[0];

  return {
    id: `pokemon-${card.id}`,
    game: "pokemon",
    name: card.name,

    variants,
    selectedVariantId: selectedVariant?.id,
    prices: selectedVariant?.prices ?? [],

    imageUrl: imageBase ? `${imageBase}/low.png` : fallbackImageUrl,
    setId: card.set?.id,
    setName: card.set?.name,
    number: card.localId,
    rarity: card.rarity,
    category: card.category,
    archetype: card.suffix,
    detail: card.hp !== undefined ? `HP ${card.hp}` : card.types?.join(" · "),
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
  card_prices?: Array<{
    cardmarket_price?: string;
    tcgplayer_price?: string;
    ebay_price?: string;
    amazon_price?: string;
    coolstuffinc_price?: string;
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
      archetypes: uniqueSorted(archetypes.map((item) => item.archetype_name)),
      categoryLabel: "Card type",
      archetypeLabel: "Archetype",
    };
  },

  async searchCards(
    filters: CardSearchFilters,
    page: number,
    pageSize: number,
  ): Promise<NormalizedCard[]> {
    const params = new URLSearchParams();

    if (filters.query) params.set("fname", filters.query);
    if (filters.setId) params.set("cardset", filters.setId);
    if (filters.category) params.set("type", filters.category);
    if (filters.archetype) params.set("archetype", filters.archetype);

    params.set("num", String(pageSize));
    params.set("offset", String((page - 1) * pageSize));

    const response = await fetchJson<YugiohCardResponse>(
      `${YGOPRODECK_BASE_URL}/cardinfo.php?${params.toString()}`,
    );

    return (response.data ?? []).map((card) => {
      const image = card.card_images?.find(
        (item) => item.image_url_small || item.image_url,
      );
      const set = card.card_sets?.[0];

      return {
        id: `yugioh-${card.id}`,
        game: "yugioh",
        name: card.name,
        prices: [
          {
            source: "TCGplayer",
            currency: "USD",
            market: Number(card.card_prices?.[0]?.tcgplayer_price),
          },
          {
            source: "Cardmarket",
            currency: "EUR",
            market: Number(card.card_prices?.[0]?.cardmarket_price),
          },
        ].filter((price) => Number.isFinite(price.market) && price.market > 0),
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
  prices?: {
    usd?: string | null;
    usd_foil?: string | null;
    eur?: string | null;
    eur_foil?: string | null;
  };
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

  async searchCards(
    filters: CardSearchFilters,
    page: number,
    pageSize: number,
  ): Promise<NormalizedCard[]> {
    const queryParts: string[] = [];

    if (filters.query) {
      const safeName = filters.query.replace(/"/g, '\\"');
      queryParts.push(`name:"${safeName}"`);
    }

    if (filters.setId) queryParts.push(`set:${filters.setId}`);
    if (filters.category) queryParts.push(`type:${filters.category}`);

    const query = queryParts.length ? queryParts.join(" ") : "game:paper";

    const params = new URLSearchParams({
      q: query,
      order: "name",
      unique: "cards",
      page: String(page),
    });

    try {
      const response = await fetchJson<MtgSearchResponse>(
        `${SCRYFALL_BASE_URL}/cards/search?${params.toString()}`,
      );

      return response.data.slice(0, pageSize).map((card) => {
        const face = card.card_faces?.find(
          (item) => item.image_uris?.small || item.image_uris?.normal,
        );

        return {
          id: `mtg-${card.id}`,
          game: "mtg",
          name: card.name,
          prices: [
            {
              source: "Market",
              currency: "USD",
              market: Number(card.prices?.usd),
            },
            {
              source: "Foil",
              currency: "USD",
              market: Number(card.prices?.usd_foil),
            },
            {
              source: "Market",
              currency: "EUR",
              market: Number(card.prices?.eur),
            },
            {
              source: "Foil",
              currency: "EUR",
              market: Number(card.prices?.eur_foil),
            },
          ].filter(
            (price) => Number.isFinite(price.market) && price.market > 0,
          ),
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
      // Scryfall seems to return 404 when cards dont match
      if (error instanceof Error && error.message.includes("(404)")) {
        return [];
      }

      throw error;
    }
  },
};

// -----------------------------------------------------------------------------
// Shared reg
// -----------------------------------------------------------------------------
export const CARD_PROVIDERS: Record<CardGameId, CardProvider> = {
  pokemon: pokemonProvider,
  yugioh: yugiohProvider,
  mtg: mtgProvider,
};
