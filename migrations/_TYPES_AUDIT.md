# Supabase Type Definitions Audit
**Date:** 2026-05-11
**Scope:** `/types/database.ts` vs 140 Tapzi-barber migrations being merged

---

## 1. Type File Location and Generation Approach

**File:** `/types/database.ts` (20 782 bytes, 808 lines)
**Generation approach:** Handwritten — not generated via `npx supabase gen types typescript`.

Evidence: The file uses `export interface` declarations (handwritten style) rather than the
auto-generated `Database["public"]["Tables"][...]["Row"]` pattern for domain tables. Only the
first 17 tables (`profiles`, `content`, `likes`, etc.) are inside the typed `Database.Tables`
namespace; the remaining ~21 table types live as standalone `export interface` blocks that are
**not wired into the Supabase client generic** (`SupabaseClient<Database>`). This means most
domain types receive no query-level type-safety from the client.

**No Supabase CLI config found** (`/supabase/config.toml` does not exist). The CLI is not
installed in the project environment. Regen requires installing it.

---

## 2. New Tables from Incoming Migrations vs Type Definitions

Migrations introduce **129 unique tables** total. The table below covers the subset most
relevant to recent feature work (migrations 026–140).

| new_table_name | has_type | example column |
|---|---|---|
| `stories` | NO | `media_url TEXT NOT NULL` |
| `story_views` | NO | `viewer_id UUID` |
| `loyalty_settings` | NO | `points_per_ron INT` |
| `loyalty_profiles` | NO | `current_points INT` |
| `loyalty_vouchers` | NO | `status TEXT ('active'\|'used'\|'expired')` |
| `loyalty_tiers` | NO | `tier TEXT` |
| `loyalty_streaks` | NO | `streak_count INT` |
| `loyalty_events` | NO | `event_type TEXT` |
| `point_transactions` | NO | `points INT NOT NULL` |
| `rewards_catalog` | NO | `points_cost INT` |
| `salon_consumables` | NO | `current_stock NUMERIC(10,2)` |
| `consumable_stock_logs` | NO | `change_qty NUMERIC` |
| `consumable_service_usage` | NO | `quantity_used NUMERIC` |
| `user_platform_xp` | NO | `current_points INT` |
| `platform_xp_transactions` | YES (interface) | `balance_after number` |
| `xp_level_thresholds` | YES (interface) | `xp_required number` |
| `xp_voucher_tiers` | YES (interface) | `voucher_value_cents number` |
| `user_shop_xp` | NO | `current_xp INT` |
| `shop_xp_transactions` | NO | `xp_delta INT` |
| `shop_xp_config` | NO | `xp_per_ron_cents INT` |
| `salon_marketplace_wallet` | NO | `balance_cents INT` |
| `salon_marketplace_credit_ledger` | NO | `amount_cents INT` |
| `marketplace_sections` | NO | `code TEXT PRIMARY KEY` |
| `marketplace_categories` | NO | `name TEXT` |
| `marketplace_brands` | NO | `name TEXT UNIQUE` |
| `marketplace_products` | NO | `sku TEXT UNIQUE` |
| `marketplace_orders` | NO | `order_number TEXT UNIQUE` |
| `marketplace_order_items` | NO | `qty INT` |
| `marketplace_order_returns` | NO | `reason TEXT` |
| `marketplace_order_status_history` | NO | `status TEXT` |
| `marketplace_shipments` | NO | `tracking_number TEXT` |
| `marketplace_product_images` | NO | `url TEXT` |
| `marketplace_product_variants` | NO | `sku TEXT` |
| `marketplace_product_bundles` | NO | `name TEXT` |
| `marketplace_product_pricing_tiers` | NO | `min_qty INT` |
| `marketplace_recurring_lists` | NO | `salon_id UUID` |
| `marketplace_recurring_list_items` | NO | `qty INT` |
| `marketplace_stock_notifications` | NO | `notified_at TIMESTAMPTZ` |
| `salon_billing_details` | NO | `fiscal_code TEXT` |
| `salon_members` | NO | `profile_id UUID` |
| `notifications` | YES (interface) | `type TEXT` |
| `trending_topics` | YES (interface) | `post_count number` |
| `hashtags` | YES (interface) | `post_count number` |
| `content_hashtags` | YES (interface) | `hashtag_id string` |
| `comment_likes` | YES (interface) | `comment_id string` |
| `comment_reactions` | YES (interface) | `reaction string` |
| `salon_consumables` | NO | `current_stock NUMERIC` |
| `plans` | NO | `name TEXT` |
| `subscriptions` | NO | `status TEXT` |
| `push_tokens` | NO | `token TEXT` |
| `user_notification_prefs` | NO | `push_enabled BOOLEAN` |
| `salon_invites` | NO | `role TEXT` |
| `feature_flags` | NO | `enabled BOOLEAN` |

