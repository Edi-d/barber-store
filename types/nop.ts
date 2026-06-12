/**
 * nopCommerce storefront ("Public") API response types.
 *
 * Hand-written from the live staging API (barber-staging.ecomdigitalservers.ro)
 * and nop-api-integration-guide.md. Payloads are snake_case. Only the fields the
 * app actually consumes are typed; everything else is left loose. See
 * lib/nop-client.ts (transport) and lib/nop-catalog.ts (adapters → MarketplaceProduct).
 */

// ─── Common ──────────────────────────────────────────────
export type NopPicture = {
  image_url: string | null;
  thumb_image_url: string | null;
  full_size_image_url: string | null;
  title?: string | null;
  alternate_text?: string | null;
};

/** Standard error envelope (guide §3.4). */
export type NopError = {
  code?: string;
  message?: string;
  data?: unknown;
};

// ─── Auth ────────────────────────────────────────────────
export type NopGuestTokenResponse = {
  token: string;
  customer_guid: string;
  customer_id: number;
  currency_code: string | null;
  language_culture: string | null;
  email: string | null;
  username: string | null;
};

// ─── Catalog: categories ─────────────────────────────────
export type NopCategory = {
  id: number;
  name: string;
  se_name: string;
  description: string | null;
  picture: NopPicture | null;
  sub_categories?: NopCategory[];
};

// ─── Catalog: prices ─────────────────────────────────────
export type NopProductPrice = {
  /** Current price as a float in major units (lei). */
  price_value: number | null;
  /** Old/list ("compare at") price. */
  old_price_value: number | null;
  /** Manufacturer recommended retail price (PDP only; null in list). */
  prp_value: number | null;
  currency_code?: string | null;
  /** true → product is not buyable (out of stock / unavailable). */
  disable_buy_button?: boolean;
};

// ─── Catalog: list product (GetCategoryProducts / GetFilteredProducts) ──
export type NopListProduct = {
  id: number;
  name: string;
  sku: string | null;
  se_name: string | null;
  short_description: string | null;
  full_description: string | null;
  mark_as_new: boolean;
  product_price: NopProductPrice;
  pictures: NopPicture[];
  review_overview?: NopReviewOverview | null;
  stock_availability_css_class?: string | null;
  badges?: unknown[];
};

export type NopReviewOverview = {
  product_id: number;
  rating_sum: number;
  total_reviews: number;
  allow_customer_reviews?: boolean;
};

/** GetCategoryProducts → catalog_products (also the paging shape). */
export type NopCatalogProducts = {
  products: NopListProduct[];
  page_number: number;
  page_size: number;
  page_index: number;
  total_items: number;
  total_pages: number;
  has_next_page: boolean;
  has_previous_page: boolean;
};

export type NopGetCategoryProductsResponse = {
  template_view_path?: string;
  catalog_products: NopCatalogProducts;
};

// ─── Catalog: filtered products (AjaxFiltersApi) ─────────
export type NopPagingFilteringContext = {
  page_number: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  has_next_page: boolean;
  has_previous_page: boolean;
};

export type NopGetFilteredProductsResponse = {
  products: NopListProduct[];
  total_count: number;
  paging_filtering_context: NopPagingFilteringContext;
};

/** Body for POST GetFilteredProducts (snake_case). manufacturer_id is SINGULAR. */
export type NopFilteredProductsBody = {
  category_id?: number;
  manufacturer_id?: number;
  price_from?: number;
  price_to?: number;
  in_stock?: boolean;
  order_by?: number;
  page_number?: number;
  page_size?: number;
};

// ─── Catalog: filter options ─────────────────────────────
export type NopManufacturerFilterItem = {
  /** This id IS the manufacturer_id used by GetFilteredProducts. */
  id: number;
  name: string;
  filter_item_state?: string;
};

export type NopGetFilterOptionsResponse = {
  manufacturer_filter?: {
    category_id: number;
    vendor_id: number;
    manufacturer_filter_items: NopManufacturerFilterItem[];
  };
  price_range_filter?: unknown;
  specification_filter?: unknown;
  in_stock_filter?: unknown;
  on_sale_filter?: unknown;
};

// ─── Product detail (PDP) ────────────────────────────────
export type NopProductManufacturer = {
  name: string;
  se_name: string;
  picture?: NopPicture | null;
};

