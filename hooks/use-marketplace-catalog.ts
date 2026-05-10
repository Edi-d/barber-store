/**
 * useMarketplaceCatalog — feeds the marketplace browse UI.
 *
 * TEST MODE: reads products + categories directly from data/products.json
 * (the local barber-store.ro feed) instead of Supabase. Switch to DB mode
 * by setting USE_LOCAL_FEED to false — the original Supabase fetcher is
 * preserved below in fetchFromSupabase().
 */

import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import productsFeed from '@/data/products.json';
import { CATEGORY_LABELS } from '@/data/types';

// `true` → load 2,752 products from data/products.json (scraped barber-store.ro feed).
// `false` → fetch from shared Supabase `marketplace_products` table (currently empty).
// Flip to `false` once the marketplace_products table is seeded in Supabase.
const USE_LOCAL_FEED = true;

// ─── Types ──────────────────────────────────────────────
export type MarketplaceSection = 'professional' | 'consumer';

export type MarketplaceProduct = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  brand: string | null;
  price_cents: number;
  /** Manufacturer's recommended retail price (PRP). NULL when unset. */
  prp_cents: number | null;
  /** Old/list price ("compare at"). Renders as a struck-through line
   *  on the product card when present and greater than `price_cents`. */
  compare_at_price_cents: number | null;
  stock_qty: number;
  images: string[] | null;
  section: MarketplaceSection;
  is_active: boolean;
  category_id: string | null;
  /** Used by the "NOU" badge — products created within ~30 days. */
  created_at: string | null;
};

export type MarketplaceCategory = {
  id: string;
  section: MarketplaceSection;
  /** Parent category id when this is a subcategory; NULL for top-level. */
  parent_id: string | null;
  slug: string;
  title_ro: string;
  sort_order: number;
  /** Curated tile image (~256x256). NULL → app renders a Feather icon
   *  on a tinted circle as fallback. */
  image_url: string | null;
};

export type MarketplaceBrand = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  is_featured: boolean;
  sort_order: number;
};

type State = {
  products: MarketplaceProduct[];
  categories: MarketplaceCategory[];
  brands: MarketplaceBrand[];
  loading: boolean;
  error: string | null;
};

export type UseMarketplaceCatalogReturn = State & {
  refetch: () => Promise<void>;
};

/** Normalize the `images` column (JSONB) to a clean string[]. */
function normalizeImages(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === 'string' && v.length > 0);
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((v): v is string => typeof v === 'string')
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

// ─── Local feed adapter ──────────────────────────────────
// Maps the file-based barber-store.ro feed onto the MarketplaceProduct shape
// the UI expects. Product `id` is the SKU (no DB UUID). Category `id` is the
// raw category slug.
//
// Section mapping: consumer-facing categories (wax, shampoo, fragrance, etc.)
// are exposed under BOTH 'professional' and 'consumer' so a salon owner sees
// them in their pro view, AND end clients see them in consumer. Pro-only
// categories (clippers, scissors, chairs, furniture) stay professional-only.

type FeedProduct = {
  sku: string;
  name: string;
  description: string;
  brand: string;
  category: string;
  images: string[];
  inStock: boolean;
  retailPrice: number;
  partnerPrice: number;
};

type FeedShape = { products: FeedProduct[] };

// Categories that end users (consumers) can buy directly.
const CONSUMER_CATEGORIES = new Set<string>([
  'wax', 'cream', 'gel', 'spray', 'powder',           // styling
  'shampoo', 'care',                                   // hair care
  'aftershave', 'fragrance',                           // finishing
  'grooming', 'shaving', 'hygiene',                    // body grooming
  'combs', 'brushes', 'accessories',                   // small accessories
]);

function feedToProducts(): MarketplaceProduct[] {
  const all = ((productsFeed as unknown as FeedShape).products ?? []) as FeedProduct[];
  const out: MarketplaceProduct[] = [];
  let idx = 0;
  for (const p of all) {
    if (!p.sku || !p.name || !p.partnerPrice || p.partnerPrice <= 0) continue;
    out.push({
      id: p.sku,
      sku: p.sku,
      name: p.name,
      description: p.description ?? null,
      brand: p.brand ?? null,
      price_cents: Math.round(p.partnerPrice * 100),
      // Local feed has no PRP / compare-at price columns yet; future
      // imports from the barber-store.ro catalog will populate them.
      prp_cents: null,
      compare_at_price_cents: null,
      stock_qty: p.inStock ? 50 : 0,
      images: Array.isArray(p.images) ? p.images.filter((u) => typeof u === 'string') : [],
      // Pro-section sees everything (saloons buy any product). Consumer sees
      // only the consumer-friendly subset.
      section: 'professional',
      is_active: true,
      category_id: p.category ?? null,
      // Use SKU index for deterministic ordering in the "Produse noi" section.
      // The local feed has no created_at column; each product gets a synthetic
      // date spaced one day apart so the sort in the home screen works correctly.
      created_at: new Date(2024, 0, idx + 1).toISOString(),
    });
    idx++;
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'ro'));
  return out;
}

function feedToCategories(section: MarketplaceSection): MarketplaceCategory[] {
  const all = ((productsFeed as unknown as FeedShape).products ?? []) as FeedProduct[];
  const distinct = new Set<string>();
  for (const p of all) {
    if (!p.category) continue;
    // Consumer view only shows categories whitelisted as consumer-friendly.
    if (section === 'consumer' && !CONSUMER_CATEGORIES.has(p.category)) continue;
    distinct.add(p.category);
  }
  return Array.from(distinct)
    .sort()
    .map((slug, idx) => ({
      id: slug,
      section,
      parent_id: null,
      slug,
      title_ro: CATEGORY_LABELS[slug] ?? slug,
      sort_order: (idx + 1) * 10,
      image_url: null,
    }));
}

