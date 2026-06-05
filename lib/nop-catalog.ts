/**
 * nop-catalog — maps nopCommerce API responses onto the app's catalogue shapes
 * (MarketplaceProduct / MarketplaceCategory / MarketplaceBrand) and exposes the
 * screen-facing fetchers used by useMarketplaceCatalog and the paginated hooks.
 *
 * Mapping notes (verified against live staging):
 *   - Prices are floats in lei → ×100 for cents. price_value → price_cents,
 *     old_price_value → compare_at_price_cents, prp_value → prp_cents (PDP only).
 *   - List products carry NO explicit stock or brand. Stock is inferred from
 *     product_price.disable_buy_button; brand is only available on the PDP via
 *     product_manufacturers. The PDP carries real in_stock.
 *   - "NOU" badge keys off created_at: we synthesize "now" when nop flags the
 *     product as new (mark_as_new / is_new), else null.
 *   - There is no global manufacturer list endpoint; brands for the home row are
 *     aggregated from the manufacturer facet of the top categories.
 */

import {
  autoComplete,
  bySlug,
  getFilterOptions,
  getFilteredProducts,
  getHomePageCategories,
  getHomepageContent,
  getProductDetails,
  getStories,
} from '@/lib/nop-client';
import type {
  MarketplaceBrand,
  MarketplaceCategory,
  MarketplaceProduct,
} from '@/hooks/use-marketplace-catalog';
import type {
  NopAutoCompleteItem,
  NopCategory,
  NopListProduct,
  NopManufacturerFilterItem,
  NopPicture,
  NopProductDetails,
  NopSlideItem,
} from '@/types/nop';

// How many top categories to sample for the home "Branduri" row.
const BRAND_SOURCE_CATEGORIES = 6;
// How many top categories to aggregate for the home product seed. nop clamps
// every page to 16 items, so we pull page 1 from several categories to get a
// diverse, populated seed spanning price ranges (one category alone is too thin).
const SEED_SOURCE_CATEGORIES = 8;
// Synthetic in-stock quantity for list products (nop list items have no qty).
const ASSUMED_STOCK = 50;

// ─── Small utils ─────────────────────────────────────────
export function leiToCents(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  return Math.round(value * 100);
}