**Note:** Three XP types exist as standalone interfaces (`PlatformXpTransaction`,
`XpLevelThreshold`, `XpVoucherTier`) but are **not** registered inside `Database.Tables`, so
Supabase client queries against them are not type-checked.

---

## 3. Code References to New Tables

Grep across `app/`, `lib/`, `hooks/`, `stores/`, `components/`:

### Loyalty / XP

| file:line | table |
|---|---|
| `lib/loyalty.ts:26,36,67` | `platform_xp_transactions` |
| `lib/loyalty.ts:79` | `xp_level_thresholds` |
| `lib/loyalty.ts:88` | `xp_voucher_tiers` |
| `hooks/useLoyaltyNotifications.ts:46` | `platform_xp_transactions` |
| `hooks/use-shop-xp.ts:142` | `user_shop_xp` |
| `hooks/use-shop-xp.ts:148` | `xp_level_thresholds` |
| `app/marketplace/cart.tsx:275` | `loyalty_vouchers` |

### Stories / Lives

| file:line | table |
|---|---|
| `lib/stories.ts:23` | `stories` |
| `hooks/useStories.ts:58` | `story_views` |
| `hooks/useRealtimeLives.ts:39,65` | `lives` |
| `app/live/[id].tsx:357` | `lives` |

### Marketplace

| file:line | table |
|---|---|
| `hooks/use-marketplace-catalog.ts:279` | `marketplace_products` |
| `hooks/use-marketplace-catalog.ts:314` | `marketplace_categories` |
| `hooks/use-marketplace-catalog.ts:326` | `marketplace_brands` |
| `hooks/use-salon-orders.ts:69` | `marketplace_salon_order_summary` (VIEW) |
| `hooks/use-salon-orders.ts:88,104` | `marketplace_order_items`, `marketplace_products` |
| `hooks/use-recurring-list.ts:72,95,151,165` | `marketplace_recurring_lists`, `marketplace_recurring_list_items` |
| `hooks/use-stock-notifications.ts:38,60,75` | `marketplace_stock_notifications` |
| `hooks/use-tier-pricing.ts:58` | `marketplace_product_pricing_tiers` |
| `app/marketplace/order/[id].tsx:154,161,210` | `marketplace_orders`, `marketplace_order_items`, `marketplace_products` |
| `app/marketplace/product/[id].tsx:189` | `marketplace_products` |
| `app/marketplace/spending.tsx:74` | `marketplace_products` |
| `app/marketplace/orders.tsx:90` | `salon_members` |

### Social (Hashtags / Comments)

| file:line | table |
|---|---|
| `hooks/useHashtagPosts.ts:20,32,50` | `hashtags`, `content_hashtags`, `content` |
| `hooks/useCommentReactions.ts:27,72,81,220,227` | `comment_reactions`, `comment_likes` |
| `hooks/useTrendingTopics.ts:11` | `trending_topics` |
| `stores/notificationStore.ts:119,159` | `notifications` |

### Billing

| file:line | table |
|---|---|
| `hooks/use-default-salon-billing.ts:106,157,169,217,229,266` | `salon_billing_details` |
| `hooks/use-salon-billing-details.ts:106,157,169,217,229,266` | `salon_billing_details` |

### Ghost / Missing Tables

| file:line | table | issue |
|---|---|---|
| `app/profile/[id].tsx:213` | `services` | No such table or view in migrations — likely should be `barber_services`. Runtime 404/error. |
| `app/support.tsx:352,364` | `support_tickets` | No migration creates this table. Will silently fail at runtime. |
| `hooks/useHairstyleTryon.ts:19` | `api_usage_logs` | No migration creates this table. Will silently fail at runtime. |

---

## 4. Schema vs Code Drift Summary

### Code AHEAD of types (code uses table, type missing — type-safety gap)

19 tables used in active code have no type definition:

1. `stories` — used in `lib/stories.ts` (selects `duration_ms`, `thumbnail_url` added in migration 033)
2. `story_views` — used in `hooks/useStories.ts`
3. `loyalty_vouchers` — used in `app/marketplace/cart.tsx`
4. `user_shop_xp` — used in `hooks/use-shop-xp.ts`
5. `marketplace_products` — used in 5+ files
6. `marketplace_orders` — used in `app/marketplace/order/[id].tsx`
7. `marketplace_order_items` — used in `hooks/use-salon-orders.ts`
8. `marketplace_categories` — used in `hooks/use-marketplace-catalog.ts`
9. `marketplace_brands` — used in `hooks/use-marketplace-catalog.ts`
10. `marketplace_recurring_lists` — used in `hooks/use-recurring-list.ts`
11. `marketplace_recurring_list_items` — used in `hooks/use-recurring-list.ts`
12. `marketplace_stock_notifications` — used in `hooks/use-stock-notifications.ts`
13. `marketplace_product_pricing_tiers` — used in `hooks/use-tier-pricing.ts`
14. `salon_billing_details` — used in 2 hooks, 12 call sites
15. `salon_members` — used in `app/marketplace/orders.tsx`, `hooks/useSalonContext.ts`
16. `api_usage_logs` — used in `hooks/useHairstyleTryon.ts` (ghost table — no migration)
17. `support_tickets` — used in `app/support.tsx` (ghost table — no migration)
18. `services` — used in `app/profile/[id].tsx` (ghost table — probably `barber_services`)
19. `marketplace_salon_order_summary` — is a VIEW (no table), used in `hooks/use-salon-orders.ts`