export type NopProductDetails = {
  id: number;
  name: string;
  sku: string | null;
  se_name: string | null;
  short_description: string | null;
  full_description: string | null;
  product_price: NopProductPrice;
  default_picture: NopPicture | null;
  picture_models: NopPicture[];
  in_stock: boolean;
  stock_availability: string | null;
  product_manufacturers?: NopProductManufacturer[];
  product_review_overview?: NopReviewOverview | null;
  product_specification?: NopProductSpecification | null;
  is_new?: boolean;
};

export type NopGetProductDetailsResponse = {
  product_details: NopProductDetails;
};

// ─── Search (autocomplete) ───────────────────────────────
export type NopAutoCompleteEntityType =
  | 'Header'
  | 'Product'
  | 'Category'
  | 'Manufacturer'
  | 'Tag';

export type NopAutoCompleteItem = {
  term: string | null;
  suggestion_text: string | null;
  product_picture_url: string | null;
  entity_type: NopAutoCompleteEntityType;
  entity_name: string | null;
  entity_id: number;
  is_header: boolean;
};

export type NopAutoCompleteResponse = {
  items: NopAutoCompleteItem[];
};

// ─── Product specification (spec sheet) ──────────────────
export type NopSpecificationValue = {
  /** May contain HTML — strip before rendering as plain text (guide §11). */
  value_raw: string | null;
  color_squares_rgb?: string | null;
  attribute_type_id?: number;
};

export type NopSpecificationAttribute = {
  id: number;
  name: string;
  values: NopSpecificationValue[];
};

export type NopSpecificationGroup = {
  id: number;
  name: string | null;
  attributes: NopSpecificationAttribute[];
};

export type NopProductSpecification = {
  groups: NopSpecificationGroup[];
};

// ─── Home content: sliders ───────────────────────────────
/**
 * A slide item's custom_fields are keyed by breakpoint name (often "") and carry
 * { Picture: { value }, Link: { value } }. We read the first available breakpoint.
 */
export type NopSlideCustomField = {
  value: string | null;
};

export type NopSlideItem = {
  name: string | null;
  custom_fields: Record<string, Record<string, NopSlideCustomField | undefined>>;
};

export type NopSlider = {
  name: string | null;
  items: NopSlideItem[];
};

export type NopHomepageContentResponse = {
  sliders: Record<string, NopSlider[]>;
  cards?: unknown;
};

/** Body for POST GetHomepageContent. slide_widget_zones MUST be non-null (else 500). */
export type NopHomepageContentBody = {
  slide_widget_zones: string[];
  cards_widget_zones: string[];
  slide_picture_size: number;
};

// ─── Home content: stories ───────────────────────────────
export type NopStory = {
  id: number;
  picture_url: string | null;
  /** What the story links to: 1 = Product (verified). entity_id is that record's id. */
  entity_type_id: number;
  entity_id: number;
  /** Usually null in this CMS — the link comes from entity_type_id/entity_id instead. */
  target_url: string | null;
  action_type_id: number;
  published: boolean;
  display_order: number;
  /** Hex CTA colors supplied by the CMS (e.g. '#E79C50'); may be absent. */
  button_color?: string | null;
  text_color?: string | null;
};

export type NopStoriesResponse = {
  running_period: unknown;
  stories: NopStory[];
};

// ─── Checkout: shipping methods ──────────────────────────
/**
 * One courier / shipping option from GetShippingMethodInfos. This endpoint is
 * cart-independent — it lists every configured method with its logo and flat fee.
 * shipping_price is a float in major units (lei); 0 = free (e.g. in-store pickup).
 */
export type NopShippingMethodInfo = {
  id: number;
  shipping_method_system_name: string | null;
  display_name: string | null;
  /** Courier logo, sized by the request's pictureSize param. */
  picture_url: string | null;
  shipping_price: number;
  is_pickup_point: boolean;
  show_on_product_page: boolean;
  display_order: number;
};

export type NopGetShippingMethodInfosResponse = {
  shipping_method_infos: NopShippingMethodInfo[];
  custom_properties: unknown;
};

// ─── Slug → entity resolution ────────────────────────────
export type NopUrlRecord = {
  /** The resolved entity's id (manufacturer_id / category id / product id). */
  entity_id: number;
  entity_name: 'Product' | 'Category' | 'Manufacturer' | 'Topic' | string;
  slug: string;
  is_active: boolean;
};