/** Strip HTML tags + collapse whitespace for plain-text rendering (guide §11). */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#?\w+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip the <b>…</b> highlight nop wraps around autocomplete matches (guide §5). */
export function stripBold(s: string | null | undefined): string {
  return (s ?? '').replace(/<\/?b>/gi, '');
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function pickImage(p: NopPicture | null | undefined): string | null {
  if (!p) return null;
  return p.image_url ?? p.full_size_image_url ?? p.thumb_image_url ?? null;
}

function pictureList(pics: NopPicture[] | null | undefined): string[] {
  if (!Array.isArray(pics)) return [];
  return pics.map(pickImage).filter((u): u is string => !!u);
}

// ─── Product adapters ────────────────────────────────────
export function nopListProductToMarketplace(
  p: NopListProduct,
  categoryId: string | null = null,
): MarketplaceProduct {
  const price = p.product_price ?? ({} as NopListProduct['product_price']);
  const outOfStock = price.disable_buy_button === true;
  return {
    id: String(p.id),
    sku: p.sku ?? String(p.id),
    name: p.name,
    description: stripHtml(p.short_description) || null,
    // List items don't expose a brand; the card hides the brand line when null.
    brand: null,
    price_cents: leiToCents(price.price_value),
    prp_cents: price.prp_value != null ? leiToCents(price.prp_value) : null,
    compare_at_price_cents:
      price.old_price_value != null ? leiToCents(price.old_price_value) : null,
    stock_qty: outOfStock ? 0 : ASSUMED_STOCK,
    images: pictureList(p.pictures),
    section: 'professional',
    is_active: true,
    category_id: categoryId,
    // Drive the "NOU" badge from nop's mark_as_new flag.
    created_at: p.mark_as_new ? new Date().toISOString() : null,
  };
}

export function nopProductDetailsToMarketplace(
  d: NopProductDetails,
): MarketplaceProduct {
  const price = d.product_price ?? ({} as NopProductDetails['product_price']);
  const gallery = pictureList(d.picture_models);
  const fallback = pickImage(d.default_picture);
  const images = gallery.length > 0 ? gallery : fallback ? [fallback] : [];
  return {
    id: String(d.id),
    sku: d.sku ?? String(d.id),
    name: d.name,
    description: stripHtml(d.full_description) || stripHtml(d.short_description) || null,
    brand: d.product_manufacturers?.[0]?.name ?? null,
    price_cents: leiToCents(price.price_value),
    prp_cents: price.prp_value != null ? leiToCents(price.prp_value) : null,
    compare_at_price_cents:
      price.old_price_value != null ? leiToCents(price.old_price_value) : null,
    stock_qty: d.in_stock ? ASSUMED_STOCK : 0,
    images,
    section: 'professional',
    is_active: true,
    category_id: null,
    created_at: d.is_new ? new Date().toISOString() : null,
  };
}

// ─── Category adapter ────────────────────────────────────
/** Flatten nop's nested category tree into the flat parent_id list the UI uses. */
export function flattenCategories(
  cats: NopCategory[],
  parentId: string | null = null,
  sortBase = 0,
): MarketplaceCategory[] {
  const out: MarketplaceCategory[] = [];
  cats.forEach((c, idx) => {
    out.push({
      id: String(c.id),
      section: 'professional',
      parent_id: parentId,
      slug: c.se_name ?? slugify(c.name),
      // nop names are already Romanian.
      title_ro: c.name,
      sort_order: (sortBase + idx + 1) * 10,
      image_url: pickImage(c.picture),
    });
    if (Array.isArray(c.sub_categories) && c.sub_categories.length > 0) {
      out.push(...flattenCategories(c.sub_categories, String(c.id), idx * 100));
    }
  });
  return out;
}

// ─── Brand adapter ───────────────────────────────────────
function manufacturerToBrand(
  m: NopManufacturerFilterItem,
  index: number,
): MarketplaceBrand {
  return {
    // manufacturer id (the value GetFilteredProducts.manufacturer_id expects).
    id: String(m.id),
    slug: slugify(m.name),
    name: m.name,
    logo_url: null,
    is_featured: index < 8,
    sort_order: index,
  };
}

// ─── Screen-facing fetchers ──────────────────────────────

export type HomeCatalog = {
  products: MarketplaceProduct[];
  categories: MarketplaceCategory[];
  brands: MarketplaceBrand[];
};

/**
 * Home seed: full category tree + an aggregated brand list + one page of products
 * scoped to the first top category (GetFilteredProducts needs a scope to hydrate).
 * The home screen slices this seed client-side; full browse uses the category /
 * brand screens.
 */
export async function fetchHomeCatalog(seedSize = 100): Promise<HomeCatalog> {
  if (__DEV__) console.log('[nop] fetchHomeCatalog: start, base =', process.env.EXPO_PUBLIC_NOP_BASE_URL);
  const nopCats = await getHomePageCategories();
  if (__DEV__) console.log('[nop] fetchHomeCatalog: categories =', nopCats?.length);
  const categories = flattenCategories(nopCats);
  const topIds = nopCats.map((c) => c.id);

  // Brands: aggregate the manufacturer facet across the first few top categories
  // (there is no global manufacturer list endpoint). De-dupe by id.
  const brandMap = new Map<number, NopManufacturerFilterItem>();
  const sampleCatIds = topIds.slice(0, BRAND_SOURCE_CATEGORIES);
  const facets = await Promise.all(
    sampleCatIds.map((id) =>
      getFilterOptions(id).catch(() => null),
    ),
  );
  for (const fo of facets) {
    for (const m of fo?.manufacturer_filter?.manufacturer_filter_items ?? []) {
      if (!brandMap.has(m.id)) brandMap.set(m.id, m);
    }
  }
  const brands = Array.from(brandMap.values())
    .sort((a, b) => a.name.localeCompare(b.name, 'ro'))
    .map(manufacturerToBrand);

  // Seed products: aggregate page 1 from several top categories (nop hydrates
  // GetFilteredProducts only when scoped, and clamps each page to 16). Each
  // product is tagged with its source category so the home pivots can group it.
  // De-dupe by id across categories.
  const seedCatIds = topIds.slice(0, SEED_SOURCE_CATEGORIES);
  const pages = await Promise.all(
    seedCatIds.map((id) =>
      getFilteredProducts({
        category_id: id,
        page_number: 1,
        page_size: seedSize,
        order_by: 0,
      })
        .then((res) =>
          (res.products ?? []).map((p) =>
            nopListProductToMarketplace(p, String(id)),
          ),
        )
        .catch(() => [] as MarketplaceProduct[]),
    ),
  );
  const seen = new Set<string>();
  const products: MarketplaceProduct[] = [];
  for (const page of pages) {
    for (const p of page) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      products.push(p);
    }
  }

  if (__DEV__)
    console.log('[nop] fetchHomeCatalog: done —', {
      products: products.length,
      categories: categories.length,
      brands: brands.length,
    });
  return { products, categories, brands };
}

