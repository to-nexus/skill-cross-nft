// Thin GraphQL client for api.crossnft.io. Apollo Server has CSRF
// protection enabled and introspection disabled, so every request must
// carry the apollo-require-preflight header. We bundle the operation
// strings the skill actually uses (extracted from the live frontend).

const API_BASE = process.env.CROSSNFT_API_BASE || 'https://api.crossnft.io';

export async function gql(query, variables = {}, operationName = undefined) {
  const body = JSON.stringify({ query, variables, operationName });
  const res = await fetch(`${API_BASE}/graphql`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'apollo-require-preflight': 'true',
      'user-agent': 'cross-nft-skill/0.1',
    },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors) {
    const msg = (json.errors || [{ message: `HTTP ${res.status}` }])
      .map((e) => e.message).join('; ');
    throw new Error(`GraphQL ${operationName || ''}: ${msg}`);
  }
  return json.data;
}

// ---- Operations (extracted from the live crossnft.io bundle, then
// pruned to the fields this skill renders). Field names that come back
// `null` for unsupported items are tolerated by the printers. ----

// `order` is intentionally omitted — the upstream `CollectionOrderInput`
// type uses field names that aren't documented and aren't suggested by the
// error helper. The default ordering surfaces volume-leaders first, which
// is what the marketplace homepage shows.
export const Q_LIST_COLLECTIONS = `
  query ListCollectionStatistics(
    $filter: CollectionStatsFilterInput!
    $days: String
    $pagination: PaginationInput
  ) {
    collectionStatistics(filter: $filter, pagination: $pagination) {
      collectionId
      contractAddress
      owners
      supply
      listings
      floorPrice(days: $days) { value change changeRate }
      volume(days: $days)     { value change changeRate }
      sales(days: $days)      { value change changeRate }
      collection {
        id name slug protocol contractAddress description networkId isLive
        network { id name chainId explorerUrl isTestnet }
      }
    }
    collectionsCount
  }
`;

export const Q_GET_TOKEN = `
  query GetToken($filter: GetTokenFilter!) {
    token(filter: $filter) {
      id tokenId protocol owner imageUrl quantity locked burned tokenURI
      auction {
        id listingId seller quantity startPrice endPrice
        paymentToken startTime endTime
        payment { id symbol name decimals address }
      }
      collection {
        id name slug contractAddress networkId
        network { chainId explorerUrl }
      }
      definition {
        metadata {
          name description image animationUrl
          attributes { traitType value displayType }
        }
      }
    }
  }
`;

export const Q_LIST_TOKENS = `
  query ListTokens(
    $filter: ListTokensFilter!
    $pagination: PaginationInput
  ) {
    tokens(filter: $filter, pagination: $pagination) {
      id tokenId protocol owner imageUrl
      auction {
        id listingId seller quantity startPrice endPrice
        paymentToken startTime endTime
        payment { symbol decimals address }
      }
      collection { id name slug contractAddress }
      definition { metadata { name } }
    }
    tokensCount(filter: $filter)
  }
`;

export const Q_LIST_OFFERS = `
  query ListOffers(
    $filter: ListOffersFilter!
    $pagination: PaginationInput
  ) {
    offers(filter: $filter, pagination: $pagination) {
      id tokenId offerId offeror quantity offerPrice paymentToken
      expirationTime acceptedTime
      payment { symbol decimals address }
      token { tokenId definition { metadata { name } } }
      contract { address name type }
    }
    offersCount(filter: $filter)
  }
`;

export const Q_LIST_ACTIVITIES = `
  query ListActivities(
    $filter: ListActivitiesFilter!
    $pagination: PaginationInput
  ) {
    activities(filter: $filter, pagination: $pagination) {
      id type tokenId quantity price paymentToken
      fromAddress toAddress txHash insertedAt
      payment { symbol decimals address }
      collection { name contractAddress }
      token { tokenId definition { metadata { name } } }
    }
    activitiesCount(filter: $filter)
  }
`;

export const Q_GET_MARKET_DEPTH = `
  query GetMarketDepth($filter: DepthDataListFilterInput!) {
    marketDepth(filter: $filter) {
      listings { price count paymentToken }
      offers   { price count paymentToken }
    }
  }
`;

export const Q_GET_STATISTICS = `
  query GetStatistics($filter: StatisticsFilterInput!) {
    statistics(filter: $filter) { averagePrice volume sales }
  }
`;

export const Q_LIST_TRADE_HISTORIES = `
  query ListTradeHistories($filter: CollectionIdFilterInput!) {
    tradeHistories(filter: $filter) {
      last24Hours { floor average volume timestamp }
      last7Days   { floor average volume timestamp }
      last30Days  { floor average volume timestamp }
    }
  }
`;

export const Q_LIST_SEARCH = `
  query ListSearchResults($keyword: String!) {
    search(keyword: $keyword) {
      score
      item {
        ... on CollectionSearchItem {
          id name slug protocol contractAddress networkId searchType
        }
        ... on GameSearchItem {
          id name slug genres platforms searchType
        }
      }
    }
  }
`;

export const M_REFRESH_METADATA = `
  mutation RefreshMetadata($input: RefreshMetadataInput!) {
    refreshMetadata(input: $input)
  }
`;
