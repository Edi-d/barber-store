/**
 * nop-client — token management + transport for the nopCommerce storefront API.
 *
 * Catalogue calls only (browse/search/PDP/filters/home). Auth is an anonymous
 * "guest token" that is freely mintable and NOT secret (guide §2a), so it's cached
 * in AsyncStorage like the cart — not secure storage.
 *
 * Conventions enforced here (guide §3):
 *   - GET: Accept + Authorization headers only.
 *   - POST: always send a JSON body ('{}' when empty) — a missing body returns 411,
 *     and a hand-set Content-Length:0 alongside a body is a Cloudflare 400.
 *   - Bodies are snake_case (camelCase is silently ignored upstream).
 *   - On 401 the cached token expired early → re-mint ONCE and retry (no loop).
 *
 * Endpoint wrappers live at the bottom; adapters that map responses onto the app's
 * MarketplaceProduct shape live in lib/nop-catalog.ts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  NopAutoCompleteResponse,
  NopCategory,
  NopFilteredProductsBody,
  NopGetCategoryProductsResponse,
  NopGetFilterOptionsResponse,
  NopGetFilteredProductsResponse,
  NopGetProductDetailsResponse,
  NopGetShippingMethodInfosResponse,
  NopGuestTokenResponse,
  NopHomepageContentResponse,
  NopStoriesResponse,
  NopUrlRecord,
} from '@/types/nop';

const BASE_URL = process.env.EXPO_PUBLIC_NOP_BASE_URL ?? '';

// Persist the guest token so we don't mint one per cold start.
const TOKEN_STORAGE_KEY = 'barber_nop_guest_token';
// Re-mint this long before the JWT `exp` to avoid using a near-dead token.
const REFRESH_BUFFER_MS = 12 * 3600_000;
// Fallback TTL when the JWT `exp` claim can't be decoded.
const FALLBACK_TTL_MS = 6 * 24 * 3600_000;

type CachedToken = { token: string; expiresAtMs: number };

let cachedToken: CachedToken | null = null;
let inFlightMint: Promise<string> | null = null;
// Resolves once we've attempted to read a persisted token from AsyncStorage.
let hydrated = false;

if (!BASE_URL && __DEV__) {
  console.warn(
    '[nop-client] EXPO_PUBLIC_NOP_BASE_URL is not set — catalogue calls will fail.',
  );
}

// ─── JWT helpers ─────────────────────────────────────────
// Hermes has no reliable atob(), so decode base64url by hand.
const B64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64Url(input: string): string {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < padded.length; i++) {
    const ch = padded[i];
    if (ch === '=') break;
    const idx = B64_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}

/** Returns the JWT `exp` claim in ms, or 0 if it can't be read. */
function jwtExpMs(jwt: string): number {
  try {
    const payload = jwt.split('.')[1];
    if (!payload) return 0;
    const exp = JSON.parse(decodeBase64Url(payload)).exp;
    return exp ? Number(exp) * 1000 : 0;
  } catch {
    return 0;
  }
}

// ─── Token cache ─────────────────────────────────────────
async function hydrateFromStorage(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
    if (raw) cachedToken = JSON.parse(raw) as CachedToken;
  } catch {
    // ignore — we'll just mint fresh
  }
}

async function persistToken(t: CachedToken): Promise<void> {
  try {
    await AsyncStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(t));
  } catch {
    // non-fatal — token still lives in memory for this session
  }
}