export type ProductPage = {
  products: MarketplaceProduct[];
  pageNumber: number;
  hasNextPage: boolean;
};

/**
 * One page of a category's products (paginated browse). Uses GetFilteredProducts
 * (scoped by category_id) so an optional manufacturerId brand filter can be applied
 * — GetFilteredProducts supports the SINGULAR manufacturer_id (guide §6b).
 */
export async function fetchCategoryProductsPage(
  categoryId: number,
  pageNumber: number,
  pageSize = 24,
  manufacturerId?: number | null,
): Promise<ProductPage> {
  const res = await getFilteredProducts({
    category_id: categoryId,
    manufacturer_id: manufacturerId ?? undefined,
    page_number: pageNumber,
    page_size: pageSize,
    order_by: 0,
  });
  return {
    products: (res.products ?? []).map((p) =>
      nopListProductToMarketplace(p, String(categoryId)),
    ),
    pageNumber: res.paging_filtering_context?.page_number ?? pageNumber,
    hasNextPage: res.paging_filtering_context?.has_next_page ?? false,
  };
}

export type CategoryBrand = { id: number; name: string };

/** Manufacturer facet for a category — the brand filter options (guide §6a). */
export async function fetchCategoryBrands(
  categoryId: number,
): Promise<CategoryBrand[]> {
  try {
    const fo = await getFilterOptions(categoryId);
    return (fo.manufacturer_filter?.manufacturer_filter_items ?? [])
      .map((m) => ({ id: m.id, name: m.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ro'));
  } catch {
    return [];
  }
}

/** One page of a manufacturer's products (brand browse — singular manufacturer_id). */
export async function fetchBrandProductsPage(
  manufacturerId: number,
  pageNumber: number,
  pageSize = 24,
): Promise<ProductPage> {
  const res = await getFilteredProducts({
    manufacturer_id: manufacturerId,
    page_number: pageNumber,
    page_size: pageSize,
    order_by: 0,
  });
  return {
    products: (res.products ?? []).map((p) => nopListProductToMarketplace(p)),
    pageNumber: res.paging_filtering_context?.page_number ?? pageNumber,
    hasNextPage: res.paging_filtering_context?.has_next_page ?? false,
  };
}

// ─── PDP: specs + reviews ────────────────────────────────
export type ProductSpec = { label: string; value: string };
export type ProductSpecGroup = { name: string | null; specs: ProductSpec[] };
export type ProductReviewSummary = { average: number; total: number };

export type ProductDetailResult = {
  product: MarketplaceProduct;
  specs: ProductSpecGroup[];
  review: ProductReviewSummary | null;
};

/** Flatten product_specification.groups[].attributes[].values[] → plain text rows. */
export function nopSpecsToGroups(d: NopProductDetails): ProductSpecGroup[] {
  const groups = d.product_specification?.groups ?? [];
  return groups
    .map((g) => ({
      name: g.name,
      specs: (g.attributes ?? [])
        .map((attr) => ({
          label: attr.name,
          value: (attr.values ?? [])
            .map((v) => stripHtml(v.value_raw))
            .filter(Boolean)
            .join(', '),
        }))
        .filter((s) => s.label && s.value),
    }))
    .filter((g) => g.specs.length > 0);
}

function nopReviewSummary(d: NopProductDetails): ProductReviewSummary | null {
  const r = d.product_review_overview;
  if (!r || !r.total_reviews) return null;
  return {
    average: r.rating_sum / r.total_reviews,
    total: r.total_reviews,
  };
}

/** Full PDP payload: mapped product + spec sheet + review summary. */
export async function fetchProductDetail(
  productId: number,
): Promise<ProductDetailResult | null> {
  const res = await getProductDetails(productId);
  if (!res?.product_details) return null;
  const d = res.product_details;
  return {
    product: nopProductDetailsToMarketplace(d),
    specs: nopSpecsToGroups(d),
    review: nopReviewSummary(d),
  };
}

// ─── Home hero banners (sliders) ─────────────────────────
export type HomeBannerSlide = {
  imageUrl: string;
  /** Bare slug from the CMS (e.g. "/rovra"); null when the slide has no link. */
  slug: string | null;
  /** Resolved in-app route, or null when not routable in-app (e.g. a CMS topic). */
  route: string | null;
};

/** First available breakpoint's custom field value (slides key fields by breakpoint). */
function slideField(item: NopSlideItem, field: 'Picture' | 'Link'): string | null {
  for (const bp of Object.values(item.custom_fields ?? {})) {
    const v = bp?.[field]?.value;
    if (v) return v;
  }
  return null;
}

async function resolveSlugRoute(slug: string | null): Promise<string | null> {
  if (!slug) return null;
  try {
    const rec = await bySlug(slug);
    if (!rec.is_active) return null;
    switch (rec.entity_name) {
      case 'Product':
        return `/marketplace/product/${rec.entity_id}`;
      case 'Category':
        return `/marketplace/category/${slug.replace(/^\//, '')}`;
      case 'Manufacturer':
        return `/marketplace/brand/${slug.replace(/^\//, '')}`;
      default:
        return null; // Topic / unknown → not routable in-app
    }
  } catch {
    return null;
  }
}

/**
 * Hero carousel slides from the 'home_page_top' slider zone (guide §7a), with each
 * CMS slug resolved to an in-app route (guide §8). Slides with no image are dropped.
 */
export async function fetchHomeBanners(): Promise<HomeBannerSlide[]> {
  const content = await getHomepageContent(['home_page_top']);
  const zone = content.sliders?.home_page_top ?? [];
  const items: NopSlideItem[] = zone.flatMap((s) => s.items ?? []);
  const slides = items
    .map((it) => ({ imageUrl: slideField(it, 'Picture'), slug: slideField(it, 'Link') }))
    .filter((s): s is { imageUrl: string; slug: string | null } => !!s.imageUrl);
  const routes = await Promise.all(slides.map((s) => resolveSlugRoute(s.slug)));
  return slides.map((s, i) => ({ ...s, route: routes[i] }));
}

export { getStories };

export type SearchResultItem = {
  entity_type: NopAutoCompleteItem['entity_type'];
  entity_id: number;
  label: string;
  image_url: string | null;
};

/** Autocomplete results, bold-stripped and stripped of header rows (guide §5). */
export async function searchAutocomplete(
  term: string,
): Promise<SearchResultItem[]> {
  const res = await autoComplete(term);
  return (res.items ?? [])
    .filter((i) => !i.is_header && i.entity_type !== 'Header')
    .map((i) => ({
      entity_type: i.entity_type,
      entity_id: i.entity_id,
      label: stripBold(i.suggestion_text || i.term || i.entity_name) || '',
      image_url: i.product_picture_url,
    }))
    .filter((i) => i.label.length > 0);
}

export { bySlug };