function feedToBrands(): MarketplaceBrand[] {
  const all = ((productsFeed as unknown as FeedShape).products ?? []) as FeedProduct[];
  const brandSet = new Set<string>();
  for (const p of all) {
    if (p.brand && p.brand.trim()) brandSet.add(p.brand.trim());
  }
  return Array.from(brandSet)
    .sort()
    .map((name, i) => ({
      id: `local-brand-${i}`,
      slug: name.toLowerCase().replace(/\s+/g, '-'),
      name,
      logo_url: null,
      // First 8 alphabetical brands are featured in the home-screen row.
      is_featured: i < 8,
      sort_order: i,
    }));
}

// Cache parsed feed once per module load — JSON is large.
let cachedProducts: MarketplaceProduct[] | null = null;
let cachedProCategories: MarketplaceCategory[] | null = null;
let cachedConsumerCategories: MarketplaceCategory[] | null = null;
let cachedBrands: MarketplaceBrand[] | null = null;

function getLocalProducts(): MarketplaceProduct[] {
  if (cachedProducts === null) cachedProducts = feedToProducts();
  return cachedProducts;
}

function getLocalCategories(section: MarketplaceSection): MarketplaceCategory[] {
  if (section === 'consumer') {
    if (cachedConsumerCategories === null) cachedConsumerCategories = feedToCategories('consumer');
    return cachedConsumerCategories;
  }
  if (cachedProCategories === null) cachedProCategories = feedToCategories('professional');
  return cachedProCategories;
}

function getLocalBrands(): MarketplaceBrand[] {
  if (cachedBrands === null) cachedBrands = feedToBrands();
  return cachedBrands;
}

export function useMarketplaceCatalog(
  section?: MarketplaceSection,
  categoryId?: string | null,
): UseMarketplaceCatalogReturn {
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [brands, setBrands] = useState<MarketplaceBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFromLocalFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const targetSection: MarketplaceSection = section ?? 'professional';
      let allProducts = getLocalProducts();
      const allCategories = getLocalCategories(targetSection);

      // Consumer section: filter to only consumer-friendly categories.
      if (targetSection === 'consumer') {
        allProducts = allProducts.filter(
          (p) => p.category_id && CONSUMER_CATEGORIES.has(p.category_id),
        );
      }
      if (categoryId) {
        allProducts = allProducts.filter((p) => p.category_id === categoryId);
      }

      setProducts(allProducts);
      setCategories(allCategories);
      setBrands(getLocalBrands());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[useMarketplaceCatalog:local]', msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [section, categoryId]);

  const fetchFromSupabase = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // ── Products ──────────────────────────────────────
      let productQuery = supabase
        .from('marketplace_products')
        .select(
          'id, sku, name, description, brand, price_cents, prp_cents, compare_at_price_cents, stock_qty, images, section, is_active, category_id, created_at',
        )
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (section) productQuery = productQuery.eq('section', section);
      if (categoryId) productQuery = productQuery.eq('category_id', categoryId);

      const { data: productsData, error: productsErr } = await productQuery;
      if (productsErr) throw productsErr;

      const normalizedProducts: MarketplaceProduct[] = (productsData ?? []).map(
        (p: any) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          description: p.description ?? null,
          brand: p.brand ?? null,
          price_cents: Number(p.price_cents) || 0,
          prp_cents: p.prp_cents != null ? Number(p.prp_cents) : null,
          compare_at_price_cents:
            p.compare_at_price_cents != null ? Number(p.compare_at_price_cents) : null,
          stock_qty: Number(p.stock_qty) || 0,
          images: normalizeImages(p.images),
          section: p.section as MarketplaceSection,
          is_active: Boolean(p.is_active),
          category_id: p.category_id ?? null,
          created_at: p.created_at ?? null,
        }),
      );

      // ── Categories ────────────────────────────────────
      let categoryQuery = supabase
        .from('marketplace_categories')
        .select('id, section, parent_id, slug, title_ro, sort_order, image_url')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (section) categoryQuery = categoryQuery.eq('section', section);

      // ── Brands ────────────────────────────────────────
      // Brands are NOT section-scoped — they're shared across the whole
      // shop and used purely for the home-screen showcase row. Fetched
      // in parallel with the other queries to keep latency low.
      const brandQuery = supabase
        .from('marketplace_brands')
        .select('id, slug, name, logo_url, is_featured, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      const [{ data: categoriesData, error: categoriesErr }, { data: brandsData, error: brandsErr }] =
        await Promise.all([categoryQuery, brandQuery]);
      if (categoriesErr) throw categoriesErr;
      if (brandsErr) {
        // Brands table may not exist on older deployments — degrade
        // gracefully (the home screen just hides the brands row).
        console.warn('[useMarketplaceCatalog] brands fetch:', brandsErr.message);
      }

      setProducts(normalizedProducts);
      setCategories(
        ((categoriesData ?? []) as MarketplaceCategory[]).map((c) => ({
          ...c,
          sort_order: Number(c.sort_order) || 0,
        })),
      );
      setBrands(
        ((brandsData ?? []) as MarketplaceBrand[]).map((b) => ({
          ...b,
          sort_order: Number(b.sort_order) || 0,
        })),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[useMarketplaceCatalog]', msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [section, categoryId]);

  const fetchCatalog = USE_LOCAL_FEED ? fetchFromLocalFeed : fetchFromSupabase;

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  return {
    products,
    categories,
    brands,
    loading,
    error,
    refetch: fetchCatalog,
  };
}