async function mintGuestToken(): Promise<string> {
  if (inFlightMint) return inFlightMint;
  inFlightMint = (async () => {
    const res = await fetch(`${BASE_URL}/api/Authenticate/GetGuestToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Never send Content-Length:0 with a body (Cloudflare 400). Let fetch size it.
      body: '{}',
    });
    if (!res.ok) throw new Error(`GetGuestToken ${res.status}`);
    const data = (await res.json()) as NopGuestTokenResponse;
    if (!data.token) throw new Error('GetGuestToken returned no token');
    const exp = jwtExpMs(data.token);
    cachedToken = {
      token: data.token,
      expiresAtMs: exp > 0 ? exp : Date.now() + FALLBACK_TTL_MS,
    };
    void persistToken(cachedToken);
    return data.token;
  })();
  try {
    return await inFlightMint;
  } finally {
    inFlightMint = null;
  }
}

async function bearer(): Promise<string> {
  await hydrateFromStorage();
  if (cachedToken && cachedToken.expiresAtMs - REFRESH_BUFFER_MS > Date.now()) {
    return cachedToken.token;
  }
  return mintGuestToken();
}

// ─── Core request helper ─────────────────────────────────
type NopRequest = {
  method?: 'GET' | 'POST';
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  isRetry?: boolean;
};

export async function nop<T>(opts: NopRequest): Promise<T> {
  const qs = opts.query
    ? '?' +
      Object.entries(opts.query)
        .filter(([, v]) => v != null)
        .map(
          ([k, v]) =>
            `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
        )
        .join('&')
    : '';

  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await bearer()}`,
    Accept: 'application/json',
  };
  const init: RequestInit = { method, headers };

  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  } else if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
    init.body = '{}'; // POST always needs a body (else 411)
  }

  const res = await fetch(`${BASE_URL}${opts.path}${qs}`, init);

  // Token expired early → re-mint once and retry the request a single time.
  if (res.status === 401 && !opts.isRetry) {
    cachedToken = null;
    await mintGuestToken();
    return nop<T>({ ...opts, isRetry: true });
  }

  const text = await res.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(parsed?.message ?? `nop ${opts.path} → HTTP ${res.status}`);
  }
  return parsed as T;
}

// ─── Endpoint wrappers ───────────────────────────────────

/** Root categories with their sub_categories tree (guide §4a). */
export function getHomePageCategories(): Promise<NopCategory[]> {
  return nop<NopCategory[]>({ path: '/api/Catalog/HomePageCategories' });
}

/** Paged products in a category (guide §4c). Reliable hydrated product list. */
export function getCategoryProducts(
  categoryId: number,
  pageNumber: number,
  pageSize: number,
  orderBy = 0,
): Promise<NopGetCategoryProductsResponse> {
  return nop<NopGetCategoryProductsResponse>({
    method: 'POST',
    path: `/api/Catalog/GetCategoryProducts/${categoryId}`,
    body: { dto: { pageNumber, pageSize, orderBy } },
  });
}

/** Rich product detail payload for the PDP (guide §4d). */
export function getProductDetails(
  productId: number,
): Promise<NopGetProductDetailsResponse> {
  return nop<NopGetProductDetailsResponse>({
    path: `/api/Product/GetProductDetails/${productId}`,
  });
}

/**
 * Filtered products (guide §6b). Products only hydrate when scoped by a
 * category_id and/or the SINGULAR manufacturer_id — an unscoped call returns 0.
 * imageSize is a path param (e.g. 400).
 */
export function getFilteredProducts(
  body: NopFilteredProductsBody,
  imageSize = 400,
): Promise<NopGetFilteredProductsResponse> {
  return nop<NopGetFilteredProductsResponse>({
    method: 'POST',
    path: `/api/AjaxFiltersApi/GetFilteredProducts/${imageSize}`,
    body,
  });
}

/** Facet options for a category; manufacturer list lives in manufacturer_filter (guide §6a). */
export function getFilterOptions(
  categoryId: number,
  manufacturerId = 0,
  vendorId = 0,
): Promise<NopGetFilterOptionsResponse> {
  return nop<NopGetFilterOptionsResponse>({
    path: `/api/AjaxFiltersApi/GetFilterOptions/${categoryId}/${manufacturerId}/${vendorId}`,
  });
}

/** Search autocomplete (guide §5). term may contain <b>…</b> — strip before render. */
export function autoComplete(term: string): Promise<NopAutoCompleteResponse> {
  return nop<NopAutoCompleteResponse>({
    path: '/api/ElasticSearchApi/AutoComplete',
    query: { term },
  });
}

/**
 * Home hero sliders + card widget zones (guide §7a).
 * slide_widget_zones MUST be non-null or upstream 500s. The main hero carousel
 * lives in the 'home_page_top' zone.
 */
export function getHomepageContent(
  slideWidgetZones: string[] = ['home_page_top'],
  slidePictureSize = 1000,
): Promise<NopHomepageContentResponse> {
  return nop<NopHomepageContentResponse>({
    method: 'POST',
    path: '/api/CrodiMobile/GetHomepageContent',
    body: {
      slide_widget_zones: slideWidgetZones,
      cards_widget_zones: [],
      slide_picture_size: slidePictureSize,
    },
  });
}

/** Merchant stories / promo reel (guide §7b). */
export function getStories(): Promise<NopStoriesResponse> {
  return nop<NopStoriesResponse>({ path: '/api/Story/GetStories' });
}

/**
 * Available courier / shipping options with logos + flat prices. Cart-independent
 * (unlike /api/Checkout/PaymentMethod, which needs a populated nop cart), so it
 * works with just the guest token. pictureSize is the courier-logo edge in px.
 */
export function getShippingMethodInfos(
  pictureSize = 200,
): Promise<NopGetShippingMethodInfosResponse> {
  return nop<NopGetShippingMethodInfosResponse>({
    path: '/api/ShippingMethodInfo/GetShippingMethodInfos',
    query: { pictureSize },
  });
}

/** Resolve a CMS slug to its entity (guide §8). slug must NOT have a leading '/'. */
export function bySlug(slug: string): Promise<NopUrlRecord> {
  return nop<NopUrlRecord>({
    path: '/api/UrlRecord/BySlug',
    query: { slug: slug.replace(/^\//, '') },
  });
}