### Types AHEAD of code (type exists, nothing uses it — dead types)

4 tables are typed but have zero code references:

- `course_modules` (in `Database.Tables`)
- `reports` (in `Database.Tables`)
- `blocks` (in `Database.Tables`)
- `events` (in `Database.Tables`)

### In sync

The following are both typed (as standalone interfaces) and actively used:
`salons`, `barbers`, `barber_services`, `appointments`, `appointment_services`,
`barber_availability`, `follows`, `salon_reviews`, `salon_favorites`, `salon_happy_hours`,
`salon_photos`, `trending_topics`, `comment_likes`, `hashtags`, `content_hashtags`,
`comment_reactions`, `notifications`, `platform_xp_transactions`, `xp_level_thresholds`,
`xp_voucher_tiers`.

---

## 5. Type Completeness

| metric | value |
|---|---|
| Total schema tables in migrations | 129 |
| Active tables referenced in code | 50 |
| Of those 50, have a type definition | 31 |
| Type completeness (active tables) | **62%** |
| Ghost table references in code | 3 (`services`, `support_tickets`, `api_usage_logs`) |
| Tables typed in Database.Tables namespace | 17 |
| Standalone interfaces covering tables | 21 |
| Tables typed in Database.Tables namespace (type-safe on client) | 17 / 129 = **13%** |

---

## 6. Top 5 Missing Types (Priority Order)

1. **`marketplace_products`** — Used in 5+ files across marketplace feature. Core commerce entity. Example columns: `id UUID, sku TEXT, name TEXT, price_cents INT, stock_qty INT, images JSONB, is_active BOOL`.

2. **`marketplace_orders` + `marketplace_order_items`** — Order lifecycle is tracked throughout `app/marketplace/`. Without types, every order query is `any`. Example: `order_number TEXT, total_cents INT, status TEXT, buyer_user_id UUID`.

3. **`stories` + `story_views`** — Actively queried in `lib/stories.ts` and `hooks/useStories.ts`. The type in `lib/stories.ts` is locally defined as `StoryItem` — it includes `duration_ms` and `thumbnail_url` (added by migration 033) which are not reflected anywhere in `types/database.ts`. Risk of column mismatch.

4. **`salon_billing_details`** — 12 call sites across 2 hooks. High-risk for silent `undefined` when columns (e.g. `fiscal_code`, `is_vat_payer`, `efactura_enabled`) change. Fully defined in migration 113.

5. **`loyalty_vouchers`** — Used in checkout flow (`app/marketplace/cart.tsx`). Columns: `code TEXT, status TEXT, points_spent INT, expires_at TIMESTAMPTZ, used_at TIMESTAMPTZ`. Missing type means discount application code has no compile-time guard.

---

## 7. Recommended Next Step

**Regenerate types via Supabase CLI** — do not hand-maintain this file further.

Prerequisites:
1. Install the Supabase CLI: `brew install supabase/tap/supabase`
2. Ensure `supabase/config.toml` exists: `npx supabase init` (one-time)
3. Link to the project: `npx supabase link --project-ref <PROJECT_REF>`

Regeneration command:
```bash
npx supabase gen types typescript --linked --schema public \
  > types/database.ts
```

After regen:
- Replace all standalone `export interface Salon { ... }` etc. with `type Salon = Database["public"]["Tables"]["salons"]["Row"]` aliases.
- Pass `Database` generic to the Supabase client in `lib/supabase.ts`:
  `createClient<Database>(url, key)` — this makes all `from('table_name')` calls type-checked.
- Fix the three ghost table references:
  - `from('services')` in `app/profile/[id].tsx` → rename to `from('barber_services')`
  - `from('support_tickets')` in `app/support.tsx` → create migration or remove
  - `from('api_usage_logs')` in `hooks/useHairstyleTryon.ts` → create migration or remove

If CLI access is not available (CI/CD environment without Supabase project access), prioritize
hand-writing types for items 1–5 above, in that order, inserting them into `Database.Tables`
(not as standalone interfaces) so the Supabase client benefits from type inference.
